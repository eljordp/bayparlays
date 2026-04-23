// ─── ESPN WNBA Stats Helper ──────────────────────────────────────────────────
// Pulls WNBA player season averages from ESPN's public stats API (no key needed).
// Mirrors lib/espn-stats.ts — the WNBA byathlete schema is identical to the
// NBA one: same `general` / `offensive` / `defensive` categories, same stat
// names (avgPoints, avgRebounds, avgThreePointFieldGoalsMade, etc.).
//
// WNBA season runs roughly mid-May through October. ESPN labels seasons by the
// calendar year (single year, unlike NBA). During the offseason (Nov–Apr) the
// current year returns empty; we fall back to the prior year.

import type { PlayerStats } from "./espn-stats";

const statsCache = new Map<string, { data: PlayerStats[]; expires: number }>();

interface EspnStatsCategorySpec {
  name: string;
  names: string[];
}

interface EspnStatsCategoryValues {
  name: string;
  values: (number | null)[];
}

interface EspnAthleteRow {
  athlete: {
    displayName?: string;
    fullName?: string;
    shortName?: string;
    teamShortName?: string;
    position?: { abbreviation?: string };
  };
  categories: EspnStatsCategoryValues[];
}

interface EspnStatsResponse {
  pagination?: { pages?: number };
  categories?: EspnStatsCategorySpec[];
  athletes?: EspnAthleteRow[];
}

function currentSeasonYear(): number {
  // WNBA season is May–Oct (single calendar year label). Before May = off-
  // season; prior-year fallback will catch that case too, but starting
  // current-year minimizes retries during the season.
  const now = new Date();
  return now.getUTCMonth() >= 4 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
}

async function fetchStatsPage(
  season: number,
  page: number,
): Promise<EspnStatsResponse | null> {
  const url = `https://site.web.api.espn.com/apis/common/v3/sports/basketball/wnba/statistics/byathlete?season=${season}&seasontype=2&sort=offensive.avgPoints:desc&limit=50&page=${page}`;
  try {
    const res = await fetch(url, { next: { revalidate: 21600 } });
    if (!res.ok) return null;
    return (await res.json()) as EspnStatsResponse;
  } catch {
    return null;
  }
}

export async function getWNBAPlayerStats(): Promise<PlayerStats[]> {
  const cached = statsCache.get("wnba");
  if (cached && cached.expires > Date.now()) return cached.data;

  // Current season first, fall back to prior if offseason / no data yet.
  const seasons = [currentSeasonYear(), currentSeasonYear() - 1];

  for (const season of seasons) {
    const firstPage = await fetchStatsPage(season, 1);
    if (!firstPage?.athletes?.length || !firstPage.categories) continue;

    const categorySpec = new Map<string, Map<string, number>>();
    for (const spec of firstPage.categories) {
      const idx = new Map<string, number>();
      spec.names.forEach((n, i) => idx.set(n, i));
      categorySpec.set(spec.name, idx);
    }

    const getVal = (
      row: EspnAthleteRow,
      catName: string,
      statName: string,
    ): number => {
      const cat = row.categories.find((c) => c.name === catName);
      const idxMap = categorySpec.get(catName);
      if (!cat || !idxMap) return 0;
      const idx = idxMap.get(statName);
      if (idx === undefined) return 0;
      const v = cat.values[idx];
      return typeof v === "number" && Number.isFinite(v) ? v : 0;
    };

    // Up to 5 pages (250 players) — covers the full league easily.
    const totalPages = Math.min(firstPage.pagination?.pages || 1, 5);
    const extraPages = await Promise.all(
      Array.from({ length: Math.max(0, totalPages - 1) }, (_, i) =>
        fetchStatsPage(season, i + 2),
      ),
    );

    const allRows: EspnAthleteRow[] = [
      ...firstPage.athletes,
      ...extraPages.flatMap((p) => p?.athletes || []),
    ];

    const players: PlayerStats[] = allRows.map((row) => ({
      name: row.athlete.displayName || row.athlete.fullName || "",
      team: row.athlete.teamShortName || "",
      position: row.athlete.position?.abbreviation || "",
      gamesPlayed: getVal(row, "general", "gamesPlayed"),
      stats: {
        points: getVal(row, "offensive", "avgPoints"),
        rebounds: getVal(row, "general", "avgRebounds"),
        assists: getVal(row, "offensive", "avgAssists"),
        threes: getVal(row, "offensive", "avgThreePointFieldGoalsMade"),
        steals: getVal(row, "defensive", "avgSteals"),
        blocks: getVal(row, "defensive", "avgBlocks"),
      },
    }));

    if (players.length === 0) continue;

    statsCache.set("wnba", {
      data: players,
      expires: Date.now() + 6 * 60 * 60 * 1000,
    });
    return players;
  }

  return [];
}
