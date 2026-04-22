// ─── ESPN Stats Helper ───────────────────────────────────────────────────────
// Pulls NBA player season averages from ESPN's public API (no key required).
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

// Minimal shape of ESPN's athlete response (fields we touch)
interface EspnAthlete {
  active?: boolean;
  fullName?: string;
  displayName?: string;
  team?: { abbreviation?: string };
  position?: { abbreviation?: string };
  statistics?: {
    gamesPlayed?: number | string;
    points?: number | string;
    rebounds?: number | string;
    assists?: number | string;
    threePointFieldGoalsMade?: number | string;
    steals?: number | string;
    blocks?: number | string;
  };
}

function toNum(val: unknown): number {
  if (typeof val === "number") return val;
  if (typeof val === "string") {
    const n = parseFloat(val);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

// NBA player stats from ESPN
export async function getNBAPlayerStats(): Promise<PlayerStats[]> {
  const cached = statsCache.get("nba");
  if (cached && cached.expires > Date.now()) return cached.data;

  try {
    // ESPN's NBA athletes endpoint
    const res = await fetch(
      "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/athletes?limit=500",
      { next: { revalidate: 21600 } } // 6 hours
    );
    if (!res.ok) return [];

    const data = (await res.json()) as { athletes?: EspnAthlete[] };
    const players: PlayerStats[] = [];

    // ESPN returns athletes in data.athletes array
    for (const athlete of data.athletes || []) {
      if (athlete.active === false) continue;

      const s = athlete.statistics || {};
      players.push({
        name: athlete.fullName || athlete.displayName || "",
        team: athlete.team?.abbreviation || "",
        position: athlete.position?.abbreviation || "",
        gamesPlayed: toNum(s.gamesPlayed),
        stats: {
          points: toNum(s.points),
          rebounds: toNum(s.rebounds),
          assists: toNum(s.assists),
          threes: toNum(s.threePointFieldGoalsMade),
          steals: toNum(s.steals),
          blocks: toNum(s.blocks),
        },
      });
    }

    statsCache.set("nba", {
      data: players,
      expires: Date.now() + 6 * 60 * 60 * 1000,
    });
    return players;
  } catch {
    return [];
  }
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
