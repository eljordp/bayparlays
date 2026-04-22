// ─── ESPN Stats Helper ───────────────────────────────────────────────────────
// Pulls NBA player season averages from ESPN's public stats API (no key needed).
// Used by the Prop Analyzer to flag props where a player's average is way
// above/below the sportsbook line.

export interface PlayerStats {
  name: string;
  team: string;
  position: string;
  gamesPlayed: number;
  stats: {
    points?: number;
    rebounds?: number;
    assists?: number;
    threes?: number;
    steals?: number;
    blocks?: number;
  };
}

// Cache stats for 6 hours — season averages change slowly.
const statsCache = new Map<string, { data: PlayerStats[]; expires: number }>();

interface EspnStatsCategorySpec {
  name: string;
  names: string[];
}

interface EspnStatsCategoryValues {
  name: string;
  values: number[];
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
  // NBA season crosses Oct–Jun; ESPN uses the *ending* year as the season label.
  const now = new Date();
  return now.getUTCMonth() >= 9 ? now.getUTCFullYear() + 1 : now.getUTCFullYear();
}

async function fetchStatsPage(season: number, page: number): Promise<EspnStatsResponse | null> {
  const url = `https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/statistics/byathlete?season=${season}&sort=offensive.avgPoints:desc&limit=50&page=${page}`;
  try {
    const res = await fetch(url, { next: { revalidate: 21600 } });
    if (!res.ok) return null;
    return (await res.json()) as EspnStatsResponse;
  } catch {
    return null;
  }
}

// NBA player stats from ESPN's byathlete endpoint
export async function getNBAPlayerStats(): Promise<PlayerStats[]> {
  const cached = statsCache.get("nba");
  if (cached && cached.expires > Date.now()) return cached.data;

  // Try current season, fall back to prior if it's preseason / no data yet
  const seasons = [currentSeasonYear(), currentSeasonYear() - 1];

  for (const season of seasons) {
    const firstPage = await fetchStatsPage(season, 1);
    if (!firstPage?.athletes?.length || !firstPage.categories) continue;

    // Build name-index maps for each stat category
    const categorySpec = new Map<string, Map<string, number>>();
    for (const spec of firstPage.categories) {
      const idx = new Map<string, number>();
      spec.names.forEach((n, i) => idx.set(n, i));
      categorySpec.set(spec.name, idx);
    }

    const getVal = (row: EspnAthleteRow, catName: string, statName: string): number => {
      const cat = row.categories.find((c) => c.name === catName);
      const idxMap = categorySpec.get(catName);
      if (!cat || !idxMap) return 0;
      const idx = idxMap.get(statName);
      if (idx === undefined) return 0;
      const v = cat.values[idx];
      return typeof v === "number" && Number.isFinite(v) ? v : 0;
    };

    // Pull up to 5 pages (250 players) — covers all meaningful prop candidates
    const totalPages = Math.min(firstPage.pagination?.pages || 1, 5);
    const extraPages = await Promise.all(
      Array.from({ length: Math.max(0, totalPages - 1) }, (_, i) =>
        fetchStatsPage(season, i + 2)
      )
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

    statsCache.set("nba", {
      data: players,
      expires: Date.now() + 6 * 60 * 60 * 1000,
    });
    return players;
  }

  return [];
}

// Find a player by name (fuzzy match)
export function findPlayer(
  players: PlayerStats[],
  name: string,
): PlayerStats | null {
  const normalizedName = name.toLowerCase().replace(/[^a-z]/g, "");
  if (!normalizedName) return null;

  return (
    players.find((p) => {
      const pName = p.name.toLowerCase().replace(/[^a-z]/g, "");
      if (!pName) return false;
      return pName.includes(normalizedName) || normalizedName.includes(pName);
    }) || null
  );
}

// Analyze a prop vs player average
export interface PropAnalysis {
  playerName: string;
  line: number;
  avg: number;
  direction: "over" | "under";
  edge: number; // positive = we like the pick
  confidence: "lock" | "strong" | "lean" | "pass";
}

export function analyzeProp(
  players: PlayerStats[],
  playerName: string,
  statType: "points" | "rebounds" | "assists" | "threes" | "steals" | "blocks",
  line: number,
  direction: "over" | "under",
): PropAnalysis | null {
  const player = findPlayer(players, playerName);
  if (!player || player.gamesPlayed < 5) return null;

  const avg = player.stats[statType];
  if (avg === undefined || avg === null) return null;

  // Edge = how far player's average is from the line
  const rawEdge = avg - line;
  const edge = direction === "over" ? rawEdge : -rawEdge;

  let confidence: "lock" | "strong" | "lean" | "pass" = "pass";
  if (edge >= 5) confidence = "lock";
  else if (edge >= 2.5) confidence = "strong";
  else if (edge >= 1) confidence = "lean";

  return {
    playerName: player.name,
    line,
    avg,
    direction,
    edge: Math.round(edge * 10) / 10,
    confidence,
  };
}
