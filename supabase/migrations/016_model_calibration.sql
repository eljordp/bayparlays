-- The actual learning loop. Until now the AI was a static scoring system —
-- hand-tuned constants, Elo ratings, form adjustments — but no feedback from
-- whether its predictions actually matched reality.
--
-- This migration adds:
--   1. model_calibration — stores per-sport calibration factors. After every
--      run of the calibration job, a fresh row gets inserted with the actual
--      hit rate vs predicted hit rate. /api/parlays reads the latest row per
--      sport and scales its combinedProb estimate accordingly.
--   2. leg_results — per-leg outcomes on resolved parlays. Aggregate counts
--      (legs_won/legs_lost) tell us totals; this jsonb tells us WHICH legs
--      hit, so v2 calibration can do per-market and per-leg calibration
--      instead of just parlay-level.

CREATE TABLE IF NOT EXISTS model_calibration (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  computed_at timestamptz NOT NULL DEFAULT now(),

  -- Scope of this calibration row. NULLs mean "all" — e.g. sport=NULL is the
  -- global calibration across every sport, sport='MLB' market=NULL is MLB
  -- across all markets. Lookups in /api/parlays cascade most-specific first.
  sport text,
  market text,

  -- How many resolved parlays/legs this row was computed from. Confidence in
  -- the calibration scales with sample size; we shrink toward 1.0 below ~100.
  sample_size integer NOT NULL,

  -- The actual numbers
  predicted_prob_avg numeric NOT NULL,
  actual_hit_rate numeric NOT NULL,

  -- Adjustment to apply: multiply ourProb by this factor. Bayesian-shrunk
  -- toward 1.0 when sample is small so brand-new sports don't get massive
  -- swings off 5 bets of luck.
  calibration_factor numeric NOT NULL,

  -- Free-form notes from the calibration script (e.g. "Shrunk by 60% (n=40)")
  notes text
);

CREATE INDEX IF NOT EXISTS idx_calibration_lookup
  ON model_calibration(sport, market, computed_at DESC);

-- Per-leg outcomes on resolved parlays. The resolver populates this on every
-- new resolve going forward; existing rows stay null until a backfill runs.
ALTER TABLE sim_parlays
  ADD COLUMN IF NOT EXISTS leg_results jsonb;

ALTER TABLE parlays
  ADD COLUMN IF NOT EXISTS leg_results jsonb;
