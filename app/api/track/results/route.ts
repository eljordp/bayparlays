import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// Force every request to hit the DB live — no fetch cache, no edge cache.
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type ParlayCategory = "ev" | "payout" | "confidence";

interface ParlayRow {
  id: string;
  created_at: string;
  legs: Record<string, unknown>[];
  combined_odds: string;
  combined_decimal: number;
  ev: number;
  ev_percent: number;
  confidence: number;
  payout: number;
  stake: number;
  legs_total: number;
  sports: string[];
  status: string;
  profit: number | null;
  category: ParlayCategory | null;
  clv_percent: number | null;
}

// Public track record counts every parlay the AI has surfaced. The earlier
// confidence>=60 cutoff filtered out everything (model never scores that high),
// so the page reported 0-0. Show the full record — honest and complete.
const MIN_CONFIDENCE_FOR_TRACK_RECORD = 0;

// Under this total, surface a "still building" caveat in the response so the
// UI can show sample-size honesty instead of pretending 10 bets is signal.
const SMALL_SAMPLE_THRESHOLD = 50;

export async function GET() {
  try {
    // Paginate past Supabase's default 1000-row cap so older history isn't cut off.
    const allRows: ParlayRow[] = [];
    const PAGE_SIZE = 1000;
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from("parlays")
        .select("*")
        .order("created_at", { ascending: false })
        .range(from, from + PAGE_SIZE - 1);

      if (error) {
        console.error("Supabase query error:", error);
        return NextResponse.json(
          { error: "Failed to fetch results", details: error.message },
          { status: 500 },
        );
      }
      if (!data || data.length === 0) break;
      allRows.push(...(data as ParlayRow[]));
      if (data.length < PAGE_SIZE) break;
    }

    // Retroactive confidence filter — only count AI-endorsed picks in the public
    // track record. Garbage pre-filter parlays still live in the DB (we don't
    // delete history) but they don't pollute the displayed stats.
    const rows = allRows.filter(
      (p) => (p.confidence ?? 0) >= MIN_CONFIDENCE_FOR_TRACK_RECORD,
    );

    // --- Aggregate stats ---
    const totalParlays = rows.length;
    const won = rows.filter((p) => p.status === "won").length;
    const lost = rows.filter((p) => p.status === "lost").length;
    const pending = rows.filter((p) => p.status === "pending").length;
    const resolved = won + lost;
    const winRate =
      resolved > 0 ? Math.round((won / resolved) * 10000) / 100 : 0;

    const totalProfit = rows.reduce((sum, p) => sum + (p.profit ?? 0), 0);
    const totalStaked = rows
      .filter((p) => p.status !== "pending")
      .reduce((sum, p) => sum + (p.stake ?? 100), 0);
    const roi =
      totalStaked > 0
        ? Math.round((totalProfit / totalStaked) * 10000) / 100
        : 0;

    // Beginner-friendly framing: recompute profit at a flat $10/pick. Same
    // record, same win rate — just a stake size that matches what the user
    // actually does in the Simulator ("Try $10 in Simulator"). Avoids the
    // confusing "+$14K profit" reading on the home page when actual stored
    // stakes default to $100.
    const UNIT_STAKE = 10;
    const profitAtUnit = rows.reduce((sum, p) => {
      if (p.status === "won") {
        return sum + UNIT_STAKE * ((p.combined_decimal ?? 1) - 1);
      }
      if (p.status === "lost") {
        return sum - UNIT_STAKE;
      }
      return sum;
    }, 0);
    const stakedAtUnit = (won + lost) * UNIT_STAKE;

    // --- Current streak ---
    let streakType: "W" | "L" = "W";
    let streakCount = 0;
    for (const p of rows) {
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

    // --- Best payout ---
    const wonParlays = rows.filter((p) => p.status === "won");
    const bestPayout =
      wonParlays.length > 0
        ? Math.max(...wonParlays.map((p) => p.payout ?? 0))
        : 0;

    // --- Avg CLV (Closing Line Value) ---
    // This is the north-star sharpness metric. Positive CLV over a real sample
    // means the model consistently gets better prices than the closing line —
    // the only proof of edge that isn't just variance. Null if no resolved
    // parlays have CLV data yet (pre-v012 migration).
    const clvRows = rows.filter(
      (p) => p.status !== "pending" && typeof p.clv_percent === "number",
    );
    const avgClv =
      clvRows.length > 0
        ? Math.round(
            (clvRows.reduce((s, p) => s + (p.clv_percent ?? 0), 0) /
              clvRows.length) * 100,
          ) / 100
        : null;
    const clvSample = clvRows.length;

    // --- Last 7 days ---
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const last7 = rows.filter((p) => {
      if (p.status === "pending") return false;
      return new Date(p.created_at) >= sevenDaysAgo;
    });
    const last7Days = {
      won: last7.filter((p) => p.status === "won").length,
      lost: last7.filter((p) => p.status === "lost").length,
      profit:
        Math.round(
          last7.reduce((sum, p) => sum + (p.profit ?? 0), 0) * 100,
        ) / 100,
    };

    // --- Sport breakdown (each parlay counted once, on primary sport) ---
    const sportMap = new Map<string, { won: number; lost: number }>();
    for (const p of rows) {
      if (p.status === "pending") continue;
      const primary = p.sports?.[0];
      if (!primary) continue;
      const entry = sportMap.get(primary) ?? { won: 0, lost: 0 };
      if (p.status === "won") entry.won++;
      if (p.status === "lost") entry.lost++;
      sportMap.set(primary, entry);
    }
    const sportBreakdown = Array.from(sportMap.entries()).map(
      ([sport, data]) => ({
        sport,
        won: data.won,
        lost: data.lost,
        winRate:
          data.won + data.lost > 0
            ? Math.round((data.won / (data.won + data.lost)) * 10000) / 100
            : 0,
      }),
    );

    // --- Category breakdown: Best EV / Highest Payout / Most Confident ---
    // Skip rows without a category (pre-010 migration data is uncategorized).
    const categoryMap = new Map<ParlayCategory, { won: number; lost: number }>();
    for (const p of rows) {
      if (p.status === "pending") continue;
      const cat = p.category;
      if (!cat) continue;
      const entry = categoryMap.get(cat) ?? { won: 0, lost: 0 };
      if (p.status === "won") entry.won++;
      if (p.status === "lost") entry.lost++;
      categoryMap.set(cat, entry);
    }
    const categoryBreakdown = Array.from(categoryMap.entries()).map(
      ([category, data]) => ({
        category,
        won: data.won,
        lost: data.lost,
        winRate:
          data.won + data.lost > 0
            ? Math.round((data.won / (data.won + data.lost)) * 10000) / 100
            : 0,
      }),
    );

    // --- Market breakdown: moneyline vs spread vs totals ---
    // Attribute each parlay to the market with most legs. If a parlay mixes
    // 2 moneyline legs + 1 spread, it's a "moneyline" parlay for breakdown
    // purposes. This surfaces which markets the AI is actually winning at.
    const marketMap = new Map<string, { won: number; lost: number }>();
    for (const p of rows) {
      if (p.status === "pending") continue;
      const marketCounts = new Map<string, number>();
      for (const leg of p.legs as { market?: string }[]) {
        const m = leg?.market;
        if (!m) continue;
        marketCounts.set(m, (marketCounts.get(m) ?? 0) + 1);
      }
      if (marketCounts.size === 0) continue;
      const primary = [...marketCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];
      const entry = marketMap.get(primary) ?? { won: 0, lost: 0 };
      if (p.status === "won") entry.won++;
      if (p.status === "lost") entry.lost++;
      marketMap.set(primary, entry);
    }
    const marketBreakdown = Array.from(marketMap.entries()).map(
      ([market, data]) => ({
        market,
        won: data.won,
        lost: data.lost,
        winRate:
          data.won + data.lost > 0
            ? Math.round((data.won / (data.won + data.lost)) * 10000) / 100
            : 0,
      }),
    );

    // --- Recent parlays ---
    const recentParlays = rows.slice(0, 20).map((p) => ({
      id: p.id,
      created_at: p.created_at,
      legs: p.legs,
      combined_odds: p.combined_odds,
      combined_decimal: p.combined_decimal,
      status: p.status,
      payout: p.payout,
      profit: p.profit ?? 0,
      ev_percent: p.ev_percent,
      category: p.category,
      impliedHitRate:
        p.combined_decimal && p.combined_decimal > 1
          ? Math.round((1 / p.combined_decimal) * 10000) / 100
          : null,
    }));

    return NextResponse.json(
      {
        stats: {
          totalParlays,
          won,
          lost,
          pending,
          winRate,
          totalProfit: Math.round(totalProfit * 100) / 100,
          roi,
          unitStake: UNIT_STAKE,
          profitAtUnit: Math.round(profitAtUnit * 100) / 100,
          stakedAtUnit,
          currentStreak: { type: streakType, count: streakCount },
          bestPayout,
          last7Days,
          resolvedSample: resolved,
          smallSample: resolved < SMALL_SAMPLE_THRESHOLD,
          avgClv,
          clvSample,
        },
        sportBreakdown,
        categoryBreakdown,
        marketBreakdown,
        recentParlays,
      },
      {
        headers: {
          "Cache-Control":
            "no-store, no-cache, must-revalidate, proxy-revalidate",
          "CDN-Cache-Control": "no-store",
          "Vercel-CDN-Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    console.error("Track results error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
