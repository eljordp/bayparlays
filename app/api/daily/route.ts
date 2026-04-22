import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  // Optional auth: if CRON_SECRET is set, require it. Vercel's built-in cron
  // adds the header automatically. External triggers (GitHub Actions etc)
  // must pass Authorization: Bearer <secret>. If unset, endpoint stays open.
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

  const results: Record<string, unknown> = {};

  // Step 1: Check scores for completed games
  try {
    const scoreRes = await fetch(`${baseUrl}/api/track/check-scores`, { method: "GET" });
    results.scores = await scoreRes.json();
  } catch (e) {
    results.scores = { error: String(e) };
  }

  // Step 2: Generate fresh parlays across all active sports
  // Only 2 combos to conserve API quota (free tier = 500 requests/mo)
  // Side effect: /api/parlays also snapshots current best lines into
  // the line_history table for downstream line-movement analysis.
  const sportCombos = [
    { sports: "nba,mlb,nhl", legs: 2 },
    { sports: "nba,mlb,nhl", legs: 3 },
  ];

  const generated: { sports: string; legs: number; count: number }[] = [];

  for (const combo of sportCombos) {
    try {
      const res = await fetch(
        `${baseUrl}/api/parlays?sports=${combo.sports}&legs=${combo.legs}&count=3`
      );
      if (res.ok) {
        const data = await res.json();
        generated.push({
          sports: combo.sports,
          legs: combo.legs,
          count: data.parlays?.length || 0,
        });
      }
    } catch {
      // Continue generating others even if one fails
    }
  }

  results.generated = generated;

  // Step 3: Resolve pending sim parlays
  try {
    const simRes = await fetch(`${baseUrl}/api/sim/resolve`);
    results.simResolution = await simRes.json();
  } catch (e) {
    results.simResolution = { error: String(e) };
  }

  results.timestamp = new Date().toISOString();

  return NextResponse.json(results);
}
