-- ─── Research Parlays ─────────────────────────────────────────────────────
-- Brute-force enumerator's output. The greedy buildParlays() in /api/parlays
-- only sees ~30 parlays per call; this table stores the top N from a full
-- combinatorial scan (typically 370k+ candidates per slate) so we can study
-- where the AI actually finds edge.
--
-- Two tables:
--   research_scans   — one row per scan (when, how many candidates)
--   research_parlays — top-K rows per scan (the actual parlays)
--
-- Storage budget: ~800 bytes/parlay × 1000 rows/day × 60 days = ~50 MB max
-- (Supabase free tier is 500 MB — comfortable headroom.)

CREATE TABLE IF NOT EXISTS research_scans (
  id uuid primary key default gen_random_uuid(),
  scanned_at timestamptz default now(),
  sports text[] not null,
  legs_in_pool int not null,           -- size of edge-positive leg pool
  candidates_scanned int not null,     -- 2/3/4-leg combos enumerated
  positive_ev_count int not null,      -- how many had EV > 0
  sharp_ev_count int not null,         -- how many had EV >= 5%
  top_ev_percent numeric,              -- highest EV in the scan
  median_ev_percent numeric,           -- median EV (sanity vs top)
  duration_ms int                      -- how long the scan took
);

CREATE INDEX IF NOT EXISTS idx_research_scans_at ON research_scans(scanned_at desc);

CREATE TABLE IF NOT EXISTS research_parlays (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid references research_scans(id) on delete cascade,
  scanned_at timestamptz default now(),
  legs jsonb not null,                 -- compact leg array {gameId, sport, market, pick, odds, ourProb}
  leg_count int not null,
  combined_decimal numeric not null,
  combined_prob numeric not null,      -- product of leg ourProbs
  ev_percent numeric not null,
  sharp_legs_count int not null,       -- how many legs were sharp-flagged
  sports text[] not null,
  status text default 'pending' check (status in ('pending', 'won', 'lost', 'push')),
  resolved_at timestamptz,
  legs_won int default 0,
  legs_lost int default 0
);

CREATE INDEX IF NOT EXISTS idx_research_parlays_scan ON research_parlays(scan_id);
CREATE INDEX IF NOT EXISTS idx_research_parlays_at ON research_parlays(scanned_at desc);
CREATE INDEX IF NOT EXISTS idx_research_parlays_ev ON research_parlays(ev_percent desc);
CREATE INDEX IF NOT EXISTS idx_research_parlays_status ON research_parlays(status);

-- RLS — public read so JP and (future) subscribers can query the data;
-- writes restricted to service role.
ALTER TABLE research_scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_parlays ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read research_scans" ON research_scans FOR SELECT USING (true);
CREATE POLICY "Public read research_parlays" ON research_parlays FOR SELECT USING (true);
CREATE POLICY "Service write research_scans" ON research_scans FOR INSERT WITH CHECK (true);
CREATE POLICY "Service write research_parlays" ON research_parlays FOR INSERT WITH CHECK (true);
CREATE POLICY "Service update research_parlays" ON research_parlays FOR UPDATE USING (true);

-- ─── Auto-cleanup: delete rows older than 60 days ─────────────────────────
-- Keeps storage bounded. Run this manually periodically OR set up a Supabase
-- pg_cron job once the project's on a paid tier (free tier doesn't expose
-- pg_cron). Until then, the GitHub Actions scanner can call DELETE ... OLD
-- as part of its job.

-- Example cleanup query (commented out — run manually in SQL editor):
-- DELETE FROM research_parlays WHERE scanned_at < now() - interval '60 days';
-- DELETE FROM research_scans WHERE scanned_at < now() - interval '60 days';
