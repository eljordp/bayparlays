-- NBA team stats from ESPN's free public API.
--
-- stats.nba.com blocks Vercel-region IPs (verified 2026-05-04 + 2026-05-05),
-- but ESPN's sports.core.api.espn.com is open and exposes per-team season
-- summaries with ~110 stats across offensive / defensive / general
-- categories. We compute our own pace + offensive/defensive ratings from
-- the raw counting stats since ESPN's "rate" fields aren't always populated.
--
-- One row per (team_id, season). Replace, don't append — ESPN updates the
-- season-to-date numbers each morning, so previous rows would just be
-- staler versions of the same data. Auto-deletes seasons more than 2 years
-- old in the cron handler so the table stays bounded.

CREATE TABLE IF NOT EXISTS nba_team_stats (
  team_id integer NOT NULL,         -- ESPN team ID (1-30 for NBA)
  season integer NOT NULL,          -- e.g. 2026 for the 2025-26 season
  season_type integer NOT NULL,     -- ESPN convention: 2=regular, 3=playoffs
  team_abbrev text,
  team_name text,

  games_played integer,

  -- Per-game raw counting stats (from ESPN's "Offensive" + "Defensive" cats)
  points_per_game numeric,          -- offensive output
  points_against_per_game numeric,  -- defensive output

  fg_made_per_game numeric,
  fg_attempted_per_game numeric,
  fg_pct numeric,
  three_made_per_game numeric,
  three_attempted_per_game numeric,
  three_pct numeric,
  ft_pct numeric,
  efg_pct numeric,                  -- effective field goal % (advanced)

  rebounds_per_game numeric,
  off_rebounds_per_game numeric,
  def_rebounds_per_game numeric,
  assists_per_game numeric,
  turnovers_per_game numeric,
  steals_per_game numeric,
  blocks_per_game numeric,

  -- Computed advanced metrics. We derive these from the counting stats
  -- because ESPN's rate fields are inconsistently populated.
  -- pace = ~ possessions per 48 min ≈ FGA + 0.44*FTA - OREB + TOV
  pace numeric,
  off_rating numeric,               -- points per 100 possessions
  def_rating numeric,               -- points allowed per 100 possessions
  net_rating numeric,               -- off_rating - def_rating

  raw_payload jsonb,                -- full ESPN stats blob for debugging

  updated_at timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (team_id, season, season_type)
);

CREATE INDEX IF NOT EXISTS idx_nba_team_stats_season ON nba_team_stats(season, season_type, net_rating DESC);
CREATE INDEX IF NOT EXISTS idx_nba_team_stats_name ON nba_team_stats(team_name);

ALTER TABLE nba_team_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read nba_team_stats" ON nba_team_stats;
DROP POLICY IF EXISTS "Service write nba_team_stats" ON nba_team_stats;
DROP POLICY IF EXISTS "Service update nba_team_stats" ON nba_team_stats;

CREATE POLICY "Public read nba_team_stats" ON nba_team_stats FOR SELECT USING (true);
CREATE POLICY "Service write nba_team_stats" ON nba_team_stats FOR INSERT WITH CHECK (true);
CREATE POLICY "Service update nba_team_stats" ON nba_team_stats FOR UPDATE USING (true);
