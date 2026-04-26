-- Daily Slate — fixes the "ephemeral parlays" UX problem.
--
-- Before: every /parlays page load regenerated parlays from current legs.
-- Refresh the page → different parlays. Bookmark a pick → it's gone next visit.
-- The "175/day" stat was mostly the same parlays regenerated, not unique
-- opportunities. Bad for users (no continuity) and bad for data (noise).
--
-- After: a cron generates a fixed slate of 12-15 parlays four times a day.
-- All users in that window see the SAME parlays. Old slate gets archived
-- (slate_id stays on the rows for historical analysis), new slate becomes
-- the active one. Users get continuity, data gets clean per-slate analytics.

ALTER TABLE parlays
  ADD COLUMN IF NOT EXISTS slate_id text;

-- Lookups by slate (for /api/parlays?mode=slate) need to be fast.
CREATE INDEX IF NOT EXISTS idx_parlays_slate_id
  ON parlays(slate_id, created_at DESC) WHERE slate_id IS NOT NULL;
