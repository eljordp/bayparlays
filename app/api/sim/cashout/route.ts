import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getLiveGameStatuses, gameStringKey } from "@/lib/live-game-status";
import { legState, type LegLite, type LegState } from "@/lib/leg-result";

export const dynamic = "force-dynamic";

// Cash-out math, rebuilt to use real game state instead of time elapsed.
//
// Old logic was guessing how many legs had won by hours-since-placement.
// That's how a $10 bet could "cash out for $586" with no games started.
// New logic:
//   - Pull live ESPN scoreboard for each leg's sport
//   - Determine per-leg state: pending / live / won / lost
//   - Refuse cash-out when:
//       * any leg has lost (parlay's headed to "lost", no value)
//       * no leg has finished or gone live (nothing to bank yet)
//       * all legs already won (full payout will resolve naturally)
//   - Otherwise: value = stake × product(decimal of confirmed-won legs)
//                       × discount (0.85)
//     i.e. you're locking in the legs that won; the discount reflects
//     the book's vig + the live legs still in flight.

interface ParlayRow {
  id: string;
  user_id: string;
  legs: LegLite[];
  combined_decimal: number;
  stake: number;
  payout: number;
  status: string;
  created_at: string;
}

const DISCOUNT = 0.85;
const MIN_CASHOUT = 0.01;

interface CashoutCalc {
  available: boolean;
  reason?: string;
  value: number;
  legBreakdown: Array<{ pick: string; state: LegState }>;
  wonLegs: number;
  lostLegs: number;
  pendingLegs: number;
  liveLegs: number;
}

async function computeCashout(parlay: ParlayRow): Promise<CashoutCalc> {
  const legs = parlay.legs ?? [];
  if (legs.length === 0) {
    return {
      available: false,
      reason: "Parlay has no legs",
      value: 0,
      legBreakdown: [],
      wonLegs: 0,
      lostLegs: 0,
      pendingLegs: 0,
      liveLegs: 0,
    };
  }

  // Collect sports involved so we only fetch those scoreboards.
  const sportsSet = new Set<string>();
  for (const l of legs) {
    const sport = (l as { sport?: string }).sport;
    if (sport) sportsSet.add(sport.toUpperCase());
  }
  const statusMap = await getLiveGameStatuses(Array.from(sportsSet));

  const breakdown: Array<{ pick: string; state: LegState; decimal: number }> = [];
  for (const leg of legs) {
    const key = leg.game ? gameStringKey(leg.game) : null;
    const status = key ? statusMap.get(key) : undefined;
    const state = legState(leg, status);
    const odds = (leg as { odds?: number }).odds ?? 0;
    const decimal = odds > 0 ? odds / 100 + 1 : odds < 0 ? 100 / Math.abs(odds) + 1 : 1;
    breakdown.push({ pick: leg.pick ?? "", state, decimal });
  }

  const wonLegs = breakdown.filter((b) => b.state === "won").length;
  const lostLegs = breakdown.filter((b) => b.state === "lost").length;
  const pendingLegs = breakdown.filter((b) => b.state === "pending").length;
  const liveLegs = breakdown.filter((b) => b.state === "live").length;
  const wentBeyondPre = breakdown.some(
    (b) => b.state === "live" || b.state === "won" || b.state === "lost",
  );

  if (lostLegs > 0) {
    return {
      available: false,
      reason: "A leg has lost — parlay is no longer winnable",
      value: 0,
      legBreakdown: breakdown.map(({ pick, state }) => ({ pick, state })),
      wonLegs,
      lostLegs,
      pendingLegs,
      liveLegs,
    };
  }

  if (!wentBeyondPre) {
    return {
      available: false,
      reason: "No games have started yet",
      value: 0,
      legBreakdown: breakdown.map(({ pick, state }) => ({ pick, state })),
      wonLegs,
      lostLegs,
      pendingLegs,
      liveLegs,
    };
  }

  if (wonLegs === legs.length) {
    return {
      available: false,
      reason: "All legs already won — full payout will settle automatically",
      value: 0,
      legBreakdown: breakdown.map(({ pick, state }) => ({ pick, state })),
      wonLegs,
      lostLegs,
      pendingLegs,
      liveLegs,
    };
  }

  // At this point: at least one game has begun, no leg has lost, and not
  // every leg has won. Compute the locked-in winnings from confirmed-won
  // legs and apply the cash-out discount.
  const wonProduct = breakdown
    .filter((b) => b.state === "won")
    .reduce((acc, b) => acc * b.decimal, 1);

  // If the only "movement" is a live leg (no leg has finished yet), give a
  // small early-cashout value: 60% of stake. That mirrors a sportsbook
  // floor for in-play parlays where nothing has closed.
  let value: number;
  if (wonLegs === 0 && liveLegs > 0) {
    value = parlay.stake * 0.6;
  } else {
    value = parlay.stake * wonProduct * DISCOUNT;
    // Hard cap: cannot exceed the full payout (no free money beyond what
    // the parlay could ever pay).
    value = Math.min(value, parlay.payout);
  }

  value = Math.max(MIN_CASHOUT, Math.round(value * 100) / 100);

  return {
    available: true,
    value,
    legBreakdown: breakdown.map(({ pick, state }) => ({ pick, state })),
    wonLegs,
    lostLegs,
    pendingLegs,
    liveLegs,
  };
}

async function loadParlay(parlayId: string, userId: string): Promise<ParlayRow | null> {
  const { data } = await supabase
    .from("sim_parlays")
    .select("*")
    .eq("id", parlayId)
    .eq("user_id", userId)
    .eq("status", "pending")
    .single();
  return (data as ParlayRow | null) ?? null;
}

export async function GET(req: NextRequest) {
  const parlayId = req.nextUrl.searchParams.get("parlay_id");
  const userId = req.nextUrl.searchParams.get("user_id");
  if (!parlayId || !userId) {
    return NextResponse.json(
      { error: "parlay_id and user_id required" },
      { status: 400 },
    );
  }
  const parlay = await loadParlay(parlayId, userId);
  if (!parlay) {
    return NextResponse.json({ cashoutAvailable: false });
  }
  const calc = await computeCashout(parlay);
  return NextResponse.json({
    cashoutAvailable: calc.available,
    cashoutValue: calc.value,
    stake: parlay.stake,
    payout: parlay.payout,
    reason: calc.reason ?? null,
    legBreakdown: calc.legBreakdown,
    summary: {
      won: calc.wonLegs,
      lost: calc.lostLegs,
      pending: calc.pendingLegs,
      live: calc.liveLegs,
    },
  });
}

export async function POST(req: NextRequest) {
  const { parlay_id, user_id } = await req.json();
  if (!parlay_id || !user_id) {
    return NextResponse.json(
      { error: "parlay_id and user_id required" },
      { status: 400 },
    );
  }

  const parlay = await loadParlay(parlay_id, user_id);
  if (!parlay) {
    return NextResponse.json(
      { error: "Parlay not found or already resolved" },
      { status: 404 },
    );
  }

  const calc = await computeCashout(parlay);
  if (!calc.available) {
    return NextResponse.json(
      {
        error: calc.reason ?? "Cash-out not available",
        legBreakdown: calc.legBreakdown,
      },
      { status: 400 },
    );
  }

  const profit = calc.value - parlay.stake;

  // Mark parlay resolved and credit bankroll.
  await supabase
    .from("sim_parlays")
    .update({
      status: profit >= 0 ? "won" : "lost",
      profit,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", parlay_id)
    .eq("status", "pending"); // race-safe

  const { data: bankroll } = await supabase
    .from("sim_bankroll")
    .select("*")
    .eq("user_id", user_id)
    .single();

  if (bankroll) {
    await supabase
      .from("sim_bankroll")
      .update({
        balance: (bankroll.balance ?? 0) + calc.value,
        total_won: (bankroll.total_won ?? 0) + (profit > 0 ? calc.value : 0),
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user_id);
  }

  return NextResponse.json({
    success: true,
    cashoutValue: calc.value,
    profit,
    legBreakdown: calc.legBreakdown,
  });
}
