-- Add leg_results jsonb to research_parlays.
--
-- Migration 016 added leg_results to parlays + sim_parlays but missed
-- research_parlays. The training cron (/api/cron/train-model) reads
-- leg_results from BOTH parlays and research_parlays — without it on
-- research_parlays the cron fails with HTTP 500 ("column does not exist").
--
-- Same shape as the existing column on parlays.

ALTER TABLE research_parlays
  ADD COLUMN IF NOT EXISTS leg_results jsonb;
