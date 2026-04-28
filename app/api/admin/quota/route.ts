import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Live Odds API quota check.
//
// The-odds-api.com returns x-requests-used / x-requests-remaining in the
// headers of every response, including cheap endpoints like /sports.
// Hitting /sports costs 0 credits, so this is a free probe.
//
// Use this to spot quota burn before it tanks the slate. Eyeball it in a
// browser tab; or wire a daily cron to ping it and flag low remaining.

const ODDS_API_KEY = process.env.ODDS_API_KEY;

export async function GET() {
  if (!ODDS_API_KEY) {
    return NextResponse.json({ error: "ODDS_API_KEY not set" }, { status: 500 });
  }
  try {
    const res = await fetch(
      `https://api.the-odds-api.com/v4/sports?apiKey=${ODDS_API_KEY}`,
      { cache: "no-store" },
    );
    const used = parseInt(res.headers.get("x-requests-used") || "0", 10);
    const remaining = parseInt(res.headers.get("x-requests-remaining") || "0", 10);
    const last = parseInt(res.headers.get("x-requests-last") || "0", 10);
    const total = used + remaining;

    // Tier categorization for at-a-glance reading
    let status: "healthy" | "warning" | "critical" | "exhausted";
    if (remaining === 0) status = "exhausted";
    else if (remaining < 50) status = "critical";
    else if (remaining < 150) status = "warning";
    else status = "healthy";

    return NextResponse.json(
      {
        used,
        remaining,
        total,
        lastCallCost: last,
        percentUsed: total > 0 ? Math.round((used / total) * 100) : 0,
        status,
        message:
          status === "exhausted"
            ? "Quota burned. Slate will publish empty until reset or new key."
            : status === "critical"
              ? "Less than 50 credits left. Rotate key today."
              : status === "warning"
                ? "Less than 150 credits left. Plan to rotate within 1-2 days."
                : "Healthy.",
        keyTail: ODDS_API_KEY.slice(-4),
        checkedAt: new Date().toISOString(),
      },
      {
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
