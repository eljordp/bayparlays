import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  // Get start of today UTC
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  // Find today's parlay with the highest combined_decimal (= highest odds = craziest)
  const { data: todayParlays } = await supabase
    .from("parlays")
    .select("*")
    .gte("created_at", today.toISOString())
    .order("combined_decimal", { ascending: false })
    .limit(1);

  // Also get the history — top crazy parlay per day for the last 14 days
  const twoWeeksAgo = new Date();
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

  const { data: allRecent } = await supabase
    .from("parlays")
    .select("*")
    .gte("created_at", twoWeeksAgo.toISOString())
    .order("combined_decimal", { ascending: false })
    .limit(100);

  // Group by date and pick the highest odds per day
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const byDate = new Map<string, any>();
  for (const p of allRecent || []) {
    const date = new Date(p.created_at).toISOString().split("T")[0];
    if (!byDate.has(date) || p.combined_decimal > byDate.get(date).combined_decimal) {
      byDate.set(date, p);
    }
  }

  const history = Array.from(byDate.values())
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return NextResponse.json({
    crazy: todayParlays?.[0] || history[0] || null,
    history,
  });
}
