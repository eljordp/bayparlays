-- archived_at: marks a parlay row as invalid for stats purposes.
--
-- Why a separate column instead of status='archived':
--   The status check constraint allows ('pending'|'won'|'lost'|'push'|'partial').
--   'archived' is orthogonal to outcome — a row can be a literal duplicate
--   (archive it) AND have already resolved (status=lost). Mixing those
--   into one column loses information.
--
-- Set by scripts/archive-duplicate-parlays.ts when it finds literal
-- duplicate parlays in the same slate (cleanup of pre-diversity-filter
-- garbage). /api/track/results filters out rows where archived_at IS NOT NULL.

ALTER TABLE parlays
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

-- /results queries filter on archived_at IS NULL frequently. Partial index
-- on the active set keeps lookups fast without bloating the index for
-- the small archived population.
CREATE INDEX IF NOT EXISTS idx_parlays_active
  ON parlays(created_at DESC) WHERE archived_at IS NULL;
