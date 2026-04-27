import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// Leaderboard ranks users by ROI on RESOLVED sim parlays only.
//
// Previously this read sim_bankroll, which deducts pending stakes from
// balance — meaning "current cash position" not "demonstrated edge."
// That penalized active users with money parked in pending bets and
// disagreed with /api/my-stats (which sums profit on resolved rows).
// Fix: aggregate sim_parlays directly so leaderboard ROI matches what
// users see on their own /my-stats card.

interface SimParlayRow {
  user_id: string;
  status: string;
  stake: number | null;
  profit: number | null;
}

export async function GET() {
  // Pull all resolved sim parlays. Paginate past Supabase's 1000-row default
  // so per-user totals don't get truncated for active users.
  const rows: SimParlayRow[] = [];
  const PAGE_SIZE = 1000;
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("sim_parlays")
      .select("user_id, status, stake, profit")
      .neq("status", "pending")
      .range(from, from + PAGE_SIZE - 1);
    if (error) {
      console.error("leaderboard sim_parlays query error:", error);
      return NextResponse.json({ leaderboard: [] });
    }
    if (!data || data.length === 0) break;
    rows.push(...(data as SimParlayRow[]));
    if (data.length < PAGE_SIZE) break;
  }

  if (rows.length === 0) {
    return NextResponse.json({ leaderboard: [] });
  }

  // Aggregate per user.
  type Agg = { wins: number; losses: number; profit: number; wagered: number };
  const byUser = new Map<string, Agg>();
  for (const r of rows) {
    const a = byUser.get(r.user_id) ?? { wins: 0, losses: 0, profit: 0, wagered: 0 };
    if (r.status === "won") a.wins++;
    else if (r.status === "lost") a.losses++;
    a.profit += r.profit ?? 0;
    a.wagered += r.stake ?? 0;
    byUser.set(r.user_id, a);
  }

  // Resolve emails for all the user_ids we have.
  const userIds = Array.from(byUser.keys());
  const { data: users } = await supabase
    .from("users")
    .select("id, email")
    .in("id", userIds);
  const emailMap = new Map((users || []).map((u) => [u.id, u.email]));

  const ranked = Array.from(byUser.entries())
    .map(([userId, a]) => {
      const total = a.wins + a.losses;
      const roi = a.wagered > 0 ? (a.profit / a.wagered) * 100 : 0;
      const winRate = total > 0 ? (a.wins / total) * 100 : 0;
      const email = emailMap.get(userId) || "Unknown";
      const displayName =
        email.length > 6 ? email.slice(0, 3) + "...@" + email.split("@")[1] : email;
      return {
        userId,
        displayName,
        profit: Math.round(a.profit * 100) / 100,
        roi: Math.round(roi * 10) / 10,
        winRate: Math.round(winRate * 10) / 10,
        wins: a.wins,
        losses: a.losses,
        totalWagered: Math.round(a.wagered * 100) / 100,
      };
    })
    .filter((u) => u.wins + u.losses > 0)
    .sort((a, b) => b.roi - a.roi);

  return NextResponse.json({ leaderboard: ranked });
}
