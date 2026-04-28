import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

// Strategy comparison endpoint.
//
// Replaces the single "Sweet Spot" card idea with a side-by-side leaderboard
// of every meaningful filter on the parlays table. Lets users (and JP) see
// which lanes are actually performing without doing mental math across
// confidence buckets, leg counts, and sports.
//
// Each row is computed live from the parlays table — no precomputed stats,
// no migration, no separate sim accounts. ROI % is the headline metric so
// high-volume strategies don't dominate purely on dollar profit.

interface ParlayRow {
  status: string;
  confidence: number | null;
  legs_total: number | null;
  sports: string[] | null;
  combined_decimal: number | null;
  archived_at: string | null;
  created_at: string;
}

interface StrategyResult {
  id: string;
  name: string;
  description: string;
  picks: number;
  resolved: number;
  wins: number;
  losses: number;
  hitRate: number;        // %
  roi: number;            // % at $10 stake
  profitAtUnit: number;   // $ at $10 stake
  avgPayoutWhenWin: number; // $ at $10 stake
  isSweetSpot?: boolean;
}

const UNIT_STAKE = 10;

function computeStrategy(
  rows: ParlayRow[],
  id: string,
  name: string,
  description: string,
  predicate: (p: ParlayRow) => boolean,
  flags: { isSweetSpot?: boolean } = {},
): StrategyResult {
  const matched = rows.filter(predicate);
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
    id,
    name,
    description,
    picks: matched.length,
    resolved,
    wins,
    losses,
    hitRate: Math.round(hitRate * 10) / 10,
    roi: Math.round(roi * 10) / 10,
    profitAtUnit: Math.round(profitAtUnit * 100) / 100,
    avgPayoutWhenWin: Math.round(avgPayoutWhenWin * 100) / 100,
    ...flags,
  };
}

export async function GET() {
  try {
    // Pull all non-archived parlays. Pagination handles >1000 row case.
    const allRows: ParlayRow[] = [];
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
      allRows.push(...(data as ParlayRow[]));
      if (data.length < PAGE_SIZE) break;
    }

    const rows = allRows.filter((p) => !p.archived_at);

    const sportContains = (target: string) => (p: ParlayRow) =>
      Array.isArray(p.sports) && p.sports.some((s) => s.toUpperCase() === target);

    const strategies: StrategyResult[] = [
      computeStrategy(
        rows,
        "sweet-spot",
        "Sweet Spot",
        "35-50% confidence + 2-leg only. Steady hitter for $10 bettors.",
        (p) =>
          (p.confidence ?? 0) >= 35 &&
          (p.confidence ?? 0) < 50 &&
          (p.legs_total ?? 0) === 2,
        { isSweetSpot: true },
      ),
      computeStrategy(
        rows,
        "big-leg",
        "Big Leg",
        "4+ legs. Highest payouts, biggest variance.",
        (p) => (p.legs_total ?? 0) >= 4,
      ),
      computeStrategy(
        rows,
        "longshot-lab",
        "Longshot Lab",
        "Under 20% confidence. Lottery-ticket EV play.",
        (p) => (p.confidence ?? 0) > 0 && (p.confidence ?? 0) < 20,
      ),
      computeStrategy(
        rows,
        "balanced-3-leg",
        "Balanced 3-Leg",
        "20-35% confidence + 3 legs. Mid-risk, mid-reward.",
        (p) =>
          (p.confidence ?? 0) >= 20 &&
          (p.confidence ?? 0) < 35 &&
          (p.legs_total ?? 0) === 3,
      ),
      computeStrategy(
        rows,
        "mlb-only",
        "MLB Only",
        "Every parlay where every leg is MLB. Where the model has the deepest data.",
        (p) =>
          Array.isArray(p.sports) &&
          p.sports.length > 0 &&
          p.sports.every((s) => s.toUpperCase() === "MLB"),
      ),
      computeStrategy(
        rows,
        "nba-anywhere",
        "NBA In The Mix",
        "Any parlay with at least one NBA leg.",
        sportContains("NBA"),
      ),
      computeStrategy(
        rows,
        "full-slate",
        "Full Slate",
        "Every published parlay across every sport and category.",
        () => true,
      ),
    ];

    // Sort by ROI descending so the highest-producing strategy shows on top.
    strategies.sort((a, b) => b.roi - a.roi);

    // Last 7 days variant of the same set so users can see which strategies
    // are HOT right now vs all-time. Same predicates, just time-filtered.
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const recent = rows.filter((p) => new Date(p.created_at) >= sevenDaysAgo);

    const last7 = strategies.map((s) => {
      const sameId = s.id;
      const predicateMap: Record<string, (p: ParlayRow) => boolean> = {
        "sweet-spot": (p) =>
          (p.confidence ?? 0) >= 35 &&
          (p.confidence ?? 0) < 50 &&
          (p.legs_total ?? 0) === 2,
        "big-leg": (p) => (p.legs_total ?? 0) >= 4,
        "longshot-lab": (p) => (p.confidence ?? 0) > 0 && (p.confidence ?? 0) < 20,
        "balanced-3-leg": (p) =>
          (p.confidence ?? 0) >= 20 &&
          (p.confidence ?? 0) < 35 &&
          (p.legs_total ?? 0) === 3,
        "mlb-only": (p) =>
          Array.isArray(p.sports) &&
          p.sports.length > 0 &&
          p.sports.every((s) => s.toUpperCase() === "MLB"),
        "nba-anywhere": sportContains("NBA"),
        "full-slate": () => true,
      };
      return computeStrategy(recent, sameId, s.name, s.description, predicateMap[sameId], {
        isSweetSpot: s.isSweetSpot,
      });
    });

    return NextResponse.json(
      {
        allTime: strategies,
        last7Days: last7,
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
