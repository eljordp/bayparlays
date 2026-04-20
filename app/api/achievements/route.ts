import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { BADGES } from "@/lib/badges";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get("user_id");
  if (!userId) return NextResponse.json({ error: "user_id required" }, { status: 400 });

  const { data: unlocked } = await supabase
    .from("achievements")
    .select("badge_id, unlocked_at")
    .eq("user_id", userId);

  const unlockedIds = new Set((unlocked || []).map((a: { badge_id: string }) => a.badge_id));

  return NextResponse.json({
    badges: BADGES.map((b) => ({
      ...b,
      unlocked: unlockedIds.has(b.id),
      unlocked_at: unlocked?.find((a: { badge_id: string }) => a.badge_id === b.id)?.unlocked_at || null,
    })),
    totalUnlocked: unlockedIds.size,
    totalAvailable: BADGES.length,
  });
}

export async function POST(request: NextRequest) {
  const { user_id } = await request.json();
  if (!user_id) return NextResponse.json({ error: "user_id required" }, { status: 400 });

  // Get user's sim stats
  const { data: bankroll } = await supabase
    .from("sim_bankroll")
    .select("*")
    .eq("user_id", user_id)
    .single();

  const { data: simParlays } = await supabase
    .from("sim_parlays")
    .select("*")
    .eq("user_id", user_id)
    .order("created_at", { ascending: true });

  // Get referral stats
  const { data: userRow } = await supabase
    .from("users")
    .select("referral_code")
    .eq("id", user_id)
    .single();

  let referralSignups = 0;
  if (userRow?.referral_code) {
    const { data: refData } = await supabase
      .from("referrals")
      .select("signups")
      .eq("referrer_code", userRow.referral_code)
      .single();
    referralSignups = refData?.signups || 0;
  }

  // Get existing achievements
  const { data: existing } = await supabase
    .from("achievements")
    .select("badge_id")
    .eq("user_id", user_id);
  const unlockedIds = new Set((existing || []).map((a: { badge_id: string }) => a.badge_id));

  const parlays = simParlays || [];
  const totalPicks = parlays.length;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wins = parlays.filter((p: any) => p.status === "won");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sports = new Set(parlays.flatMap((p: any) => (p.legs || []).map((l: { sport: string }) => l.sport)));

  // Calculate max win streak
  let maxStreak = 0;
  let currentStreak = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const p of parlays as any[]) {
    if (p.status === "won") {
      currentStreak++;
      maxStreak = Math.max(maxStreak, currentStreak);
    } else if (p.status === "lost") {
      currentStreak = 0;
    }
  }

  // Check each badge
  const newBadges: string[] = [];

  const checks: Record<string, boolean> = {
    first_pick: totalPicks >= 1,
    ten_picks: totalPicks >= 10,
    fifty_picks: totalPicks >= 50,
    hundred_picks: totalPicks >= 100,
    streak_3: maxStreak >= 3,
    streak_5: maxStreak >= 5,
    streak_10: maxStreak >= 10,
    first_win: wins.length >= 1,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    big_payout: wins.some((w: any) => w.payout >= 500),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    huge_payout: wins.some((w: any) => w.payout >= 2000),
    profitable: (bankroll?.balance || 0) > (bankroll?.starting_balance || 1000),
    double_up: (bankroll?.balance || 0) >= (bankroll?.starting_balance || 1000) * 2,
    multi_sport: sports.size >= 3,
    all_sports: sports.size >= 5,
    referral_1: referralSignups >= 1,
    referral_5: referralSignups >= 5,
    referral_10: referralSignups >= 10,
  };

  for (const [badgeId, earned] of Object.entries(checks)) {
    if (earned && !unlockedIds.has(badgeId)) {
      const { error } = await supabase.from("achievements").insert({ user_id, badge_id: badgeId });
      if (!error) newBadges.push(badgeId);
    }
  }

  return NextResponse.json({ newBadges, totalChecked: Object.keys(checks).length });
}
