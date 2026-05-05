// ESPN NBA team statistics fetcher.
//
// stats.nba.com / data.nba.com are blocked from Vercel-region IPs. ESPN's
// sports.core.api.espn.com is open and exposes per-team season summaries
// with ~110 stats. We pull the raw counting stats and compute our own
// pace / offensive rating / defensive rating because ESPN's "rate" fields
// (Pace, Offensive Rating, Defensive Rating) come back as 0 in practice.
//
// Endpoint shape:
//   /v2/sports/basketball/leagues/nba/seasons/{year}/types/{type}/teams
//     → list of all 30 teams
//   /v2/sports/basketball/leagues/nba/seasons/{year}/types/{type}/teams/{id}/statistics/0
//     → per-team season stats (categories: Offensive, Defensive, General)

export interface NbaTeamStats {
  team_id: number;
  season: number;
  season_type: number;
  team_abbrev: string | null;
  team_name: string | null;
  games_played: number | null;

  points_per_game: number | null;
  points_against_per_game: number | null;

  fg_made_per_game: number | null;
  fg_attempted_per_game: number | null;
  fg_pct: number | null;
  three_made_per_game: number | null;
  three_attempted_per_game: number | null;
  three_pct: number | null;
  ft_pct: number | null;
  efg_pct: number | null;

  rebounds_per_game: number | null;
  off_rebounds_per_game: number | null;
  def_rebounds_per_game: number | null;
  assists_per_game: number | null;
  turnovers_per_game: number | null;
  steals_per_game: number | null;
  blocks_per_game: number | null;

  pace: number | null;
  off_rating: number | null;
  def_rating: number | null;
  net_rating: number | null;

  raw_payload: unknown;
}

interface EspnStat {
  name?: string;
  displayName?: string;
  value?: number;
  perGameValue?: number;
}

interface EspnCategory {
  name?: string;
  displayName?: string;
  stats?: EspnStat[];
}

interface EspnTeamStatsResponse {
  splits?: { categories?: EspnCategory[] };
  team?: { $ref?: string };
}

interface EspnTeamListItem {
  $ref?: string;
}

interface EspnTeamListResponse {
  items?: EspnTeamListItem[];
}

interface EspnTeamDetail {
  id?: string;
  abbreviation?: string;
  displayName?: string;
}

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
  Accept: "application/json",
};

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: HEADERS, cache: "no-store" });
  if (!res.ok) throw new Error(`ESPN ${url} HTTP ${res.status}`);
  return (await res.json()) as T;
}

// Pull the list of all NBA teams for the given season+type. Returns array
// of { team_id, abbreviation, displayName } so callers don't have to
// unwrap each $ref individually.
export async function fetchNbaTeams(
  season: number,
  seasonType: number,
): Promise<Array<{ team_id: number; abbreviation: string; displayName: string }>> {
  const url =
    `http://sports.core.api.espn.com/v2/sports/basketball/leagues/nba` +
    `/seasons/${season}/types/${seasonType}/teams?limit=50`;
  const list = await fetchJson<EspnTeamListResponse>(url);
  const items = list.items ?? [];
  const teams: Array<{ team_id: number; abbreviation: string; displayName: string }> = [];
  for (const item of items) {
    if (!item.$ref) continue;
    try {
      const detail = await fetchJson<EspnTeamDetail>(item.$ref);
      const idStr = detail.id;
      if (!idStr) continue;
      const id = Number(idStr);
      if (!Number.isFinite(id)) continue;
      teams.push({
        team_id: id,
        abbreviation: detail.abbreviation ?? "",
        displayName: detail.displayName ?? "",
      });
    } catch {
      // Skip teams we can't resolve — common for inactive franchise refs
    }
  }
  return teams;
}

// Helper: pull a stat by name from a flattened category list. ESPN names
// are inconsistent — match on `name` first (camelCase), fall back to
// `displayName` (human form).
function statValue(
  cats: EspnCategory[],
  name: string,
  displayName?: string,
): number | null {
  for (const cat of cats) {
    for (const s of cat.stats ?? []) {
      if (s.name === name || (displayName && s.displayName === displayName)) {
        if (typeof s.value === "number") return s.value;
        if (typeof s.perGameValue === "number") return s.perGameValue;
      }
    }
  }
  return null;
}

// Per-game value: try perGameValue first (ESPN provides it for some
// stats), else compute from the raw counting stat divided by games_played.
function perGame(
  cats: EspnCategory[],
  name: string,
  displayName: string,
  games: number | null,
): number | null {
  for (const cat of cats) {
    for (const s of cat.stats ?? []) {
      if (s.name === name || s.displayName === displayName) {
        if (typeof s.perGameValue === "number") return s.perGameValue;
        if (typeof s.value === "number" && games && games > 0) {
          return s.value / games;
        }
      }
    }
  }
  return null;
}

export async function fetchNbaTeamStats(
  team_id: number,
  season: number,
  seasonType: number,
  abbreviation: string,
  displayName: string,
): Promise<NbaTeamStats | null> {
  const url =
    `http://sports.core.api.espn.com/v2/sports/basketball/leagues/nba` +
    `/seasons/${season}/types/${seasonType}/teams/${team_id}/statistics/0`;
  let payload: EspnTeamStatsResponse;
  try {
    payload = await fetchJson<EspnTeamStatsResponse>(url);
  } catch {
    return null;
  }
  const cats = payload.splits?.categories ?? [];
  if (cats.length === 0) return null;

  const games_played = statValue(cats, "gamesPlayed", "Games Played");

  // Per-game basics
  const points_per_game = perGame(cats, "avgPoints", "Points Per Game", games_played)
    ?? perGame(cats, "points", "Points", games_played);
  const points_against_per_game =
    perGame(cats, "avgPointsAgainst", "Points Against Per Game", games_played)
    ?? perGame(cats, "pointsAgainst", "Points Conceded", games_played);

  const fg_made = perGame(cats, "fieldGoalsMade", "Field Goals Made", games_played);
  const fg_attempted = perGame(
    cats,
    "fieldGoalsAttempted",
    "Field Goals Attempted",
    games_played,
  );
  const fg_pct = statValue(cats, "fieldGoalPct", "Field Goal Pct")
    ?? (fg_made !== null && fg_attempted !== null && fg_attempted > 0
      ? (fg_made / fg_attempted) * 100
      : null);

  const three_made = perGame(cats, "threePointFieldGoalsMade", "3-Point Field Goals Made", games_played);
  const three_attempted = perGame(
    cats,
    "threePointFieldGoalsAttempted",
    "3-Point Field Goals Attempted",
    games_played,
  );
  const three_pct = statValue(cats, "threePointFieldGoalPct", "3-Point Field Goal Pct")
    ?? (three_made !== null && three_attempted !== null && three_attempted > 0
      ? (three_made / three_attempted) * 100
      : null);

  const ft_pct = statValue(cats, "freeThrowPct", "Free Throw Pct");
  const efg_pct = statValue(cats, "effectiveFieldGoalPct", "Effective Field Goal Percentage");

  const rebounds_per_game = perGame(cats, "rebounds", "Rebounds", games_played);
  const off_rebounds_per_game = perGame(cats, "offensiveRebounds", "Offensive Rebounds", games_played);
  const def_rebounds_per_game = perGame(cats, "defensiveRebounds", "Defensive Rebounds", games_played);
  const assists_per_game = perGame(cats, "assists", "Assists", games_played);
  const turnovers_per_game = perGame(cats, "turnovers", "Turnovers", games_played);
  const steals_per_game = perGame(cats, "steals", "Steals", games_played);
  const blocks_per_game = perGame(cats, "blocks", "Blocks", games_played);

  // Pace estimate: possessions per 48 min ≈ FGA + 0.44 * FTA - OREB + TOV
  const fta_per_game = perGame(cats, "freeThrowsAttempted", "Free Throws Attempted", games_played);
  const pace =
    fg_attempted !== null && fta_per_game !== null && off_rebounds_per_game !== null && turnovers_per_game !== null
      ? Math.round(
          (fg_attempted + 0.44 * fta_per_game - off_rebounds_per_game + turnovers_per_game) * 10,
        ) / 10
      : null;

  // Off/def rating: points per 100 possessions
  const off_rating =
    points_per_game !== null && pace !== null && pace > 0
      ? Math.round((points_per_game / pace) * 100 * 10) / 10
      : null;
  const def_rating =
    points_against_per_game !== null && pace !== null && pace > 0
      ? Math.round((points_against_per_game / pace) * 100 * 10) / 10
      : null;
  const net_rating =
    off_rating !== null && def_rating !== null
      ? Math.round((off_rating - def_rating) * 10) / 10
      : null;

  return {
    team_id,
    season,
    season_type: seasonType,
    team_abbrev: abbreviation,
    team_name: displayName,
    games_played: games_played !== null ? Math.round(games_played) : null,
    points_per_game,
    points_against_per_game,
    fg_made_per_game: fg_made,
    fg_attempted_per_game: fg_attempted,
    fg_pct,
    three_made_per_game: three_made,
    three_attempted_per_game: three_attempted,
    three_pct,
    ft_pct,
    efg_pct,
    rebounds_per_game,
    off_rebounds_per_game,
    def_rebounds_per_game,
    assists_per_game,
    turnovers_per_game,
    steals_per_game,
    blocks_per_game,
    pace,
    off_rating,
    def_rating,
    net_rating,
    raw_payload: { categories_count: cats.length, fetched_at: new Date().toISOString() },
  };
}

// Convenience wrapper: pull the team list, then fan out per-team requests.
// Returns one row per team. Failures on individual teams don't abort the
// whole batch.
export async function fetchAllNbaTeamStats(
  season: number,
  seasonType: number,
): Promise<NbaTeamStats[]> {
  const teams = await fetchNbaTeams(season, seasonType);
  const out: NbaTeamStats[] = [];
  // Sequential to avoid rate limits — ESPN doesn't document a limit but
  // 30 parallel requests is risky. Whole batch finishes in ~15 seconds.
  for (const t of teams) {
    const stats = await fetchNbaTeamStats(t.team_id, season, seasonType, t.abbreviation, t.displayName);
    if (stats) out.push(stats);
  }
  return out;
}
