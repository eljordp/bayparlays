import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const { parlay_id, user_id } = await request.json();

  if (!parlay_id || !user_id) {
    return NextResponse.json({ error: "parlay_id and user_id required" }, { status: 400 });
  }

  // Get the parlay
  const { data: parlay } = await supabase
    .from("sim_parlays")
    .select("*")
    .eq("id", parlay_id)
    .eq("user_id", user_id)
    .eq("status", "pending")
    .single();

  if (!parlay) {
    return NextResponse.json({ error: "Parlay not found or already resolved" }, { status: 404 });
  }

  // Calculate cash out value
  const legs = parlay.legs || [];
  const totalLegs = legs.length;
  const hoursPlaced = (Date.now() - new Date(parlay.created_at).getTime()) / (1000 * 60 * 60);

  let cashoutMultiplier: number;

  if (hoursPlaced < 1) {
    // Just placed — small penalty to cash out (90% of stake)
    cashoutMultiplier = 0.9;
  } else if (hoursPlaced < 6) {
    // Some games may be in progress — moderate value
    const estimatedLegsWon = Math.min(totalLegs - 1, Math.floor(hoursPlaced / 3));
    const wonMultiplier = legs.slice(0, estimatedLegsWon).reduce((acc: number, leg: { odds: number }) => {
      const decimal = leg.odds > 0 ? leg.odds / 100 + 1 : 100 / Math.abs(leg.odds) + 1;
      return acc * decimal;
    }, 1);
    cashoutMultiplier = Math.max(0.85, Math.min(wonMultiplier * 0.85, parlay.combined_decimal * 0.7));
  } else {
    // Games likely in late stages or done — higher value
    const estimatedLegsWon = Math.min(totalLegs - 1, Math.floor(hoursPlaced / 4));
    const wonMultiplier = legs.slice(0, estimatedLegsWon).reduce((acc: number, leg: { odds: number }) => {
      const decimal = leg.odds > 0 ? leg.odds / 100 + 1 : 100 / Math.abs(leg.odds) + 1;
      return acc * decimal;
    }, 1);
    cashoutMultiplier = Math.max(0.9, Math.min(wonMultiplier * 0.85, parlay.combined_decimal * 0.75));
  }

  const cashoutValue = Math.round(parlay.stake * cashoutMultiplier * 100) / 100;
  const profit = cashoutValue - parlay.stake;

  // Update parlay as cashed out
  await supabase
    .from("sim_parlays")
    .update({
      status: profit >= 0 ? "won" : "lost",
      profit,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", parlay_id);

  // Update bankroll — add cashout value back
  const { data: bankroll } = await supabase
    .from("sim_bankroll")
    .select("*")
    .eq("user_id", user_id)
    .single();

  if (bankroll) {
    await supabase
      .from("sim_bankroll")
      .update({
        balance: bankroll.balance + cashoutValue,
        total_won: bankroll.total_won + (profit > 0 ? cashoutValue : 0),
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user_id);
  }

  return NextResponse.json({
    success: true,
    cashoutValue,
    profit,
  });
}

// GET endpoint to check cash out value without executing
export async function GET(request: NextRequest) {
  const parlayId = request.nextUrl.searchParams.get("parlay_id");
  const userId = request.nextUrl.searchParams.get("user_id");

  if (!parlayId || !userId) {
    return NextResponse.json({ error: "parlay_id and user_id required" }, { status: 400 });
  }

  const { data: parlay } = await supabase
    .from("sim_parlays")
    .select("*")
    .eq("id", parlayId)
    .eq("user_id", userId)
    .eq("status", "pending")
    .single();

  if (!parlay) {
    return NextResponse.json({ cashoutAvailable: false });
  }

  const legs = parlay.legs || [];
  const totalLegs = legs.length;
  const hoursPlaced = (Date.now() - new Date(parlay.created_at).getTime()) / (1000 * 60 * 60);

  let cashoutMultiplier: number;
  if (hoursPlaced < 1) {
    cashoutMultiplier = 0.9;
  } else if (hoursPlaced < 6) {
    const estimatedLegsWon = Math.min(totalLegs - 1, Math.floor(hoursPlaced / 3));
    const wonMultiplier = legs.slice(0, estimatedLegsWon).reduce((acc: number, leg: { odds: number }) => {
      const decimal = leg.odds > 0 ? leg.odds / 100 + 1 : 100 / Math.abs(leg.odds) + 1;
      return acc * decimal;
    }, 1);
    cashoutMultiplier = Math.max(0.85, Math.min(wonMultiplier * 0.85, parlay.combined_decimal * 0.7));
  } else {
    const estimatedLegsWon = Math.min(totalLegs - 1, Math.floor(hoursPlaced / 4));
    const wonMultiplier = legs.slice(0, estimatedLegsWon).reduce((acc: number, leg: { odds: number }) => {
      const decimal = leg.odds > 0 ? leg.odds / 100 + 1 : 100 / Math.abs(leg.odds) + 1;
      return acc * decimal;
    }, 1);
    cashoutMultiplier = Math.max(0.9, Math.min(wonMultiplier * 0.85, parlay.combined_decimal * 0.75));
  }

  return NextResponse.json({
    cashoutAvailable: true,
    cashoutValue: Math.round(parlay.stake * cashoutMultiplier * 100) / 100,
    stake: parlay.stake,
    payout: parlay.payout,
  });
}
