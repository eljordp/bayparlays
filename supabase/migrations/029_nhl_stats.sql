-- NHL goalie stats from the official NHL Stats API.
--
-- For NHL game-level betting (totals, run lines, moneyline), the starting
-- goalie matchup is the single biggest signal. A backup with .885 SV%
-- vs a Vezina-caliber starter at .920 SV% can move a total by a full
-- goal. Our system has been treating NHL like a black box (factor 0.6×
-- max penalty in calibration) because we lacked goalie-level features —
-- this migration starts collecting them.
--
-- Player IDs match the NHL's official playerId scheme used across all
-- their endpoints (different namespace from MLB's mlbamId — NHL uses
-- ~8M+ range, MLB uses ~6-700K range, no collisions).
--
-- Daily snapshot. Like Statcast, we replace rather than append since the
-- NHL publishes season-to-date rolling aggregates each morning.

CREATE TABLE IF NOT EXISTS nhl_goalies (
  player_id integer PRIMARY KEY,
  goalie_name text,
  team_abbrev text,
  season_id integer NOT NULL,           -- e.g. 20252026

  -- Volume / starts
  games_played integer,
  games_started integer,
  wins integer,
  losses integer,
  ot_losses integer,
  shutouts integer,

  -- Shot-stopping (the headline column)
  shots_against integer,
  saves integer,
  goals_against integer,
  save_pct numeric,                     -- 0.000 - 1.000
  gaa numeric,                          -- goals against average

  -- Time on ice (seconds, normalized for rate stats later)
  time_on_ice integer,

  shoots_catches text,                  -- "L" or "R" — handedness

  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nhl_goalies_team ON nhl_goalies(team_abbrev, save_pct DESC);
CREATE INDEX IF NOT EXISTS idx_nhl_goalies_season ON nhl_goalies(season_id);

ALTER TABLE nhl_goalies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read nhl_goalies" ON nhl_goalies;
DROP POLICY IF EXISTS "Service write nhl_goalies" ON nhl_goalies;
DROP POLICY IF EXISTS "Service update nhl_goalies" ON nhl_goalies;

CREATE POLICY "Public read nhl_goalies" ON nhl_goalies FOR SELECT USING (true);
CREATE POLICY "Service write nhl_goalies" ON nhl_goalies FOR INSERT WITH CHECK (true);
CREATE POLICY "Service update nhl_goalies" ON nhl_goalies FOR UPDATE USING (true);
