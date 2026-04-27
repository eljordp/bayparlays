-- slate_rank: position of a parlay within its slate, 1 = top pick.
--
-- Powers two things:
--   1. /parlays "Top N" filter — show only Top 3 / 10 / 25 / 50 / 100 / etc
--      so users can dial how aggressive the AI's recommendations are.
--   2. /results tier breakout — historical hit rate + ROI by tier.
--      Critical for honesty: if Top 3 hits 60% but All-1000 hits 8%, that
--      gap is the actual value of the AI's confidence ranking. Showing
--      both teaches users that EV ≠ likelihood to cash, and gives them
--      a calibrated view of which tier is worth betting.
--
-- Stamped at slate generation time in app/api/cron/generate-slate/route.ts
-- by sorting candidates DESC by confidence, then assigning 1..N.

ALTER TABLE parlays
  ADD COLUMN IF NOT EXISTS slate_rank int;

-- Tier-bucket queries on /results pull large date ranges then group by
-- slate_rank. Index helps the breakdown stay fast as history grows.
CREATE INDEX IF NOT EXISTS idx_parlays_slate_rank
  ON parlays(slate_rank) WHERE slate_rank IS NOT NULL;
