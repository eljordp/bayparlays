import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { STRATEGIES, type ParlayLike, type StrategyDef, type StrategyDimension } from "@/lib/strategy-defs";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

// Strategy comparison endpoint.
//
// Strategies grouped by dimension (sport / confidence / structure). Within
// each dimension we tag the best ROI as "recommended" and the worst (with
// 50+ samples) as "avoid" — dynamic, so the badge follows the data instead
// of being a frozen marketing claim that goes stale when the streak flips.

interface StrategyResult {
  id: string;
  name: string;
  description: string;
  dimension: StrategyDimension;
  picks: number;
  resolved: number;
  wins: number;
  losses: number;
  hitRate: number;
  roi: number;
  profitAtUnit: number;
  avgPayoutWhenWin: number;
  recommended?: boolean;
  avoid?: boolean;
}

const UNIT_STAKE = 10;

// Sample size below which we don't render a "best/worst" badge — the
// comparison is too noisy to make a real call.
const MIN_SAMPLE_FOR_BADGE = 50;

// Threshold below which a strategy gets the avoid badge.
const AVOID_ROI = -10;

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
    dimension: def.dimension,
    picks: matched.length,
    resolved,
    wins,
    losses,
    hitRate: Math.round(hitRate * 10) / 10,
    roi: Math.round(roi * 10) / 10,
    profitAtUnit: Math.round(profitAtUnit * 100) / 100,
    avgPayoutWhenWin: Math.round(avgPayoutWhenWin * 100) / 100,
  };
}

// Tag the best (and worst, if cautionary) within each dimension.
function applyBadges(results: StrategyResult[]): StrategyResult[] {
  const byDim = new Map<StrategyDimension, StrategyResult[]>();
  for (const r of results) {
    const arr = byDim.get(r.dimension) ?? [];
    arr.push(r);
    byDim.set(r.dimension, arr);
  }
  for (const list of byDim.values()) {
    const eligible = list.filter((r) => r.resolved >= MIN_SAMPLE_FOR_BADGE);
    if (eligible.length === 0) continue;
    const best = eligible.reduce((a, b) => (b.roi > a.roi ? b : a));
    if (best.roi > 0) best.recommended = true;
    const worst = eligible.reduce((a, b) => (b.roi < a.roi ? b : a));
    if (worst.roi <= AVOID_ROI && worst !== best) worst.avoid = true;
  }
  return results;
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
    const allTime = applyBadges(STRATEGIES.map((s) => compute(rows, s)));

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const recent = rows.filter((p) => new Date(p.created_at) >= sevenDaysAgo);
    const last7Days = applyBadges(STRATEGIES.map((s) => compute(recent, s)));

    return NextResponse.json(
      {
        allTime,
        last7Days,
        unitStake: UNIT_STAKE,
        sampleNote:
          "Strategies are grouped by dimension (sport / confidence / structure). Recommended + Avoid badges update with the data — they're not fixed claims.",
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
