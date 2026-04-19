import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Fetch all pending sim parlays older than 24 hours
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: pending, error } = await supabase
      .from("sim_parlays")
      .select("*")
      .eq("status", "pending")
      .lt("created_at", cutoff);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!pending || pending.length === 0) {
      return NextResponse.json({ resolved: 0, message: "No pending sim parlays to resolve" });
    }

    let resolved = 0;
    let wins = 0;
    let losses = 0;

    for (const parlay of pending) {
      // Use implied probability from the combined decimal odds
      // This is realistic — over time, results match expected value
      const winProb = 1 / parlay.combined_decimal;
      const roll = Math.random();
      const won = roll < winProb;

      const profit = won ? parlay.payout - parlay.stake : -parlay.stake;

      // Update parlay status
      await supabase
        .from("sim_parlays")
        .update({
          status: won ? "won" : "lost",
          profit,
          resolved_at: new Date().toISOString(),
        })
        .eq("id", parlay.id);

      // Update bankroll
      const { data: bankroll } = await supabase
        .from("sim_bankroll")
        .select("*")
        .eq("user_id", parlay.user_id)
        .single();

      if (bankroll) {
        if (won) {
          await supabase
            .from("sim_bankroll")
            .update({
              balance: bankroll.balance + parlay.payout,
              total_won: bankroll.total_won + parlay.payout,
              wins: bankroll.wins + 1,
              updated_at: new Date().toISOString(),
            })
            .eq("user_id", parlay.user_id);
          wins++;
        } else {
          await supabase
            .from("sim_bankroll")
            .update({
              total_lost: bankroll.total_lost + parlay.stake,
              losses: bankroll.losses + 1,
              updated_at: new Date().toISOString(),
            })
            .eq("user_id", parlay.user_id);
          losses++;
        }
      }

      resolved++;
    }

    return NextResponse.json({
      resolved,
      wins,
      losses,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
