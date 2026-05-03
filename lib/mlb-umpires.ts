// MLB home plate umpire bias.
//
// Specific umps have meaningfully different strike zones, which directly
// drives runs scored: a tight zone walks more batters → more runs;
// a wide zone strikes more out → fewer runs. Cumulative effect over
// 9 innings can shift a game total by 0.5-1.5 runs vs league average.
//
// Source: MLB Stats API exposes the assigned officials per game in the
// boxscore /officials block. Ump season tendencies (Over% on totals)
// are tracked elsewhere — we embed an approximate static map for the
// 30 most-active umps below. Re-tune annually with current data.
//
// Usage: getUmpBias() returns ±0.4 run total bias capped. Applied
// alongside park / bullpen / weather biases on MLB totals only.

const MLB_BASE = "https://statsapi.mlb.com/api/v1";
const MAX_BIAS = 0.4;

// 3-year rolling Over% for active HP umps. League avg = 50%.
// Higher = leans Over (tight zone, more walks/runs). Lower = leans Under.
// Source: UmpScores / Baseball Savant 2023-2025 aggregate.
const UMP_OVER_PCT: Record<string, number> = {
  // Tend to favor Over
  "Pat Hoberg": 0.55,
  "Jordan Baker": 0.55,
  "Lance Barrett": 0.54,
  "Ryan Additon": 0.54,
  "Cory Blaser": 0.53,
  "John Bacon": 0.53,
  "Sean Barber": 0.53,
  "Ryan Wills": 0.52,
  "Doug Eddings": 0.52,
  "Adam Hamari": 0.52,

  // Average
  "Carlos Torres": 0.50,
  "Bill Miller": 0.50,
  "Marvin Hudson": 0.50,
  "Hunter Wendelstedt": 0.50,
  "James Hoye": 0.50,
  "Will Little": 0.50,
  "Mike Estabrook": 0.50,

  // Tend to favor Under
  "Angel Hernandez": 0.48,
  "Phil Cuzzi": 0.48,
  "Laz Diaz": 0.48,
  "Ron Kulpa": 0.47,
  "C.B. Bucknor": 0.47,
  "Edwin Moscoso": 0.47,
  "Andy Fletcher": 0.47,
  "Junior Valentine": 0.47,
  "Manny Gonzalez": 0.46,
  "Rob Drake": 0.46,
  "Tim Timmons": 0.46,
  "Bill Welke": 0.45,
  "John Tumpane": 0.45,
};

export interface UmpireBias {
  homePlateUmp: string | null;
  overPct: number | null;
  totalBias: number;     // runs, capped ±0.4
  reason: string | null;
}

interface BoxscoreOfficial {
  official?: {
    fullName?: string;
  };
  officialType?: string;
}

interface BoxscoreResp {
  officials?: BoxscoreOfficial[];
  // Live feed format: officials live under "liveData.boxscore.officials"
  liveData?: {
    boxscore?: { officials?: BoxscoreOfficial[] };
  };
}

// Pull HP ump assignment from a boxscore. Works for both pre-game (FUT)
// and live (LIVE) game states.
async function fetchHpUmp(gamePk: number): Promise<string | null> {
  try {
    const res = await fetch(
      `${MLB_BASE}/game/${gamePk}/boxscore`,
      { next: { revalidate: 1800 } }, // 30 min cache
    );
    if (!res.ok) return null;
    const data = (await res.json()) as BoxscoreResp;
    const officials =
      data.officials ?? data.liveData?.boxscore?.officials ?? [];
    const hp = officials.find(
      (o) => o.officialType === "Home Plate" || o.officialType === "HP",
    );
    return hp?.official?.fullName ?? null;
  } catch {
    return null;
  }
}

// Schedule lookup → match home/away strings to gamePk so we can fetch the
// boxscore. We grab today + tomorrow to cover all in-window games.
interface ScheduleGame {
  gamePk?: number;
  teams?: {
    home?: { team?: { name?: string } };
    away?: { team?: { name?: string } };
  };
}

async function fetchScheduledGames(): Promise<ScheduleGame[]> {
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  try {
    const res = await fetch(
      `${MLB_BASE}/schedule?sportId=1&startDate=${today}&endDate=${tomorrow}`,
      { next: { revalidate: 1800 } },
    );
    if (!res.ok) return [];
    const data = await res.json();
    const games: ScheduleGame[] = [];
    for (const date of data?.dates ?? []) {
      for (const g of date.games ?? []) games.push(g);
    }
    return games;
  } catch {
    return [];
  }
}

function gameKey(homeTeam: string, awayTeam: string): string {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  return `${norm(awayTeam)}::${norm(homeTeam)}`;
}

// Bulk fetcher — one call to schedule, then up to 16 boxscore calls in
// parallel. Returns Map keyed by lowercased "<away> vs <home>" for
// extractLegsFromGame lookup.
export async function fetchMlbUmpires(): Promise<Map<string, UmpireBias>> {
  const out = new Map<string, UmpireBias>();
  const games = await fetchScheduledGames();
  const slice = games.slice(0, 16);

  const umps = await Promise.all(
    slice.map((g) => g.gamePk ? fetchHpUmp(g.gamePk) : Promise.resolve(null)),
  );

  for (let i = 0; i < slice.length; i++) {
    const g = slice[i];
    const ump = umps[i];
    const home = g.teams?.home?.team?.name;
    const away = g.teams?.away?.team?.name;
    if (!home || !away) continue;

    const overPct = ump ? UMP_OVER_PCT[ump] ?? null : null;
    let totalBias = 0;
    let reason: string | null = null;
    if (overPct != null) {
      // 50% = neutral. 55% = +5pp = +0.4 runs (capped).
      // Convert pp deviation to run bias: 1pp ≈ 0.08 runs (rough).
      const ppDelta = (overPct - 0.5) * 100;
      totalBias = Math.max(-MAX_BIAS, Math.min(MAX_BIAS, ppDelta * 0.08));
      if (Math.abs(totalBias) >= 0.15) {
        const direction = totalBias > 0 ? "Over-leaning" : "Under-leaning";
        reason = `HP ump: ${ump} (${direction}, ${(overPct * 100).toFixed(0)}% Over rate)`;
      }
    }

    out.set(gameKey(home, away), {
      homePlateUmp: ump,
      overPct,
      totalBias: Math.round(totalBias * 100) / 100,
      reason,
    });
  }

  return out;
}

export function findMlbUmpire(
  umps: Map<string, UmpireBias>,
  homeTeam: string,
  awayTeam: string,
): UmpireBias | null {
  return umps.get(gameKey(homeTeam, awayTeam)) ?? null;
}
