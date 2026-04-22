import { NextResponse } from "next/server";
import { getNBAPlayerStats, type PlayerStats } from "@/lib/espn-stats";

export const dynamic = "force-dynamic";

type PropRow = {
  player: string;
  team: string;
  stat: "points" | "rebounds" | "assists";
  average: number;
  typicalLine: number;
  edge: number;
  games: number;
};

// Build a typical sportsbook line from a season average.
// Lines are usually set a bit below a player's average to balance action.
function typicalLine(avg: number, buffer: number): number {
  // Floor to .5 — e.g. avg 27.3, buffer 2.5 → line 24.5
  const raw = avg - buffer;
  return Math.floor(raw) + 0.5;
}

function topN(
  players: PlayerStats[],
  stat: "points" | "rebounds" | "assists",
  buffer: number,
  edge: number,
  limit = 10,
): PropRow[] {
  return [...players]
    .filter((p) => p.gamesPlayed >= 10 && (p.stats[stat] || 0) > 0)
    .sort((a, b) => (b.stats[stat] || 0) - (a.stats[stat] || 0))
    .slice(0, limit)
    .map((p) => {
      const avg = p.stats[stat] || 0;
      return {
        player: p.name,
        team: p.team,
        stat,
        average: Math.round(avg * 10) / 10,
        typicalLine: typicalLine(avg, buffer),
        edge,
        games: p.gamesPlayed,
      };
    });
}

export async function GET() {
  const players = await getNBAPlayerStats();

  if (players.length === 0) {
    return NextResponse.json({
      points: [],
      rebounds: [],
      assists: [],
      updated: new Date().toISOString(),
      error: "Unable to fetch player stats",
    });
  }

  const points = topN(players, "points", 2.5, 3);
  const rebounds = topN(players, "rebounds", 1.5, 2);
  const assists = topN(players, "assists", 1.5, 2);

  return NextResponse.json({
    points,
    rebounds,
    assists,
    updated: new Date().toISOString(),
  });
}
