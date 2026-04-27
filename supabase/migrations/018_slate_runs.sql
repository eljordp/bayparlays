-- slate_runs — one row per /api/cron/generate-slate fire.
--
-- Tracks how the slate-level diversity filter is actually behaving over
-- time. Without this, the only way to know how many picks the filter is
-- dropping per run is to dig through GitHub Actions logs for the cron's
-- JSON response. With this, one query gives you the history.
--
-- Useful queries:
--   SELECT slate_id, candidates_before_filter, dropped_to_diversity, persisted
--     FROM slate_runs ORDER BY ran_at DESC LIMIT 30;
--   SELECT AVG(dropped_to_diversity), MAX(dropped_to_diversity) FROM slate_runs;
--
-- If avg drop is high (e.g. 4+/run), the raw candidates are concentrated and
-- the filter is doing real work. If it's near zero, the filter is mostly a
-- safety net.

CREATE TABLE IF NOT EXISTS slate_runs (
  id                       bigserial PRIMARY KEY,
  slate_id                 text NOT NULL,
  label                    text,
  candidates_before_filter int  NOT NULL DEFAULT 0,
  dropped_to_diversity     int  NOT NULL DEFAULT 0,
  persisted                int  NOT NULL DEFAULT 0,
  last_insert_error        text,
  ran_at                   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_slate_runs_ran_at
  ON slate_runs(ran_at DESC);

CREATE INDEX IF NOT EXISTS idx_slate_runs_slate_id
  ON slate_runs(slate_id);
