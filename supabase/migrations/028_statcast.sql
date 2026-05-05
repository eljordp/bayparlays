-- Baseball Savant Statcast metrics. Premium MLB advanced stats — free
-- public CSV exports — that paid services charge $50+/mo for.
--
-- Two flavors stored:
--   1. Pitcher expected stats (xWOBA, xBA, xSLG, xERA + diffs to actual)
--      Powers MLB starter analysis: when a pitcher's xERA is higher than
--      his actual ERA, he's been getting lucky and is due to regress
--      worse. The diff is the regression signal.
--   2. Batter expected stats (same family, plus barrels / hard hit %)
--      Used for game-level offense projection: aggregate to team via
--      mlb_player_team mapping.
--
-- Player IDs match MLB Stats API's mlbamId — Savant uses the same numbering
-- so we can cross-reference probable pitchers from /api/cron pitcher logic
-- directly.
--
-- Daily snapshot. We don't keep history — Savant publishes season-to-date
-- aggregates that update each morning, so previous rows would just be
-- staler versions of the same data. Replace, don't append.

CREATE TABLE IF NOT EXISTS statcast_pitchers (
  player_id integer PRIMARY KEY,
  player_name text,
  season integer NOT NULL,
  pa integer,                -- plate appearances faced
  bip integer,               -- balls in play

  ba numeric,                -- actual batting avg against
  est_ba numeric,            -- xBA against (Statcast expected)
  est_ba_diff numeric,       -- est_ba − ba; positive = lucky (will regress worse)

  slg numeric,
  est_slg numeric,
  est_slg_diff numeric,

  woba numeric,              -- weighted on-base against (the headline rate stat)
  est_woba numeric,          -- xWOBA against
  est_woba_diff numeric,

  era numeric,
  xera numeric,              -- expected ERA from Statcast inputs
  era_xera_diff numeric,     -- era − xera; positive = lucky, negative = unlucky

  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS statcast_batters (
  player_id integer PRIMARY KEY,
  player_name text,
  season integer NOT NULL,
  pa integer,
  bip integer,

  ba numeric,
  est_ba numeric,
  est_ba_diff numeric,

  slg numeric,
  est_slg numeric,
  est_slg_diff numeric,

  woba numeric,
  est_woba numeric,
  est_woba_diff numeric,

  -- Power metrics from Savant's separate exit-velocity leaderboard.
  avg_hit_speed numeric,    -- average exit velocity (mph)
  max_hit_speed numeric,
  barrels integer,
  barrel_pct numeric,       -- barrels / batted balls (%)
  hard_hit_pct numeric,     -- ev95+ / batted balls (%)

  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_statcast_pitchers_season ON statcast_pitchers(season);
CREATE INDEX IF NOT EXISTS idx_statcast_batters_season ON statcast_batters(season);

ALTER TABLE statcast_pitchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE statcast_batters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read statcast_pitchers" ON statcast_pitchers;
DROP POLICY IF EXISTS "Service write statcast_pitchers" ON statcast_pitchers;
DROP POLICY IF EXISTS "Service update statcast_pitchers" ON statcast_pitchers;
DROP POLICY IF EXISTS "Public read statcast_batters" ON statcast_batters;
DROP POLICY IF EXISTS "Service write statcast_batters" ON statcast_batters;
DROP POLICY IF EXISTS "Service update statcast_batters" ON statcast_batters;

CREATE POLICY "Public read statcast_pitchers" ON statcast_pitchers FOR SELECT USING (true);
CREATE POLICY "Service write statcast_pitchers" ON statcast_pitchers FOR INSERT WITH CHECK (true);
CREATE POLICY "Service update statcast_pitchers" ON statcast_pitchers FOR UPDATE USING (true);

CREATE POLICY "Public read statcast_batters" ON statcast_batters FOR SELECT USING (true);
CREATE POLICY "Service write statcast_batters" ON statcast_batters FOR INSERT WITH CHECK (true);
CREATE POLICY "Service update statcast_batters" ON statcast_batters FOR UPDATE USING (true);
