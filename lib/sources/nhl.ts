// NHL Stats API fetcher.
//
// The NHL exposes two API surfaces — both free, both keyless:
//   - api-web.nhle.com   — schedule, scores, live game state
//   - api.nhle.com/stats — leaderboards, season aggregates, team stats
//
// We use the second one for goalie summary stats (save%, GAA) which is
// the single highest-leverage NHL feature for game-level betting.

export interface NhlGoalie {
  player_id: number;
  goalie_name: string;
  team_abbrev: string;
  season_id: number;
  games_played: number | null;
  games_started: number | null;
  wins: number | null;
  losses: number | null;
  ot_losses: number | null;
  shutouts: number | null;
  shots_against: number | null;
  saves: number | null;
  goals_against: number | null;
  save_pct: number | null;
  gaa: number | null;
  time_on_ice: number | null;
  shoots_catches: string | null;
}

interface RawGoalie {
  playerId?: number;
  goalieFullName?: string;
  teamAbbrevs?: string;            // can be "CAR" or "CAR,FLA" if traded mid-season
  seasonId?: number;
  gamesPlayed?: number;
  gamesStarted?: number;
  wins?: number;
  losses?: number;
  otLosses?: number;
  shutouts?: number;
  shotsAgainst?: number;
  saves?: number;
  goalsAgainst?: number;
  savePct?: number;
  goalsAgainstAverage?: number;
  timeOnIce?: number;
  shootsCatches?: string;
}

interface NhlStatsResponse {
  data?: RawGoalie[];
  total?: number;
}

// Default to the current season — NHL season IDs are concatenated start
// and end years (2025-2026 season → 20252026). Switch around late
// October when the new season starts.
function currentSeasonId(): number {
  const now = new Date();
  const y = now.getUTCFullYear();
  // NHL season runs roughly Oct → Apr regular, May/Jun playoffs. If we're
  // in Aug-Oct (off-season → preseason), default to the season starting
  // this year. Otherwise default to the season that started last year.
  const m = now.getUTCMonth(); // 0-indexed
  if (m >= 7) return Number(`${y}${y + 1}`);
  return Number(`${y - 1}${y}`);
}

async function fetchPaginated(seasonId: number): Promise<RawGoalie[]> {
  const all: RawGoalie[] = [];
  let start = 0;
  const limit = 100;
  while (true) {
    const url =
      `https://api.nhle.com/stats/rest/en/goalie/summary` +
      `?cayenneExp=seasonId=${seasonId}&limit=${limit}&start=${start}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        Accept: "application/json",
      },
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`NHL goalie summary HTTP ${res.status}`);
    }
    const json = (await res.json()) as NhlStatsResponse;
    const batch = json.data ?? [];
    all.push(...batch);
    if (batch.length < limit) break;
    start += limit;
    // Safety circuit-break — NHL has at most ~100 goalies per season; if
    // pagination doesn't terminate after 5 pages something's very wrong.
    if (start > 500) break;
  }
  return all;
}

export async function fetchNhlGoalies(
  seasonId: number = currentSeasonId(),
): Promise<NhlGoalie[]> {
  const raw = await fetchPaginated(seasonId);
  return raw
    .filter((g): g is RawGoalie & { playerId: number } => typeof g.playerId === "number")
    .map((g) => ({
      player_id: g.playerId,
      goalie_name: g.goalieFullName ?? "",
      // teamAbbrevs may be "CAR,FLA" if the goalie was traded mid-season;
      // we keep the full string and let consumers split if they need
      // most-recent-team logic.
      team_abbrev: g.teamAbbrevs ?? "",
      season_id: seasonId,
      games_played: g.gamesPlayed ?? null,
      games_started: g.gamesStarted ?? null,
      wins: g.wins ?? null,
      losses: g.losses ?? null,
      ot_losses: g.otLosses ?? null,
      shutouts: g.shutouts ?? null,
      shots_against: g.shotsAgainst ?? null,
      saves: g.saves ?? null,
      goals_against: g.goalsAgainst ?? null,
      save_pct: typeof g.savePct === "number" ? g.savePct : null,
      gaa: typeof g.goalsAgainstAverage === "number" ? g.goalsAgainstAverage : null,
      time_on_ice: g.timeOnIce ?? null,
      shoots_catches: g.shootsCatches ?? null,
    }));
}
