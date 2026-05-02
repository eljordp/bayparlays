// NHL goalie data fetched from api-web.nhle.com (free, official, no auth).
//
// We pull the gamecenter "landing" payload for each upcoming game; the
// matchup.goalieComparison block lists each team's projected starter
// (leaders[0]) with season GAA + Sv% + record. Used to bias NHL totals
// downward when a strong goalie pair is going (low GAA / high Sv%) and
// upward for backup-vs-backup.
//
// Data freshness: NHL.com seeds these from team announcements ~3 hours
// before puck drop. Pre-game (status='FUT') always has the team's #1
// goalie listed; we accept that as the projected starter.

const NHL_BASE = "https://api-web.nhle.com/v1";

export interface GoalieStat {
  name: string;
  gaa: number | null;       // goals against avg
  savePct: number | null;   // save % as decimal (0.91 = 91%)
  record: string | null;    // "27-12-3"
  gamesPlayed: number | null;
}

export interface GoalieMatchup {
  gameId: number | string;
  homeTeam: string;
  awayTeam: string;
  startTimeUTC: string;
  homeGoalie: GoalieStat | null;
  awayGoalie: GoalieStat | null;
  // Aggregate quality score: avg of (1 - savePct) across both goalies.
  // Lower = better goalies = expect lower-scoring game.
  combinedGaa: number | null;
  combinedSvPct: number | null;
  // Bias to apply to total/over-under (in goals): positive = favor over.
  // Negative when both goalies are elite (sub-2.5 GAA).
  totalBias: number;
  reason: string | null;
}

interface NhlGoalieLeader {
  playerId?: number;
  name?: { default?: string };
  lastName?: { default?: string };
  positionCode?: string;
  gamesPlayed?: number;
  record?: string;
  gaa?: number;
  savePctg?: number;
}

interface NhlLandingResp {
  id?: number;
  gameState?: string;
  startTimeUTC?: string;
  homeTeam?: { abbrev?: string; commonName?: { default?: string } };
  awayTeam?: { abbrev?: string; commonName?: { default?: string } };
  matchup?: {
    goalieComparison?: {
      homeTeam?: { leaders?: NhlGoalieLeader[] };
      awayTeam?: { leaders?: NhlGoalieLeader[] };
    };
  };
}

interface ScheduleResp {
  gameWeek?: Array<{
    games?: Array<{
      id?: number;
      gameState?: string;
      startTimeUTC?: string;
      homeTeam?: { abbrev?: string; commonName?: { default?: string }; placeName?: { default?: string } };
      awayTeam?: { abbrev?: string; commonName?: { default?: string }; placeName?: { default?: string } };
    }>;
  }>;
}

function pickStarter(leaders: NhlGoalieLeader[] | undefined): GoalieStat | null {
  if (!leaders || leaders.length === 0) return null;
  // leaders[0] is the team's primary goalie by season minutes/games
  const g = leaders[0];
  if (g.positionCode !== "G") return null;
  return {
    name: g.lastName?.default ?? g.name?.default ?? "Unknown",
    gaa: typeof g.gaa === "number" ? g.gaa : null,
    savePct: typeof g.savePctg === "number" ? g.savePctg : null,
    record: g.record ?? null,
    gamesPlayed: typeof g.gamesPlayed === "number" ? g.gamesPlayed : null,
  };
}

// Fetches projected starter stats for one game. Returns null if landing
// payload doesn't include goalie data (rare — happens for some scheduled
// games far out).
async function fetchGoalies(gameId: number | string): Promise<GoalieMatchup | null> {
  try {
    const res = await fetch(`${NHL_BASE}/gamecenter/${gameId}/landing`, {
      next: { revalidate: 1800 }, // 30 min cache
    });
    if (!res.ok) return null;
    const data = (await res.json()) as NhlLandingResp;
    const homeAbbrev = data.homeTeam?.abbrev ?? "?";
    const awayAbbrev = data.awayTeam?.abbrev ?? "?";

    const homeGoalie = pickStarter(data.matchup?.goalieComparison?.homeTeam?.leaders);
    const awayGoalie = pickStarter(data.matchup?.goalieComparison?.awayTeam?.leaders);

    let combinedGaa: number | null = null;
    let combinedSvPct: number | null = null;
    if (homeGoalie?.gaa != null && awayGoalie?.gaa != null) {
      combinedGaa = (homeGoalie.gaa + awayGoalie.gaa) / 2;
    }
    if (homeGoalie?.savePct != null && awayGoalie?.savePct != null) {
      combinedSvPct = (homeGoalie.savePct + awayGoalie.savePct) / 2;
    }

    // Bias on goals total. NHL average is ~6.0 goals/game.
    // If combined GAA is well below average, adjust the total down.
    let totalBias = 0;
    let reason: string | null = null;
    if (combinedGaa != null) {
      // Cap at ±0.7 goals so this signal can't overwhelm the model.
      const leagueAvgGaa = 3.0;
      const delta = leagueAvgGaa - combinedGaa; // positive when goalies are better than avg
      totalBias = Math.max(-0.7, Math.min(0.7, delta * 0.4));
      if (Math.abs(totalBias) >= 0.2) {
        const sign = totalBias < 0 ? "Under-favoring" : "Over-favoring";
        reason = `${sign}: ${homeGoalie?.name} (${homeGoalie?.gaa?.toFixed(2)} GAA) vs ${awayGoalie?.name} (${awayGoalie?.gaa?.toFixed(2)} GAA)`;
      }
    }

    return {
      gameId: data.id ?? gameId,
      homeTeam: homeAbbrev,
      awayTeam: awayAbbrev,
      startTimeUTC: data.startTimeUTC ?? "",
      homeGoalie,
      awayGoalie,
      combinedGaa,
      combinedSvPct,
      totalBias,
      reason,
    };
  } catch {
    return null;
  }
}

// Fetches the current schedule, then per-game goalie data.
// Returns a map keyed by lowercased "<away-place> vs <home-place>" so
// extractLegsFromGame can look up via game string.
function gameKey(home: string, away: string): string {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  return `${norm(away)}::${norm(home)}`;
}

export async function fetchNhlGoalieMatchups(): Promise<Map<string, GoalieMatchup>> {
  const out = new Map<string, GoalieMatchup>();
  try {
    const sched = await fetch(`${NHL_BASE}/schedule/now`, {
      next: { revalidate: 1800 },
      redirect: "follow",
    });
    if (!sched.ok) return out;
    const data = (await sched.json()) as ScheduleResp;
    const games = (data.gameWeek ?? []).flatMap((w) => w.games ?? []);
    // Only fetch goalie data for games starting in the next ~36 hours
    const nowMs = Date.now();
    const horizonMs = 36 * 60 * 60 * 1000;
    const upcoming = games.filter((g) => {
      if (!g.startTimeUTC) return false;
      const t = new Date(g.startTimeUTC).getTime();
      return t > nowMs && t < nowMs + horizonMs;
    });
    // Limit to 20 games to bound API load
    const slice = upcoming.slice(0, 20);
    const matchups = await Promise.all(slice.map((g) => g.id ? fetchGoalies(g.id) : Promise.resolve(null)));
    for (let i = 0; i < slice.length; i++) {
      const g = slice[i];
      const m = matchups[i];
      if (!m) continue;
      const homeFull = `${g.homeTeam?.placeName?.default ?? ""} ${g.homeTeam?.commonName?.default ?? ""}`.trim();
      const awayFull = `${g.awayTeam?.placeName?.default ?? ""} ${g.awayTeam?.commonName?.default ?? ""}`.trim();
      if (!homeFull || !awayFull) continue;
      out.set(gameKey(homeFull, awayFull), m);
    }
  } catch (e) {
    console.error("fetchNhlGoalieMatchups failed:", e);
  }
  return out;
}

// Lookup helper for extractLegsFromGame.
export function findNhlGoalieMatchup(
  matchups: Map<string, GoalieMatchup>,
  homeTeam: string,
  awayTeam: string,
): GoalieMatchup | null {
  return matchups.get(gameKey(homeTeam, awayTeam)) ?? null;
}
