-- Track per-leg outcomes on sim parlays so we can show users their
-- per-leg hit rate (different from parlay hit rate — a 30% parlay record
-- with 60% per-leg hit rate is meaningful: their picks are mostly right,
-- the parlay format is killing them via compounding).
--
-- Columns are nullable so existing pre-migration rows keep their data;
-- the resolver populates them on every NEW resolve going forward.

ALTER TABLE sim_parlays
  ADD COLUMN IF NOT EXISTS legs_won integer,
  ADD COLUMN IF NOT EXISTS legs_lost integer,
  ADD COLUMN IF NOT EXISTS legs_total integer;

-- Cheap backfill for already-won parlays: a winning parlay = ALL legs won
-- (otherwise the parlay would be lost). So legs_won = legs_total for these
-- rows, and we can pull legs_total from the JSON array length.
UPDATE sim_parlays
SET
  legs_total = COALESCE(legs_total, jsonb_array_length(legs)),
  legs_won = COALESCE(
    legs_won,
    CASE WHEN status = 'won' THEN jsonb_array_length(legs) ELSE NULL END
  ),
  legs_lost = COALESCE(
    legs_lost,
    CASE WHEN status = 'won' THEN 0 ELSE NULL END
  )
WHERE legs IS NOT NULL;

-- Lost-parlay rows can't be retroactively split (we'd need to re-grade each
-- leg against historical scores, which means re-paying for The Odds API).
-- Going forward the resolver populates them naturally.
