import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  // Get start of today UTC
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  // Check for today's parlays
  const { data: todayParlays } = await supabase
    .from("parlays")
    .select("*")
    .gte("created_at", today.toISOString())
    .order("confidence", { ascending: false })
    .limit(1);

  if (todayParlays && todayParlays.length > 0) {
    return NextResponse.json({
      potd: todayParlays[0],
      source: "database",
      generatedAt: todayParlays[0].created_at,
    });
  }

  // No parlays today — generate fresh ones
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

  try {
    const res = await fetch(`${baseUrl}/api/parlays?sports=nba,mlb,nhl&legs=3&count=5`);
    if (res.ok) {
      const data = await res.json();
      const parlays = data.parlays || [];
      if (parlays.length > 0) {
        // Pick highest confidence
        const best = parlays.reduce(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (a: any, b: any) => (b.confidence > a.confidence ? b : a),
          parlays[0]
        );
        return NextResponse.json({
          potd: best,
          source: "fresh",
          generatedAt: new Date().toISOString(),
        });
      }
    }
  } catch {
    // Fall through to return null
  }

  return NextResponse.json({ potd: null, source: "none" });
}
