import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getStrategy, type ParlayLike } from "@/lib/strategy-defs";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

// Strategy detail endpoint.
//
// Returns deeper view of a single strategy:
//   - Summary stats (same as the comparison row)
//   - Recent picks (last 30, all statuses) with full leg detail
//   - Recent wins (last 20) for receipts
//   - Per-day performance over the last 14 days
//   - Sport breakdown
//   - Leg count breakdown
//
// Same predicate as the comparison endpoint — sourced from lib/strategy-defs.

interface FullParlayRow extends ParlayLike {
  id: string;
  legs: Record<string, unknown>[];
  combined_odds: string;
  confidence: number;
  payout: number;
  profit: number | null;
  ev_percent: number;
  legs_total: number;
  category: string | null;
}

const UNIT_STAKE = 10;

function profitAtUnit(p: FullParlayRow): number {
  if (p.status === "won") return UNIT_STAKE * ((p.combined_decimal ?? 1) - 1);
  if (p.status === "lost") return -UNIT_STAKE;
  return 0;
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const def = getStrategy(id);
    if (!def) {
      return NextResponse.json({ error: "Unknown strategy" }, { status: 404 });
    }

    // Pull all parlays (paginated) and filter with the strategy's predicate.
    const allRows: FullParlayRow[] = [];
    const PAGE_SIZE = 1000;
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from("parlays")
        .select(
          "id, created_at, legs, combined_odds, combined_decimal, confidence, payout, profit, ev_percent, sports, legs_total, category, status, archived_at",
        )
        .order("created_at", { ascending: false })
        .range(from, from + PAGE_SIZE - 1);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      if (!data || data.length === 0) break;
      allRows.push(...(data as FullParlayRow[]));
      if (data.length < PAGE_SIZE) break;
    }

    const matched = allRows.filter(
      (p) => !p.archived_at && def.predicate(p),
    );

    // Summary stats
    const wins = matched.filter((p) => p.status === "won").length;
    const losses = matched.filter((p) => p.status === "lost").length;
    const pending = matched.filter((p) => p.status === "pending").length;
    const resolved = wins + losses;
    const hitRate = resolved > 0 ? (wins / resolved) * 100 : 0;
    const totalProfitAtUnit = matched.reduce((s, p) => s + profitAtUnit(p), 0);
    const stakedAtUnit = resolved * UNIT_STAKE;
    const roi = stakedAtUnit > 0 ? (totalProfitAtUnit / stakedAtUnit) * 100 : 0;
    const winRows = matched.filter((p) => p.status === "won");
    const totalWinPayout = winRows.reduce(
      (s, p) => s + UNIT_STAKE * ((p.combined_decimal ?? 1) - 1),
      0,
    );
    const avgPayoutWhenWin = wins > 0 ? totalWinPayout / wins : 0;
    const bestWinAtUnit = winRows.length
      ? Math.max(...winRows.map(profitAtUnit))
      : 0;

    // Current streak (newest resolved first)
    let streakType: "W" | "L" = "W";
    let streakCount = 0;
    for (const p of matched) {
      if (p.status === "pending") continue;
      if (streakCount === 0) {
        streakType = p.status === "won" ? "W" : "L";
        streakCount = 1;
      } else if (
        (p.status === "won" && streakType === "W") ||
        (p.status === "lost" && streakType === "L")
      ) {
        streakCount++;
      } else {
        break;
      }
    }

    // Recent picks (last 30, mixed status)
    const recentPicks = matched.slice(0, 30).map((p) => ({
      id: p.id,
      createdAt: p.created_at,
      legs: p.legs,
      combinedOdds: p.combined_odds,
      confidence: p.confidence,
      status: p.status,
      profitAtUnit: Math.round(profitAtUnit(p) * 100) / 100,
      payoutAtUnit: Math.round(UNIT_STAKE * (p.combined_decimal ?? 1) * 100) / 100,
      evPercent: p.ev_percent,
      sports: p.sports,
      legsTotal: p.legs_total,
      category: p.category,
    }));

    // Recent wins (last 20)
    const recentWins = matched
      .filter((p) => p.status === "won")
      .slice(0, 20)
      .map((p) => ({
        id: p.id,
        createdAt: p.created_at,
        legs: p.legs,
        combinedOdds: p.combined_odds,
        confidence: p.confidence,
        profitAtUnit: Math.round(profitAtUnit(p) * 100) / 100,
        sports: p.sports,
        legsTotal: p.legs_total,
      }));

    // Per-day performance for last 14 days
    const days = 14;
    const dayMap = new Map<string, { wins: number; losses: number; profit: number }>();
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    for (const p of matched) {
      if (p.status === "pending") continue;
      const t = new Date(p.created_at).getTime();
      if (t < cutoff) continue;
      const day = p.created_at.slice(0, 10);
      const entry = dayMap.get(day) ?? { wins: 0, losses: 0, profit: 0 };
      if (p.status === "won") entry.wins++;
      else entry.losses++;
      entry.profit += profitAtUnit(p);
      dayMap.set(day, entry);
    }
    const performanceByDay = Array.from(dayMap.entries())
      .map(([date, v]) => ({
        date,
        wins: v.wins,
        losses: v.losses,
        profit: Math.round(v.profit * 100) / 100,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Sport breakdown
    const sportMap = new Map<string, { picks: number; wins: number; losses: number; profit: number }>();
    for (const p of matched) {
      const sports = p.sports ?? [];
      // Use the first sport listed as the primary tag for breakdown
      const primary = sports[0]?.toUpperCase() ?? "—";
      const entry = sportMap.get(primary) ?? { picks: 0, wins: 0, losses: 0, profit: 0 };
      entry.picks++;
      if (p.status === "won") entry.wins++;
      else if (p.status === "lost") entry.losses++;
      entry.profit += profitAtUnit(p);
      sportMap.set(primary, entry);
    }
    const bySport = Array.from(sportMap.entries())
      .map(([sport, v]) => ({
        sport,
        picks: v.picks,
        wins: v.wins,
        losses: v.losses,
        hitRate: v.wins + v.losses > 0
          ? Math.round((v.wins / (v.wins + v.losses)) * 1000) / 10
          : 0,
        profit: Math.round(v.profit * 100) / 100,
      }))
      .sort((a, b) => b.picks - a.picks);

    // Leg count breakdown
    const legMap = new Map<number, { picks: number; wins: number; losses: number; profit: number }>();
    for (const p of matched) {
      const n = p.legs_total ?? 0;
      const entry = legMap.get(n) ?? { picks: 0, wins: 0, losses: 0, profit: 0 };
      entry.picks++;
      if (p.status === "won") entry.wins++;
      else if (p.status === "lost") entry.losses++;
      entry.profit += profitAtUnit(p);
      legMap.set(n, entry);
    }
    const byLegCount = Array.from(legMap.entries())
      .map(([legs, v]) => ({
        legs,
        picks: v.picks,
        wins: v.wins,
        losses: v.losses,
        hitRate: v.wins + v.losses > 0
          ? Math.round((v.wins / (v.wins + v.losses)) * 1000) / 10
          : 0,
        profit: Math.round(v.profit * 100) / 100,
      }))
      .sort((a, b) => a.legs - b.legs);

    return NextResponse.json(
      {
        strategy: {
          id: def.id,
          name: def.name,
          description: def.description,
          isSweetSpot: def.isSweetSpot ?? false,
        },
        summary: {
          picks: matched.length,
          resolved,
          wins,
          losses,
          pending,
          hitRate: Math.round(hitRate * 10) / 10,
          roi: Math.round(roi * 10) / 10,
          profitAtUnit: Math.round(totalProfitAtUnit * 100) / 100,
          avgPayoutWhenWin: Math.round(avgPayoutWhenWin * 100) / 100,
          bestWinAtUnit: Math.round(bestWinAtUnit * 100) / 100,
          streakType,
          streakCount,
        },
        recentPicks,
        recentWins,
        performanceByDay,
        bySport,
        byLegCount,
        unitStake: UNIT_STAKE,
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      },
    );
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
