-- ─── Edge Picks Archive ───────────────────────────────────────────────────
-- Every sharp-edge single-leg pick the model flags gets written here with
-- opening price + fair probability + evVsFair at the moment of detection.
-- Graded when the game completes by the same cron that grades parlays.
--
-- This is the real track record for the edges product. Parlays are a
-- distraction; single-leg +EV picks are what the model actually claims to
-- find, and this table proves (or disproves) it over time.

CREATE TABLE IF NOT EXISTS edge_picks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  -- Pick identity
  sport text not null,
  game_id text not null,
  game text not null,
  market text not null,          -- moneyline | spread | total
  pick text not null,
  commence_time timestamptz not null,
  -- Opening price + book
  odds integer not null,         -- American odds at open
  decimal_odds numeric not null,
  book text not null,
  book_count integer,            -- how many books priced this outcome
  -- Model estimates at capture
  implied_prob numeric not null, -- book implied (with vig)
  fair_prob numeric,             -- no-vig consensus across books
  our_prob numeric,              -- our model's ourProb
  ev_vs_fair numeric,            -- decimal EV vs no-vig fair
  sharp_edge boolean default false,
  scored boolean default false,  -- true if Elo/records/situational fired
  -- Grading
  status text default 'pending' check (status in ('pending', 'won', 'lost', 'push')),
  closing_odds integer,          -- line_history at T-0
  clv_percent numeric,
  profit numeric default 0,      -- $ profit on $100 stake
  resolved_at timestamptz,
  -- Dedupe: one row per (game_id, market, pick) per day so we don't
  -- log the same mispricing over and over while the edge exists.
  dedupe_key text generated always as (
    game_id || '|' || market || '|' || pick || '|' ||
    to_char(created_at at time zone 'UTC', 'YYYY-MM-DD')
  ) stored,
  UNIQUE (dedupe_key)
);

CREATE INDEX IF NOT EXISTS idx_edge_picks_status ON edge_picks(status);
CREATE INDEX IF NOT EXISTS idx_edge_picks_created ON edge_picks(created_at desc);
CREATE INDEX IF NOT EXISTS idx_edge_picks_commence ON edge_picks(commence_time);
CREATE INDEX IF NOT EXISTS idx_edge_picks_sport ON edge_picks(sport);
CREATE INDEX IF NOT EXISTS idx_edge_picks_ev ON edge_picks(ev_vs_fair desc);

ALTER TABLE edge_picks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read edge_picks" ON edge_picks FOR SELECT USING (true);
CREATE POLICY "Service insert edge_picks" ON edge_picks FOR INSERT WITH CHECK (true);
CREATE POLICY "Service update edge_picks" ON edge_picks FOR UPDATE USING (true);
