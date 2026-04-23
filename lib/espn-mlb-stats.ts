// ─── ESPN MLB Stats Helper ───────────────────────────────────────────────────
// Pulls MLB player season totals from ESPN's public stats API (no key needed).
// Follows the same byathlete endpoint pattern as lib/espn-stats.ts.
//
// IMPORTANT: Unlike the NBA endpoint (which returns per-game averages),
// the MLB endpoint returns SEASON TOTALS. We compute per-game rates ourselves.

export interface MLBPitcherStats {
  name: string;
  team: string;
  strikeouts: number;
  inningsPitched: number;
  era: number;
  whip: number;
  starts: number;
  kPer9: number;
}

export interface MLBBatterStats {
  name: string;
  team: string;
  games: number;
  homeRuns: number;
  rbi: number;
  hits: number;
  avg: number;
  hrPerGame: number;
  rbiPerGame: number;
  hitsPerGame: number;
}

// Cache stats for 6 hours — season totals change slowly.
const statsCache = new Map<
  string,
  { data: MLBPitcherStats[] | MLBBatterStats[]; expires: number }
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
  // MLB regular season is Apr–Oct. ESPN uses the calendar year as the label.
  // Before March = off-season; use prior year.
  const now = new Date();
  return now.getUTCMonth() >= 2 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
}

async function fetchStatsPage(
  kind: "pitching" | "batting",
  season: number,
  page: number,
): Promise<EspnStatsResponse | null> {
  const sort =
    kind === "pitching"
      ? "pitching.strikeouts:desc"
      : "batting.homeRuns:desc";
  const url = `https://site.web.api.espn.com/apis/common/v3/sports/baseball/mlb/statistics/byathlete?season=${season}&seasontype=2&sort=${sort}&limit=50&page=${page}`;
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

// ─── Pitcher stats ───────────────────────────────────────────────────────────

export async function getMLBPitcherStats(): Promise<MLBPitcherStats[]> {
  const cached = statsCache.get("mlb_pitchers");
  if (cached && cached.expires > Date.now()) {
    return cached.data as MLBPitcherStats[];
  }

  const seasons = [currentSeasonYear(), currentSeasonYear() - 1];

  for (const season of seasons) {
    const firstPage = await fetchStatsPage("pitching", season, 1);
    if (!firstPage?.athletes?.length || !firstPage.categories) continue;

    const specIndex = buildCategoryIndex(firstPage);

    // Up to 5 pages (250 pitchers)
    const totalPages = Math.min(firstPage.pagination?.pages || 1, 5);
    const extraPages = await Promise.all(
      Array.from({ length: Math.max(0, totalPages - 1) }, (_, i) =>
        fetchStatsPage("pitching", season, i + 2),
      ),
    );

    const allRows: EspnAthleteRow[] = [
      ...firstPage.athletes,
      ...extraPages.flatMap((p) => p?.athletes || []),
    ];

    const pitchers: MLBPitcherStats[] = allRows
      .map((row) => {
        const starts = readVal(row, "pitching", "gamesStarted", specIndex);
        const strikeouts = readVal(row, "pitching", "strikeouts", specIndex);
        const inningsPitched = readVal(row, "pitching", "innings", specIndex);
        const era = readVal(row, "pitching", "ERA", specIndex);
        const whip = readVal(row, "pitching", "WHIP", specIndex);
        // ESPN exposes K/9 directly as strikeoutsPerNineInnings.
        // Fall back to hand-calc if missing or zero.
        const kPer9Raw = readVal(
          row,
          "pitching",
          "strikeoutsPerNineInnings",
          specIndex,
        );
        const kPer9 =
          kPer9Raw > 0
            ? kPer9Raw
            : inningsPitched > 0
              ? (strikeouts * 9) / inningsPitched
              : 0;
        return {
          name: row.athlete.displayName || row.athlete.fullName || "",
          team: row.athlete.teamShortName || "",
          strikeouts,
          inningsPitched,
          era,
          whip,
          starts,
          kPer9,
        };
      })
      // Keep only starters with meaningful workload
      .filter((p) => p.starts >= 3 && p.strikeouts > 0);

    if (pitchers.length === 0) continue;

    statsCache.set("mlb_pitchers", {
      data: pitchers,
      expires: Date.now() + 6 * 60 * 60 * 1000,
    });
    return pitchers;
  }

  return [];
}

// ─── Batter stats ────────────────────────────────────────────────────────────

export async function getMLBBatterStats(): Promise<MLBBatterStats[]> {
  const cached = statsCache.get("mlb_batters");
  if (cached && cached.expires > Date.now()) {
    return cached.data as MLBBatterStats[];
  }

  const seasons = [currentSeasonYear(), currentSeasonYear() - 1];

  for (const season of seasons) {
    const firstPage = await fetchStatsPage("batting", season, 1);
    if (!firstPage?.athletes?.length || !firstPage.categories) continue;

    const specIndex = buildCategoryIndex(firstPage);

    // Up to 5 pages (250 batters)
    const totalPages = Math.min(firstPage.pagination?.pages || 1, 5);
    const extraPages = await Promise.all(
      Array.from({ length: Math.max(0, totalPages - 1) }, (_, i) =>
        fetchStatsPage("batting", season, i + 2),
      ),
    );

    const allRows: EspnAthleteRow[] = [
      ...firstPage.athletes,
      ...extraPages.flatMap((p) => p?.athletes || []),
    ];

    const batters: MLBBatterStats[] = allRows
      .map((row) => {
        const games = readVal(row, "batting", "gamesPlayed", specIndex);
        const homeRuns = readVal(row, "batting", "homeRuns", specIndex);
        const rbi = readVal(row, "batting", "RBIs", specIndex);
        const hits = readVal(row, "batting", "hits", specIndex);
        const avg = readVal(row, "batting", "avg", specIndex);
        return {
          name: row.athlete.displayName || row.athlete.fullName || "",
          team: row.athlete.teamShortName || "",
          games,
          homeRuns,
          rbi,
          hits,
          avg,
          hrPerGame: games > 0 ? homeRuns / games : 0,
          rbiPerGame: games > 0 ? rbi / games : 0,
          hitsPerGame: games > 0 ? hits / games : 0,
        };
      })
      // Only batters with real playing time
      .filter((b) => b.games >= 10 && b.hits > 0);

    if (batters.length === 0) continue;

    statsCache.set("mlb_batters", {
      data: batters,
      expires: Date.now() + 6 * 60 * 60 * 1000,
    });
    return batters;
  }

  return [];
}
