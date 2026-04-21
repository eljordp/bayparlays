import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  // Get all sim bankrolls with user emails
  const { data: bankrolls } = await supabase
    .from("sim_bankroll")
    .select("user_id, balance, starting_balance, total_wagered, total_won, total_lost, wins, losses");

  if (!bankrolls || bankrolls.length === 0) {
    return NextResponse.json({ leaderboard: [] });
  }

  // Get emails for these users
  const userIds = bankrolls.map(b => b.user_id);
  const { data: users } = await supabase
    .from("users")
    .select("id, email")
    .in("id", userIds);

  const emailMap = new Map((users || []).map(u => [u.id, u.email]));

  // Calculate ROI and rank
  const ranked = bankrolls
    .map(b => {
      const profit = b.balance - b.starting_balance;
      const roi = b.total_wagered > 0 ? (profit / b.total_wagered) * 100 : 0;
      const winRate = b.wins + b.losses > 0 ? (b.wins / (b.wins + b.losses)) * 100 : 0;
      const email = emailMap.get(b.user_id) || "Unknown";
      // Truncate email for privacy
      const displayName = email.length > 6 ? email.slice(0, 3) + "...@" + email.split("@")[1] : email;

      return {
        userId: b.user_id,
        displayName,
        balance: b.balance,
        startingBalance: b.starting_balance,
        profit,
        roi: Math.round(roi * 10) / 10,
        winRate: Math.round(winRate * 10) / 10,
        wins: b.wins,
        losses: b.losses,
        totalWagered: b.total_wagered,
      };
    })
    .filter(b => b.wins + b.losses > 0) // Only show users who have placed bets
    .sort((a, b) => b.roi - a.roi);

  return NextResponse.json({ leaderboard: ranked });
}
