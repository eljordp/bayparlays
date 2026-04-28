import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { STRATEGIES, type ParlayLike, type StrategyDef } from "@/lib/strategy-defs";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

// Strategy comparison endpoint.
//
// Side-by-side leaderboard of every meaningful filter on the parlays table.
// Read-only — no migration, no separate sim accounts. ROI % is the headline
// metric so high-volume strategies don't dominate purely on dollar profit.

interface StrategyResult {
  id: string;
  name: string;
  description: string;
  picks: number;
  resolved: number;
  wins: number;
  losses: number;
  hitRate: number;
  roi: number;
  profitAtUnit: number;
  avgPayoutWhenWin: number;
  isSweetSpot?: boolean;
}

const UNIT_STAKE = 10;

function compute(rows: ParlayLike[], def: StrategyDef): StrategyResult {
  const matched = rows.filter(def.predicate);
  const wins = matched.filter((p) => p.status === "won").length;
  const losses = matched.filter((p) => p.status === "lost").length;
  const resolved = wins + losses;
  const hitRate = resolved > 0 ? (wins / resolved) * 100 : 0;

  const profitAtUnit = matched.reduce((sum, p) => {
    if (p.status === "won") {
      return sum + UNIT_STAKE * ((p.combined_decimal ?? 1) - 1);
    }
    if (p.status === "lost") {
      return sum - UNIT_STAKE;
    }
    return sum;
  }, 0);

  const stakedAtUnit = resolved * UNIT_STAKE;
  const roi = stakedAtUnit > 0 ? (profitAtUnit / stakedAtUnit) * 100 : 0;

  const winRows = matched.filter((p) => p.status === "won");
  const totalWinPayout = winRows.reduce(
    (sum, p) => sum + UNIT_STAKE * ((p.combined_decimal ?? 1) - 1),
    0,
  );
  const avgPayoutWhenWin = wins > 0 ? totalWinPayout / wins : 0;

  return {
    id: def.id,
    name: def.name,
    description: def.description,
    picks: matched.length,
    resolved,
    wins,
    losses,
    hitRate: Math.round(hitRate * 10) / 10,
    roi: Math.round(roi * 10) / 10,
    profitAtUnit: Math.round(profitAtUnit * 100) / 100,
    avgPayoutWhenWin: Math.round(avgPayoutWhenWin * 100) / 100,
    ...(def.isSweetSpot ? { isSweetSpot: true } : {}),
  };
}

export async function GET() {
  try {
    const allRows: ParlayLike[] = [];
    const PAGE_SIZE = 1000;
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from("parlays")
        .select("status, confidence, legs_total, sports, combined_decimal, archived_at, created_at")
        .order("created_at", { ascending: false })
        .range(from, from + PAGE_SIZE - 1);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      if (!data || data.length === 0) break;
      allRows.push(...(data as ParlayLike[]));
      if (data.length < PAGE_SIZE) break;
    }

    const rows = allRows.filter((p) => !p.archived_at);
    const allTime = STRATEGIES.map((s) => compute(rows, s)).sort(
      (a, b) => b.roi - a.roi,
    );

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const recent = rows.filter((p) => new Date(p.created_at) >= sevenDaysAgo);
    const last7Days = STRATEGIES.map((s) => compute(recent, s)).sort(
      (a, b) => b.roi - a.roi,
    );

    return NextResponse.json(
      {
        allTime,
        last7Days,
        unitStake: UNIT_STAKE,
        sampleNote:
          "Strategies are read-only filters over the parlays table. ROI % at $10 stake. Hit rate is wins / (wins + losses).",
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
