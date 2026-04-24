import { NextRequest, NextResponse } from "next/server";
import { getLiveGameStatuses } from "@/lib/live-game-status";

export const dynamic = "force-dynamic";

/**
 * Returns live status for today's (and yesterday's) games across the
 * requested sports. Used by /my-stats to show "Starts 7:10 PM" / "LIVE ·
 * Q3 5:42" / "Final 112-108" on each leg of pending sim parlays.
 *
 * Query: ?sports=NBA,MLB,NHL  (comma-separated, case-insensitive)
 * Returns: { games: GameStatus[] }
 */
export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("sports") ?? "NBA,MLB,NHL,NFL,WNBA,NCAAB,NCAAF";
  const sports = raw
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  const statusMap = await getLiveGameStatuses(sports);
  const games = Array.from(statusMap.values());

  return NextResponse.json(
    { games },
    {
      headers: {
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
      },
    },
  );
}
