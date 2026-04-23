// ─── ESPN NFL Stats Helper ───────────────────────────────────────────────────
// Pulls NFL player season totals from ESPN's public stats API (no key needed).
// Same byathlete endpoint pattern as the other ESPN helpers in this folder.
//
// NFL season crosses Sept–Feb; ESPN labels seasons by the *starting* year.
// During offseason (Feb–Aug) the current year returns empty, so we fall back
// to the previous year. Seasontype=2 = regular season.
//
// ESPN NFL uses three main stat categories: `passing`, `rushing`, `receiving`.
// Each returns SEASON TOTALS + a server-computed per-game figure (e.g.
// `passingYardsPerGame`). We prefer the server figure and fall back to a
// hand computation only when it is missing.

export interface NFLPassingStats {
  name: string;
  team: string;
  games: number;
  passingYards: number;
  passingTds: number;
  interceptions: number;
  yardsPerGame: number;
  tdsPerGame: number;
}

export interface NFLRushingStats {
  name: string;
  team: string;
  games: number;
  rushingYards: number;
  rushingTds: number;
  yardsPerGame: number;
  tdsPerGame: number;
}

export interface NFLReceivingStats {
  name: string;
  team: string;
  games: number;
  receivingYards: number;
  receptions: number;
  receivingTds: number;
  yardsPerGame: number;
  recsPerGame: number;
  tdsPerGame: number;
}

type NFLStatCache =
  | { kind: "passing"; data: NFLPassingStats[]; expires: number }
  | { kind: "rushing"; data: NFLRushingStats[]; expires: number }
  | { kind: "receiving"; data: NFLReceivingStats[]; expires: number };

const statsCache = new Map<string, NFLStatCache>();

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
  // NFL regular season runs Sept–Jan; ESPN uses the starting year.
  // Before September = use prior year to get a full completed season.
  const now = new Date();
  return now.getUTCMonth() >= 8 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
}

async function fetchStatsPage(
  sort: string,
  season: number,
  page: number,
): Promise<EspnStatsResponse | null> {
  const url = `https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/statistics/byathlete?season=${season}&seasontype=2&sort=${sort}&limit=50&page=${page}`;
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

async function collectPages(
  sort: string,
  season: number,
): Promise<{
  rows: EspnAthleteRow[];
  specIndex: Map<string, Map<string, number>>;
} | null> {
  const firstPage = await fetchStatsPage(sort, season, 1);
  if (!firstPage?.athletes?.length || !firstPage.categories) return null;

  const specIndex = buildCategoryIndex(firstPage);
  // Up to 4 pages (200 players) — enough to cover all meaningful NFL props.
  const totalPages = Math.min(firstPage.pagination?.pages || 1, 4);
  const extraPages = await Promise.all(
    Array.from({ length: Math.max(0, totalPages - 1) }, (_, i) =>
      fetchStatsPage(sort, season, i + 2),
    ),
  );

  const rows: EspnAthleteRow[] = [
    ...firstPage.athletes,
    ...extraPages.flatMap((p) => p?.athletes || []),
  ];
  return { rows, specIndex };
}

// ─── Passing stats (QBs) ─────────────────────────────────────────────────────

export async function getNFLPassingStats(): Promise<NFLPassingStats[]> {
  const cached = statsCache.get("nfl_passing");
  if (cached && cached.kind === "passing" && cached.expires > Date.now()) {
    return cached.data;
  }

  const seasons = [currentSeasonYear(), currentSeasonYear() - 1];

  for (const season of seasons) {
    const collected = await collectPages("passing.passingYards:desc", season);
    if (!collected) continue;
    const { rows, specIndex } = collected;

    const qbs: NFLPassingStats[] = rows
      .map((row) => {
        const games = readVal(row, "general", "gamesPlayed", specIndex);
        const passingYards = readVal(row, "passing", "passingYards", specIndex);
        const passingTds = readVal(
          row,
          "passing",
          "passingTouchdowns",
          specIndex,
        );
        const interceptions = readVal(
          row,
          "passing",
          "interceptions",
          specIndex,
        );
        const yardsPerGameServer = readVal(
          row,
          "passing",
          "passingYardsPerGame",
          specIndex,
        );
        const yardsPerGame =
          yardsPerGameServer > 0
            ? yardsPerGameServer
            : games > 0
              ? passingYards / games
              : 0;
        return {
          name: row.athlete.displayName || row.athlete.fullName || "",
          team: row.athlete.teamShortName || "",
          games,
          passingYards,
          passingTds,
          interceptions,
          yardsPerGame,
          tdsPerGame: games > 0 ? passingTds / games : 0,
        };
      })
      // Meaningful QB workload only.
      .filter((q) => q.games >= 4 && q.passingYards >= 500);

    if (qbs.length === 0) continue;

    statsCache.set("nfl_passing", {
      kind: "passing",
      data: qbs,
      expires: Date.now() + 6 * 60 * 60 * 1000,
    });
    return qbs;
  }

  return [];
}

// ─── Rushing stats (RBs + anyone with carries) ───────────────────────────────

export async function getNFLRushingStats(): Promise<NFLRushingStats[]> {
  const cached = statsCache.get("nfl_rushing");
  if (cached && cached.kind === "rushing" && cached.expires > Date.now()) {
    return cached.data;
  }

  const seasons = [currentSeasonYear(), currentSeasonYear() - 1];

  for (const season of seasons) {
    const collected = await collectPages("rushing.rushingYards:desc", season);
    if (!collected) continue;
    const { rows, specIndex } = collected;

    const rushers: NFLRushingStats[] = rows
      .map((row) => {
        const games = readVal(row, "general", "gamesPlayed", specIndex);
        const rushingYards = readVal(row, "rushing", "rushingYards", specIndex);
        const rushingTds = readVal(
          row,
          "rushing",
          "rushingTouchdowns",
          specIndex,
        );
        const yardsPerGameServer = readVal(
          row,
          "rushing",
          "rushingYardsPerGame",
          specIndex,
        );
        const yardsPerGame =
          yardsPerGameServer > 0
            ? yardsPerGameServer
            : games > 0
              ? rushingYards / games
              : 0;
        return {
          name: row.athlete.displayName || row.athlete.fullName || "",
          team: row.athlete.teamShortName || "",
          games,
          rushingYards,
          rushingTds,
          yardsPerGame,
          tdsPerGame: games > 0 ? rushingTds / games : 0,
        };
      })
      // Workload filter — drop QB-scrambler rows + minor contributors.
      .filter((r) => r.games >= 4 && r.rushingYards >= 200);

    if (rushers.length === 0) continue;

    statsCache.set("nfl_rushing", {
      kind: "rushing",
      data: rushers,
      expires: Date.now() + 6 * 60 * 60 * 1000,
    });
    return rushers;
  }

  return [];
}

// ─── Receiving stats (WR/TE + pass-catching RBs) ─────────────────────────────

export async function getNFLReceivingStats(): Promise<NFLReceivingStats[]> {
  const cached = statsCache.get("nfl_receiving");
  if (cached && cached.kind === "receiving" && cached.expires > Date.now()) {
    return cached.data;
  }

  const seasons = [currentSeasonYear(), currentSeasonYear() - 1];

  for (const season of seasons) {
    const collected = await collectPages(
      "receiving.receivingYards:desc",
      season,
    );
    if (!collected) continue;
    const { rows, specIndex } = collected;

    const receivers: NFLReceivingStats[] = rows
      .map((row) => {
        const games = readVal(row, "general", "gamesPlayed", specIndex);
        const receivingYards = readVal(
          row,
          "receiving",
          "receivingYards",
          specIndex,
        );
        const receptions = readVal(row, "receiving", "receptions", specIndex);
        const receivingTds = readVal(
          row,
          "receiving",
          "receivingTouchdowns",
          specIndex,
        );
        const yardsPerGameServer = readVal(
          row,
          "receiving",
          "receivingYardsPerGame",
          specIndex,
        );
        const yardsPerGame =
          yardsPerGameServer > 0
            ? yardsPerGameServer
            : games > 0
              ? receivingYards / games
              : 0;
        return {
          name: row.athlete.displayName || row.athlete.fullName || "",
          team: row.athlete.teamShortName || "",
          games,
          receivingYards,
          receptions,
          receivingTds,
          yardsPerGame,
          recsPerGame: games > 0 ? receptions / games : 0,
          tdsPerGame: games > 0 ? receivingTds / games : 0,
        };
      })
      // Drop random low-volume rows.
      .filter((r) => r.games >= 4 && r.receivingYards >= 150);

    if (receivers.length === 0) continue;

    statsCache.set("nfl_receiving", {
      kind: "receiving",
      data: receivers,
      expires: Date.now() + 6 * 60 * 60 * 1000,
    });
    return receivers;
  }

  return [];
}
