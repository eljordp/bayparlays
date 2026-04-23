// ─── ESPN NHL Stats Helper ───────────────────────────────────────────────────
// Pulls NHL skater season totals from ESPN's public stats API (no key needed).
// Same byathlete endpoint pattern as lib/espn-stats.ts + lib/espn-mlb-stats.ts.
//
// Skaters only for v1 — goalies have a different stat structure (saves, SV%,
// goals-against) and deserve their own analyzer. Per-game rates are computed
// locally because ESPN returns season totals, not averages.

export interface NHLSkaterStats {
  name: string;
  team: string;
  games: number;
  goals: number;
  assists: number;
  points: number;
  shotsOnGoal: number;
  goalsPerGame: number;
  assistsPerGame: number;
  pointsPerGame: number;
  shotsPerGame: number;
}

// Cache stats for 6 hours — season totals change slowly.
const statsCache = new Map<
  string,
  { data: NHLSkaterStats[]; expires: number }
>();

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
  // NHL season crosses Oct–Jun; ESPN uses the *ending* year as the season label.
  // Same logic as NBA.
  const now = new Date();
  return now.getUTCMonth() >= 9 ? now.getUTCFullYear() + 1 : now.getUTCFullYear();
}

async function fetchStatsPage(
  season: number,
  page: number,
): Promise<EspnStatsResponse | null> {
  const url = `https://site.web.api.espn.com/apis/common/v3/sports/hockey/nhl/statistics/byathlete?season=${season}&seasontype=2&sort=offensive.goals:desc&limit=50&page=${page}`;
  try {
    const res = await fetch(url, { next: { revalidate: 21600 } });
    if (!res.ok) return null;
    return (await res.json()) as EspnStatsResponse;
  } catch {
    return null;
  }
}

function buildCategoryIndex(
  response: EspnStatsResponse,
): Map<string, Map<string, number>> {
  const map = new Map<string, Map<string, number>>();
  for (const spec of response.categories || []) {
    const idx = new Map<string, number>();
    spec.names.forEach((n, i) => idx.set(n, i));
    map.set(spec.name, idx);
  }
  return map;
}

function readVal(
  row: EspnAthleteRow,
  catName: string,
  statName: string,
  specIndex: Map<string, Map<string, number>>,
): number {
  const cat = row.categories.find((c) => c.name === catName);
  const idxMap = specIndex.get(catName);
  if (!cat || !idxMap) return 0;
  const idx = idxMap.get(statName);
  if (idx === undefined) return 0;
  const v = cat.values[idx];
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

// ─── Skater stats ────────────────────────────────────────────────────────────

export async function getNHLSkaterStats(): Promise<NHLSkaterStats[]> {
  const cached = statsCache.get("nhl_skaters");
  if (cached && cached.expires > Date.now()) {
    return cached.data;
  }

  const seasons = [currentSeasonYear(), currentSeasonYear() - 1];

  for (const season of seasons) {
    const firstPage = await fetchStatsPage(season, 1);
    if (!firstPage?.athletes?.length || !firstPage.categories) continue;

    const specIndex = buildCategoryIndex(firstPage);

    // Up to 5 pages (250 skaters) — enough for all top-end prop candidates
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

    const skaters: NHLSkaterStats[] = allRows
      .map((row) => {
        // NHL "general" uses `games` (not `gamesPlayed`).
        const games = readVal(row, "general", "games", specIndex);
        const goals = readVal(row, "offensive", "goals", specIndex);
        const assists = readVal(row, "offensive", "assists", specIndex);
        const points = readVal(row, "offensive", "points", specIndex);
        // ESPN calls total shots `shotsTotal`, not `shotsOnGoal`.
        const shotsOnGoal = readVal(row, "offensive", "shotsTotal", specIndex);
        return {
          name: row.athlete.displayName || row.athlete.fullName || "",
          team: row.athlete.teamShortName || "",
          games,
          goals,
          assists,
          points,
          shotsOnGoal,
          goalsPerGame: games > 0 ? goals / games : 0,
          assistsPerGame: games > 0 ? assists / games : 0,
          pointsPerGame: games > 0 ? points / games : 0,
          shotsPerGame: games > 0 ? shotsOnGoal / games : 0,
        };
      })
      // Exclude goalies and players with no real ice time.
      // Goalies have 0 goals + 0 assists but will hit this filter either way
      // since we also require points to be populated.
      .filter((s) => s.games >= 5 && s.points >= 0 && s.shotsOnGoal > 0);

    if (skaters.length === 0) continue;

    statsCache.set("nhl_skaters", {
      data: skaters,
      expires: Date.now() + 6 * 60 * 60 * 1000,
    });
    return skaters;
  }

  return [];
}
