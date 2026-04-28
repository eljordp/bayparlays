import { NextResponse } from "next/server";
import { getOddsApiKey } from "@/lib/odds-key";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Live Odds API quota check. Probes /sports (0-credit endpoint) and reads
// x-requests-* headers. Resolves the active key from Supabase via lib/odds-key
// so freshly rotated keys reflect immediately in the badge.

export async function GET() {
  const apiKey = await getOddsApiKey();
  if (!apiKey) {
    return NextResponse.json({ error: "No Odds API key available" }, { status: 500 });
  }
  try {
    const res = await fetch(
      `https://api.the-odds-api.com/v4/sports?apiKey=${apiKey}`,
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
        keyTail: apiKey.slice(-4),
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
