import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// POST — Place a simulated parlay
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { user_id, legs, combined_odds, combined_decimal, stake, payout } = body;

    if (!user_id || !legs || !combined_odds || !combined_decimal || !stake || !payout) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (stake < 1) {
      return NextResponse.json({ error: "Minimum stake is $1" }, { status: 400 });
    }

    // Duplicate check — don't place same parlay twice
    const { data: pendingBets } = await supabase
      .from("sim_parlays")
      .select("legs")
      .eq("user_id", user_id)
      .eq("status", "pending");

    const newSig = (legs as Array<{ pick: string; game: string }>)
      .map((l) => `${l.game}::${l.pick}`)
      .sort()
      .join("|");

    const isDuplicate = (pendingBets || []).some(
      (bet: { legs: Array<{ pick: string; game: string }> }) => {
        const existingSig = (bet.legs || [])
          .map((l: { pick: string; game: string }) => `${l.game}::${l.pick}`)
          .sort()
          .join("|");
        return existingSig === newSig;
      }
    );

    if (isDuplicate) {
      return NextResponse.json(
        { error: "You already have this parlay pending" },
        { status: 409 }
      );
    }

    // Check bankroll
    const { data: bankroll, error: bankrollErr } = await supabase
      .from("sim_bankroll")
      .select("*")
      .eq("user_id", user_id)
      .single();

    if (bankrollErr || !bankroll) {
      return NextResponse.json({ error: "Bankroll not found. Visit the simulator page first." }, { status: 404 });
    }

    if (bankroll.balance < stake) {
      return NextResponse.json({ error: "Insufficient balance" }, { status: 400 });
    }

    // Deduct stake from balance, increment total_wagered
    const { error: updateErr } = await supabase
      .from("sim_bankroll")
      .update({
        balance: bankroll.balance - stake,
        total_wagered: bankroll.total_wagered + stake,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user_id);

    if (updateErr) {
      return NextResponse.json({ error: "Failed to update bankroll" }, { status: 500 });
    }

    // Insert sim parlay
    const { data: parlay, error: insertErr } = await supabase
      .from("sim_parlays")
      .insert({
        user_id,
        legs,
        combined_odds,
        combined_decimal,
        stake,
        payout,
        status: "pending",
        profit: 0,
      })
      .select()
      .single();

    if (insertErr) {
      return NextResponse.json({ error: "Failed to place sim bet" }, { status: 500 });
    }

    return NextResponse.json({
      parlay,
      bankroll: {
        balance: bankroll.balance - stake,
        total_wagered: bankroll.total_wagered + stake,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// GET — Get user's sim history + bankroll
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("user_id");

  if (!userId) {
    return NextResponse.json({ error: "user_id required" }, { status: 400 });
  }

  // Get bankroll
  const { data: bankroll } = await supabase
    .from("sim_bankroll")
    .select("*")
    .eq("user_id", userId)
    .single();

  // Get last 20 sim parlays
  const { data: parlays } = await supabase
    .from("sim_parlays")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);

  return NextResponse.json({
    bankroll: bankroll || null,
    parlays: parlays || [],
  });
}

// PATCH — Edit stake on a pending sim parlay
export async function PATCH(request: NextRequest) {
  try {
    const { parlay_id, user_id, new_stake } = await request.json();

    if (!parlay_id || !user_id || !new_stake) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    if (new_stake < 1) {
      return NextResponse.json({ error: "Minimum stake is $1" }, { status: 400 });
    }

    // Get current parlay
    const { data: parlay } = await supabase
      .from("sim_parlays")
      .select("*")
      .eq("id", parlay_id)
      .eq("user_id", user_id)
      .eq("status", "pending")
      .single();

    if (!parlay) {
      return NextResponse.json({ error: "Parlay not found" }, { status: 404 });
    }

    const stakeDiff = new_stake - parlay.stake;

    // Check bankroll for stake increase
    if (stakeDiff > 0) {
      const { data: bankroll } = await supabase
        .from("sim_bankroll")
        .select("balance, total_wagered")
        .eq("user_id", user_id)
        .single();

      if (!bankroll || bankroll.balance < stakeDiff) {
        return NextResponse.json({ error: "Insufficient balance" }, { status: 400 });
      }

      // Deduct additional stake
      await supabase
        .from("sim_bankroll")
        .update({
          balance: bankroll.balance - stakeDiff,
          total_wagered: bankroll.total_wagered + stakeDiff,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user_id);
    } else if (stakeDiff < 0) {
      // Refund the difference
      const { data: bankroll } = await supabase
        .from("sim_bankroll")
        .select("balance, total_wagered")
        .eq("user_id", user_id)
        .single();

      if (bankroll) {
        await supabase
          .from("sim_bankroll")
          .update({
            balance: bankroll.balance + Math.abs(stakeDiff),
            total_wagered: bankroll.total_wagered - Math.abs(stakeDiff),
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", user_id);
      }
    }

    const newPayout = Math.round(new_stake * parlay.combined_decimal * 100) / 100;

    await supabase
      .from("sim_parlays")
      .update({ stake: new_stake, payout: newPayout })
      .eq("id", parlay_id);

    return NextResponse.json({ success: true, newStake: new_stake, newPayout });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
