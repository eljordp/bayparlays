// MLB bullpen rest tracker.
//
// A team that used 5+ innings of relief yesterday has weaker late-game
// options today — they'll be reaching for tier-3 arms in the 7th-8th
// when better pitchers are gassed. Conversely, a team coming off a
// complete game or short relief day has a fully rested pen.
//
// Effect on totals: tired pens leak runs late. If both teams' pens are
// gassed, slight Over lean. If both are rested, slight Under lean.
// Sided picks are less affected (the impact is symmetric within a game).
//
// Source: free MLB Stats API. We pull yesterday's completed games and
// sum reliever IP per team.

const MLB_BASE = "https://statsapi.mlb.com/api/v1";

export interface BullpenLoad {
  team: string;          // commonName as MLB API returns it
  reliefInningsYesterday: number;
  reliefPitchesYesterday: number;
  pitchersUsedYesterday: number;
  load: "fresh" | "moderate" | "tired";
}

export interface BullpenMatchup {
  homeTeam: string;
  awayTeam: string;
  home: BullpenLoad;
  away: BullpenLoad;
  // Total bias in runs. Positive = favor Over (both gassed); negative
  // = favor Under (both fresh). Capped ±0.4 runs.
  totalBias: number;
  reason: string | null;
}

const MAX_BIAS = 0.4;

interface GameLog {
  gamePk?: number;
  status?: { codedGameState?: string };
  teams?: {
    home?: {
      team?: { name?: string };
      probablePitcher?: { id?: number };
    };
    away?: {
      team?: { name?: string };
      probablePitcher?: { id?: number };
    };
  };
}

interface BoxscoreTeam {
  pitchers?: number[];
  players?: Record<string, {
    person?: { id?: number; fullName?: string };
    stats?: {
      pitching?: {
        inningsPitched?: string;     // "1.2"
        numberOfPitches?: number;
      };
    };
  }>;
}

interface Boxscore {
  teams?: {
    home?: BoxscoreTeam & { team?: { name?: string } };
    away?: BoxscoreTeam & { team?: { name?: string } };
  };
}

function parseInnings(ip: string | undefined): number {
  if (!ip) return 0;
  // MLB IP convention: "1.1" = 1 1/3, "1.2" = 2/3 etc. Convert to decimal.
  const [whole, fraction] = ip.split(".");
  const w = parseInt(whole, 10) || 0;
  const f = parseInt(fraction || "0", 10);
  return w + (f === 1 ? 1 / 3 : f === 2 ? 2 / 3 : 0);
}

function classifyLoad(reliefIp: number): BullpenLoad["load"] {
  if (reliefIp >= 5) return "tired";
  if (reliefIp >= 3) return "moderate";
  return "fresh";
}

async function fetchYesterdayGames(): Promise<GameLog[]> {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  try {
    const res = await fetch(
      `${MLB_BASE}/schedule?sportId=1&date=${yesterday}`,
      { next: { revalidate: 3600 } },
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data?.dates?.[0]?.games ?? []) as GameLog[];
  } catch {
    return [];
  }
}

async function fetchBoxscore(gamePk: number): Promise<Boxscore | null> {
  try {
    const res = await fetch(
      `${MLB_BASE}/game/${gamePk}/boxscore`,
      { next: { revalidate: 3600 } },
    );
    if (!res.ok) return null;
    return (await res.json()) as Boxscore;
  } catch {
    return null;
  }
}

// For one team's box, compute relief load. Skip the starter (first pitcher
// listed in the pitchers array). Sum subsequent pitchers' IP and pitches.
function computeReliefLoad(team: BoxscoreTeam | undefined): {
  reliefInnings: number;
  reliefPitches: number;
  pitchersUsed: number;
} {
  if (!team?.pitchers || team.pitchers.length === 0) {
    return { reliefInnings: 0, reliefPitches: 0, pitchersUsed: 0 };
  }
  // First pitcher is the starter
  const reliefIds = team.pitchers.slice(1);
  let reliefInnings = 0;
  let reliefPitches = 0;
  for (const id of reliefIds) {
    const player = team.players?.[`ID${id}`];
    const ip = player?.stats?.pitching?.inningsPitched;
    const pc = player?.stats?.pitching?.numberOfPitches ?? 0;
    reliefInnings += parseInnings(ip);
    reliefPitches += pc;
  }
  return {
    reliefInnings: Math.round(reliefInnings * 10) / 10,
    reliefPitches,
    pitchersUsed: reliefIds.length,
  };
}

// Pull all of yesterday's MLB games and compute per-team bullpen load.
// Returns Map keyed by lowercased team name for lookup.
export async function fetchBullpenLoads(): Promise<Map<string, BullpenLoad>> {
  const out = new Map<string, BullpenLoad>();
  const games = await fetchYesterdayGames();
  // Only completed games provide reliable boxscores
  const completed = games.filter(
    (g) => g.status?.codedGameState === "F" && g.gamePk,
  );
  // Cap at 20 boxscore fetches per request to bound API calls
  const slice = completed.slice(0, 20);
  const boxes = await Promise.all(slice.map((g) => fetchBoxscore(g.gamePk!)));
  for (let i = 0; i < slice.length; i++) {
    const box = boxes[i];
    if (!box) continue;
    const home = box.teams?.home;
    const away = box.teams?.away;
    if (home?.team?.name) {
      const r = computeReliefLoad(home);
      out.set(home.team.name.toLowerCase(), {
        team: home.team.name,
        reliefInningsYesterday: r.reliefInnings,
        reliefPitchesYesterday: r.reliefPitches,
        pitchersUsedYesterday: r.pitchersUsed,
        load: classifyLoad(r.reliefInnings),
      });
    }
    if (away?.team?.name) {
      const r = computeReliefLoad(away);
      out.set(away.team.name.toLowerCase(), {
        team: away.team.name,
        reliefInningsYesterday: r.reliefInnings,
        reliefPitchesYesterday: r.reliefPitches,
        pitchersUsedYesterday: r.pitchersUsed,
        load: classifyLoad(r.reliefInnings),
      });
    }
  }
  return out;
}

// Convert a load classification to a numeric bias contribution.
function loadBias(load: BullpenLoad["load"]): number {
  if (load === "tired") return 0.15;
  if (load === "fresh") return -0.10;
  return 0;
}

export function getBullpenMatchup(
  loads: Map<string, BullpenLoad>,
  homeTeam: string,
  awayTeam: string,
): BullpenMatchup | null {
  const home = loads.get(homeTeam.toLowerCase());
  const away = loads.get(awayTeam.toLowerCase());
  if (!home || !away) return null;
  const rawBias = loadBias(home.load) + loadBias(away.load);
  const totalBias = Math.max(-MAX_BIAS, Math.min(MAX_BIAS, rawBias));
  let reason: string | null = null;
  if (Math.abs(totalBias) >= 0.15) {
    const sign = totalBias > 0 ? "Both pens gassed" : "Both pens fresh";
    reason = `${sign} (yesterday: ${home.team} ${home.reliefInningsYesterday}IP, ${away.team} ${away.reliefInningsYesterday}IP)`;
  }
  return {
    homeTeam,
    awayTeam,
    home,
    away,
    totalBias: Math.round(totalBias * 100) / 100,
    reason,
  };
}
