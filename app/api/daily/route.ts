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

  // Step 2: Generate fresh parlays — vary leg count AND category so the
  // public track record captures all three AI strategies, not just default EV.
  // Each call to /api/parlays is 1 Odds API hit (cached 5min); keeping combos
  // modest for quota. Bumped to count=20 (was 5) since the insert-side dedup
  // now handles cross-batch duplicates via leg-signature matching, so a wider
  // pool gives the calibration loop more variance to learn from.
  // Favor 2-leg parlays: each extra leg adds ~5% vig, so 2-leg has structurally
  // better EV than 3-leg. Three 2-leg combos + two 3-leg combos, across all
  // three strategies. The EV gate at insert time (evPercent >= 5) means this
  // only fills the table with parlays the model actually stands behind.
  const sportCombos: { sports: string; legs: number; sort: "ev" | "payout" | "confidence" }[] = [
    { sports: "nba,mlb,nhl", legs: 2, sort: "ev" },
    { sports: "nba,mlb,nhl", legs: 2, sort: "confidence" },
    { sports: "nba,mlb,nhl", legs: 2, sort: "payout" },
    { sports: "nba,mlb,nhl", legs: 3, sort: "ev" },
    { sports: "nba,mlb,nhl", legs: 3, sort: "confidence" },
    // "Craziest Parlay of the Day" — 3-leg longshot generator. Tier=admin
    // relaxes edge/quality filters so legs with high odds (underdogs) can
    // make it into the pool. sort=payout picks the highest combined_decimal
    // from the pool. Widen sports to include college + NCAAB for more
    // longshot candidates since NBA/MLB favorites are usually tightly priced.
    { sports: "nba,mlb,nhl,ncaab,ncaaf", legs: 3, sort: "payout" },
  ];

  const generated: { sports: string; legs: number; sort: string; count: number }[] = [];

  for (const combo of sportCombos) {
    try {
      // Tracked record uses "sharp" tier for regular picks. The crazy
      // 3-leg longshot combo uses "admin" tier to widen the pool enough
      // for heavy-underdog legs to survive filtering — otherwise the
      // standard edge floor keeps them all out.
      const tier =
        combo.legs === 3 && combo.sort === "payout" ? "admin" : "sharp";
      const res = await fetch(
        `${baseUrl}/api/parlays?sports=${combo.sports}&legs=${combo.legs}&sort=${combo.sort}&count=20&tier=${tier}`
      );
      if (res.ok) {
        const data = await res.json();
        generated.push({
          sports: combo.sports,
          legs: combo.legs,
          sort: combo.sort,
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

  // Step 4: Warm props cache for every supported sport so morning visitors get
  // fresh numbers without paying the cold-fetch latency. ESPN is free and
  // unlimited — zero cost to hit every sport.
  const propsSports = ["nba", "wnba", "mlb", "nhl", "nfl", "mls", "epl"];
  const propsWarmed: string[] = [];
  for (const sport of propsSports) {
    try {
      const res = await fetch(`${baseUrl}/api/props?sport=${sport}`, {
        cache: "no-store",
      });
      if (res.ok) propsWarmed.push(sport);
    } catch {
      /* continue */
    }
  }
  results.propsWarmed = propsWarmed;

  results.timestamp = new Date().toISOString();

  return NextResponse.json(results);
}
