-- CLV gate: rolling 60-day average closing line value per calibration bucket.
--
-- The calibration cron already learns hit-rate adjustments per
-- (sport × market × odds_bucket). This migration extends each bucket with
-- its CLV signal so the parlay generator can do something the AI couldn't
-- before: refuse to spray legs from buckets that are demonstrably losing
-- to the closing line.
--
-- CLV is computed from parlays.closing_lines (populated when the resolver
-- grades a parlay). Avg CLV over a rolling window per bucket → if a
-- bucket's CLV is materially negative on a meaningful sample, that bucket's
-- legs get dropped from the candidate pool in /api/parlays.
--
-- Why store on model_calibration: same row already represents that bucket,
-- same lookup keys, same cascade. One read covers both the probability
-- multiplier (calibration_factor) and the gating decision (avg_clv).

ALTER TABLE model_calibration
  ADD COLUMN IF NOT EXISTS avg_clv numeric,
  ADD COLUMN IF NOT EXISTS clv_sample integer;

COMMENT ON COLUMN model_calibration.avg_clv IS
  'Rolling 60-day average closing line value (percent) for legs in this '
  'bucket. Positive = beating the close = real edge. Negative = losing to '
  'the close = the bucket is mispricing reality. Used as a gate in '
  '/api/parlays to drop legs from buckets that have proven negative CLV '
  'on sufficient sample.';

COMMENT ON COLUMN model_calibration.clv_sample IS
  'Number of graded legs with CLV that contributed to avg_clv. Below ~40 '
  'the gate falls through to a less-specific bucket because variance '
  'dominates.';
