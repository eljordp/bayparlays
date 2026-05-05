-- Betting signals from external public APIs (Action Network + Pinnacle).
--
-- Two free public sources we can hit without paying for Odds API tier
-- upgrades:
--   1. Action Network — multi-book consensus + public bet % + money %
--      (sharp/square split). The public/money percentages are sharp
--      signals: paid services charge $30+/mo for them.
--   2. Pinnacle — sharpest book in the market. Their lines are the de
--      facto truth, used as a benchmark for "is our pick agreeing or
--      disagreeing with sharp money?"
--
-- One row per (sport, ext_game_id, captured_at). A single game gets
-- multiple rows over time as snapshots accumulate — closing-line analysis
-- and intra-day movement tracking both work the same way as line_history.

CREATE TABLE IF NOT EXISTS betting_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  captured_at timestamptz NOT NULL DEFAULT now(),

  -- Sport key matching our internal SPORT_MAP labels (NBA, MLB, NHL, etc.)
  sport text NOT NULL,

  -- External game identifier from the source. Different per source —
  -- Action Network uses numeric ids, Pinnacle uses matchupId. We keep
  -- the source ID raw and rely on (home_team, away_team, commence_time)
  -- for joining back to our internal Odds API gameId.
  source text NOT NULL CHECK (source IN ('actionnetwork', 'pinnacle')),
  ext_game_id text NOT NULL,

  -- Game identification. Used for joining to /api/parlays legs by team
  -- name + commence_time when we can't match on external IDs directly.
  home_team text NOT NULL,
  away_team text NOT NULL,
  commence_time timestamptz,

  -- Action Network scoreboard fields (NULL when source is pinnacle)
  ml_home integer,
  ml_away integer,
  spread_home_line numeric,
  spread_away_line numeric,
  spread_home_price integer,
  spread_away_price integer,
  total_line numeric,
  total_over_price integer,
  total_under_price integer,

  -- Public bet % and money % per side. Public = % of bet COUNT, money
  -- = % of $ wagered. When public is high but money is low (or vice
  -- versa), that's the sharp/square split.
  public_pct_home numeric,
  public_pct_away numeric,
  money_pct_home numeric,
  money_pct_away numeric,
  public_pct_over numeric,
  public_pct_under numeric,
  money_pct_over numeric,
  money_pct_under numeric,

  -- Pinnacle-specific: their max bet limits indicate their confidence.
  -- A $3,200 max means they're confident in the line; lower = less
  -- liquidity and possibly more uncertainty.
  pinnacle_max_stake numeric,

  -- Raw payload from the source — useful for debugging and for adding
  -- new fields without schema changes.
  raw jsonb,

  UNIQUE(source, ext_game_id, captured_at)
);

CREATE INDEX IF NOT EXISTS idx_betting_signals_lookup
  ON betting_signals(sport, commence_time DESC, captured_at DESC);

CREATE INDEX IF NOT EXISTS idx_betting_signals_teams
  ON betting_signals(sport, home_team, away_team, captured_at DESC);

-- Public read so the admin page + future /api/parlays joins work via
-- the anon Supabase client. Service role still required for INSERTs
-- which the cron does.
ALTER TABLE betting_signals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read betting_signals" ON betting_signals;
DROP POLICY IF EXISTS "Service write betting_signals" ON betting_signals;

CREATE POLICY "Public read betting_signals"
  ON betting_signals FOR SELECT USING (true);
CREATE POLICY "Service write betting_signals"
  ON betting_signals FOR INSERT WITH CHECK (true);
