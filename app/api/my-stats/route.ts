import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// Force every request to hit the DB live — no fetch cache, no edge cache.
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

interface SimLeg {
  sport?: string;
  pick?: string;
  game?: string;
  odds?: number;
  book?: string;
}

type Category = "ev" | "payout" | "confidence";

interface SimParlayRow {
  id: string;
  user_id: string;
  created_at: string;
  legs: SimLeg[];
  combined_odds: string;
  combined_decimal: number;
  stake: number;
  payout: number;
  status: "pending" | "won" | "lost";
  profit: number | null;
  resolved_at: string | null;
  category: Category | null;
  legs_won: number | null;
  legs_lost: number | null;
  legs_total: number | null;
}

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
};

function emptyPayload() {
  return {
    stats: {
      totalBets: 0,
      won: 0,
      lost: 0,
      pending: 0,
      winRate: 0,
      totalProfit: 0,
      totalWagered: 0,
      roi: 0,
      currentStreak: { type: "W" as const, count: 0 },
      bestPayout: 0,
      bestProfit: 0,
      last7Days: { won: 0, lost: 0, profit: 0 },
    },
    sportBreakdown: [] as Array<{
      sport: string;
      won: number;
      lost: number;
      winRate: number;
    }>,
    categoryBreakdown: [] as Array<{
      category: Category;
      won: number;
      lost: number;
      winRate: number;
    }>,
    legCountBreakdown: [] as Array<{
      label: string;
      legs: number;
      won: number;
      lost: number;
      profit: number;
      winRate: number;
    }>,
    oddsRangeBreakdown: [] as Array<{
      label: string;
      won: number;
      lost: number;
      profit: number;
      winRate: number;
    }>,
    perLeg: { won: 0, total: 0, hitRate: 0, sampledParlays: 0 },
    trend: {
      last7WinRate: 0,
      prior14WinRate: 0,
      delta: 0,
      last7Count: 0,
      prior14Count: 0,
    },
    recentForm: { sample: 0, winRate: 0, isCold: false, isHot: false },
    insights: [] as Array<{ tone: "good" | "bad" | "neutral"; text: string }>,
    recentBets: [] as Array<{
      id: string;
      created_at: string;
      legs: SimLeg[];
      combined_odds: string;
      combined_decimal: number;
      status: string;
      stake: number;
      payout: number;
      profit: number;
      category: Category | null;
    }>,
  };
}

export async function GET(req: NextRequest) {
  try {
    const userId = req.nextUrl.searchParams.get("user_id");

    if (!userId) {
      return NextResponse.json(emptyPayload(), { headers: NO_STORE_HEADERS });
    }

    // Paginate past Supabase's default 1000-row cap so older history isn't cut off.
    const rows: SimParlayRow[] = [];
    const PAGE_SIZE = 1000;
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from("sim_parlays")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .range(from, from + PAGE_SIZE - 1);

      if (error) {
        console.error("Supabase query error:", error);
        return NextResponse.json(
          { error: "Failed to fetch sim stats", details: error.message },
          { status: 500 },
        );
      }
      if (!data || data.length === 0) break;
      rows.push(...(data as SimParlayRow[]));
      if (data.length < PAGE_SIZE) break;
    }

    if (rows.length === 0) {
      return NextResponse.json(emptyPayload(), { headers: NO_STORE_HEADERS });
    }

    // --- Aggregate stats ---
    const totalBets = rows.length;
    const won = rows.filter((p) => p.status === "won").length;
    const lost = rows.filter((p) => p.status === "lost").length;
    const pending = rows.filter((p) => p.status === "pending").length;
    const winRate =
      won + lost > 0 ? Math.round((won / (won + lost)) * 10000) / 100 : 0;

    const resolved = rows.filter((p) => p.status !== "pending");
    const totalProfit = resolved.reduce(
      (sum, p) => sum + (p.profit ?? 0),
      0,
    );
    const totalWagered = resolved.reduce(
      (sum, p) => sum + (p.stake ?? 0),
      0,
    );
    const roi =
      totalWagered > 0
        ? Math.round((totalProfit / totalWagered) * 10000) / 100
        : 0;

    // --- Current streak (newest resolved first) ---
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

    // --- Best payout / best profit (among wins) ---
    const wonParlays = rows.filter((p) => p.status === "won");
    const bestPayout =
      wonParlays.length > 0
        ? Math.max(...wonParlays.map((p) => p.payout ?? 0))
        : 0;
    const bestProfit =
      wonParlays.length > 0
        ? Math.max(...wonParlays.map((p) => p.profit ?? 0))
        : 0;

    // --- Last 7 days ---
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const last7 = rows.filter((p) => {
      if (p.status === "pending") return false;
      const createdAt = new Date(p.created_at);
      return createdAt >= sevenDaysAgo;
    });
    const last7Days = {
      won: last7.filter((p) => p.status === "won").length,
      lost: last7.filter((p) => p.status === "lost").length,
      profit:
        Math.round(
          last7.reduce((sum, p) => sum + (p.profit ?? 0), 0) * 100,
        ) / 100,
    };

    // --- Trend layer: last 7d vs prior 14d ---
    // Powers "you're trending up" / "cold streak detected" insights. As the
    // user accumulates more history, this gives the page a sense of
    // momentum that absolute totals can't.
    const twentyOneDaysAgo = new Date();
    twentyOneDaysAgo.setDate(twentyOneDaysAgo.getDate() - 21);
    const prior14 = rows.filter((p) => {
      if (p.status === "pending") return false;
      const createdAt = new Date(p.created_at);
      return createdAt >= twentyOneDaysAgo && createdAt < sevenDaysAgo;
    });
    const last7Resolved = last7.length;
    const prior14Resolved = prior14.length;
    const last7WinRate =
      last7Resolved > 0
        ? (last7.filter((p) => p.status === "won").length / last7Resolved) * 100
        : 0;
    const prior14WinRate =
      prior14Resolved > 0
        ? (prior14.filter((p) => p.status === "won").length /
            prior14Resolved) *
          100
        : 0;
    const trend = {
      last7WinRate: Math.round(last7WinRate * 100) / 100,
      prior14WinRate: Math.round(prior14WinRate * 100) / 100,
      delta: Math.round((last7WinRate - prior14WinRate) * 100) / 100,
      last7Count: last7Resolved,
      prior14Count: prior14Resolved,
    };

    // Cold/hot streak detection from the most recent 10 resolved bets.
    // Streaks aren't just consecutive — a 2-8 stretch matters even if it
    // wasn't all in a row. Surfaces the moment things go sideways.
    const last10 = rows
      .filter((p) => p.status !== "pending")
      .slice(0, 10);
    const last10WinRate =
      last10.length > 0
        ? (last10.filter((p) => p.status === "won").length / last10.length) *
          100
        : 0;
    const recentForm = {
      sample: last10.length,
      winRate: Math.round(last10WinRate * 100) / 100,
      isCold: last10.length >= 8 && last10WinRate < 25,
      isHot: last10.length >= 8 && last10WinRate > 60,
    };

    // --- Sport breakdown (primary sport = first leg) ---
    const sportMap = new Map<string, { won: number; lost: number }>();
    for (const p of rows) {
      if (p.status === "pending") continue;
      const primary = p.legs?.[0]?.sport;
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

    // --- Category breakdown (with profit so insights can reason about $) ---
    const categoryMap = new Map<
      Category,
      { won: number; lost: number; profit: number }
    >();
    for (const p of rows) {
      if (p.status === "pending") continue;
      if (!p.category) continue;
      const entry =
        categoryMap.get(p.category) ?? { won: 0, lost: 0, profit: 0 };
      if (p.status === "won") entry.won++;
      if (p.status === "lost") entry.lost++;
      entry.profit += p.profit ?? 0;
      categoryMap.set(p.category, entry);
    }
    const categoryBreakdown = Array.from(categoryMap.entries()).map(
      ([category, data]) => ({
        category,
        won: data.won,
        lost: data.lost,
        profit: Math.round(data.profit * 100) / 100,
        winRate:
          data.won + data.lost > 0
            ? Math.round((data.won / (data.won + data.lost)) * 10000) / 100
            : 0,
      }),
    );

    // --- Leg-count breakdown (1L/2L/3L/4L+) ---
    const legCountMap = new Map<
      number,
      { won: number; lost: number; profit: number }
    >();
    for (const p of rows) {
      if (p.status === "pending") continue;
      const n = (p.legs ?? []).length;
      const bucket = n >= 4 ? 4 : n; // 4 = "4L+"
      const entry =
        legCountMap.get(bucket) ?? { won: 0, lost: 0, profit: 0 };
      if (p.status === "won") entry.won++;
      if (p.status === "lost") entry.lost++;
      entry.profit += p.profit ?? 0;
      legCountMap.set(bucket, entry);
    }
    const legCountBreakdown = Array.from(legCountMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([legs, d]) => {
        const total = d.won + d.lost;
        return {
          label: legs >= 4 ? "4L+" : `${legs}L`,
          legs,
          won: d.won,
          lost: d.lost,
          profit: Math.round(d.profit * 100) / 100,
          winRate: total > 0
            ? Math.round((d.won / total) * 10000) / 100
            : 0,
        };
      });

    // --- Odds-range breakdown ---
    type Bucket = { won: number; lost: number; profit: number };
    const oddsBuckets: Array<{
      label: string;
      min: number;
      max: number;
      data: Bucket;
    }> = [
      { label: "Short (-200 to +200)", min: 1, max: 3, data: { won: 0, lost: 0, profit: 0 } },
      { label: "Medium (+200 to +500)", min: 3, max: 6, data: { won: 0, lost: 0, profit: 0 } },
      { label: "Long (+500 to +1200)", min: 6, max: 13, data: { won: 0, lost: 0, profit: 0 } },
      { label: "Longshot (+1200+)", min: 13, max: Infinity, data: { won: 0, lost: 0, profit: 0 } },
    ];
    for (const p of rows) {
      if (p.status === "pending") continue;
      const d = p.combined_decimal ?? 0;
      const bucket = oddsBuckets.find((b) => d >= b.min && d < b.max);
      if (!bucket) continue;
      if (p.status === "won") bucket.data.won++;
      if (p.status === "lost") bucket.data.lost++;
      bucket.data.profit += p.profit ?? 0;
    }
    const oddsRangeBreakdown = oddsBuckets
      .filter((b) => b.data.won + b.data.lost > 0)
      .map((b) => {
        const total = b.data.won + b.data.lost;
        return {
          label: b.label,
          won: b.data.won,
          lost: b.data.lost,
          profit: Math.round(b.data.profit * 100) / 100,
          winRate:
            total > 0
              ? Math.round((b.data.won / total) * 10000) / 100
              : 0,
        };
      });

    // --- Per-leg hit rate (only counts rows the resolver populated) ---
    // Different from parlay hit rate — a 30% parlay record with 65% per-leg
    // is "your picks are mostly right, the parlay format is what's eating
    // you" — actionable, distinct insight.
    let perLegWon = 0;
    let perLegTotal = 0;
    let perLegSampled = 0;
    for (const p of rows) {
      if (p.status === "pending") continue;
      if (p.legs_total == null) continue; // Pre-migration row
      perLegWon += p.legs_won ?? 0;
      perLegTotal += p.legs_total;
      perLegSampled++;
    }
    const perLeg = {
      won: perLegWon,
      total: perLegTotal,
      hitRate:
        perLegTotal > 0
          ? Math.round((perLegWon / perLegTotal) * 10000) / 100
          : 0,
      sampledParlays: perLegSampled,
    };

    // --- Coaching insights — auto-generated, plain English ---
    // Pulls from the breakdowns we just built. Each insight is short, names
    // the specific metric, and tells the user what to do with it. No filler.
    const insights: Array<{ tone: "good" | "bad" | "neutral"; text: string }> = [];

    // Category-level insights — judge on profit, not just hit rate. A 25%
    // category that's net positive at long odds is doing exactly what it's
    // designed for; flagging it as "leak" would be wrong.
    const cats = categoryBreakdown.filter((c) => c.won + c.lost >= 5);
    if (cats.length > 0) {
      const labelMap: Record<Category, string> = {
        ev: "Best EV",
        payout: "Highest Payout",
        confidence: "Most Confident",
      };
      // Profitable + decent hit rate → flag as edge
      const best = cats.reduce((a, b) =>
        (b.profit ?? 0) > (a.profit ?? 0) ? b : a,
      );
      if ((best.profit ?? 0) > 0 && best.winRate >= 40) {
        insights.push({
          tone: "good",
          text: `Your edge is ${labelMap[best.category]} (${best.winRate.toFixed(0)}% on ${best.won + best.lost} bets, +$${(best.profit ?? 0).toFixed(0)}). Keep leaning here.`,
        });
      }
      // Real leak = actually losing money, not just low hit rate
      const losers = cats.filter((c) => (c.profit ?? 0) < -10);
      if (losers.length > 0) {
        const worst = losers.reduce((a, b) =>
          (b.profit ?? 0) < (a.profit ?? 0) ? b : a,
        );
        insights.push({
          tone: "bad",
          text: `${labelMap[worst.category]} is bleeding — ${worst.won}-${worst.lost}, $${(worst.profit ?? 0).toFixed(0)}. The math isn't working in this category.`,
        });
      }
      // High-variance category — low hit but barely net positive. Flag as
      // "watch, don't chase" instead of "stop." Sample needs more bets.
      const highVariance = cats.find(
        (c) =>
          c.winRate < 20 &&
          (c.profit ?? 0) >= 0 &&
          (c.profit ?? 0) < 50 &&
          c.won + c.lost < 25,
      );
      if (highVariance) {
        insights.push({
          tone: "neutral",
          text: `${labelMap[highVariance.category]} is high-variance (${highVariance.won}-${highVariance.lost}, ${highVariance.winRate.toFixed(0)}%, +$${(highVariance.profit ?? 0).toFixed(0)}). Net positive but a swing away from breakeven — need 25+ bets to know if there's edge.`,
        });
      }
    }

    // Best leg count
    const lcSized = legCountBreakdown.filter((l) => l.won + l.lost >= 5);
    if (lcSized.length > 0) {
      const bestLc = lcSized.reduce((a, b) =>
        b.winRate > a.winRate ? b : a,
      );
      if (bestLc.winRate >= 40) {
        insights.push({
          tone: "good",
          text: `${bestLc.label} parlays are your sweet spot (${bestLc.winRate.toFixed(0)}% on ${bestLc.won + bestLc.lost} bets, ${bestLc.profit >= 0 ? "+" : ""}$${bestLc.profit.toFixed(0)}).`,
        });
      }
    }

    // Trend insight — only fires when both windows have enough sample to
    // be more than noise. Direction matters: improving = green, sliding =
    // red. The delta gets surfaced in plain "+X pts" language.
    if (trend.last7Count >= 8 && trend.prior14Count >= 8) {
      if (trend.delta >= 8) {
        insights.push({
          tone: "good",
          text: `You're trending up — last 7 days at ${trend.last7WinRate.toFixed(0)}% (${trend.last7Count} bets) vs prior 14 days at ${trend.prior14WinRate.toFixed(0)}%. +${trend.delta.toFixed(0)} pts. Whatever you adjusted, keep doing it.`,
        });
      } else if (trend.delta <= -8) {
        insights.push({
          tone: "bad",
          text: `Sliding — last 7 days at ${trend.last7WinRate.toFixed(0)}% vs prior 14 at ${trend.prior14WinRate.toFixed(0)}%. ${trend.delta.toFixed(0)} pts. Pull back stake or pause for a day to reset.`,
        });
      }
    }

    // Cold streak — last 10 bets at <25%. Faster signal than the trend
    // window. Designed to interrupt tilt before the user chases.
    if (recentForm.isCold) {
      insights.push({
        tone: "bad",
        text: `Cold streak: last ${recentForm.sample} bets at ${recentForm.winRate.toFixed(0)}%. Variance happens — but if you keep pressing, this is when bankrolls die. Drop stake or take a 24h break.`,
      });
    }

    // Hot streak — different framing, NOT "keep pressing." Variance reverts.
    if (recentForm.isHot) {
      insights.push({
        tone: "neutral",
        text: `Heater: last ${recentForm.sample} bets at ${recentForm.winRate.toFixed(0)}%. Don't tilt up your stake — variance reverts. The math says you're due to cool off.`,
      });
    }

    // Per-leg vs parlay-rate gap — the most useful coaching insight when
    // sample is large enough. If individual picks hit at 60%+ but parlays
    // are at 40%, the format is the leak, not the picks.
    if (perLeg.sampledParlays >= 15 && perLeg.hitRate > 0 && winRate > 0) {
      const gap = perLeg.hitRate - winRate;
      if (gap >= 15) {
        insights.push({
          tone: "neutral",
          text: `Your per-leg hit rate (${perLeg.hitRate.toFixed(0)}%) is way higher than your parlay hit rate (${winRate.toFixed(0)}%). Picks are good — the parlay format is grinding you. Try more singles or 2-leg max.`,
        });
      }
    }

    // Odds-range insight — only flag as bad if the dollar math is also bad.
    // A 10% hit rate at +1500 odds can still be net positive; calling it a
    // "leak" would be wrong.
    const longshots = oddsRangeBreakdown.find((o) =>
      o.label.startsWith("Longshot"),
    );
    if (longshots && longshots.won + longshots.lost >= 10) {
      if (longshots.profit < -20) {
        insights.push({
          tone: "bad",
          text: `Longshots are losing money — ${longshots.won}-${longshots.lost}, $${longshots.profit.toFixed(0)}. The hits aren't paying enough to cover the misses. Fade this range.`,
        });
      } else if (longshots.winRate < 15 && longshots.profit < 30) {
        insights.push({
          tone: "neutral",
          text: `Longshots are barely above water (${longshots.won}-${longshots.lost}, +$${longshots.profit.toFixed(0)}). High variance — one cold streak flips this red. Keep stake small here.`,
        });
      }
    }

    // Sport edge
    const topSport = sportBreakdown
      .filter((s) => s.won + s.lost >= 8)
      .sort((a, b) => b.winRate - a.winRate)[0];
    if (topSport && topSport.winRate >= 50) {
      insights.push({
        tone: "good",
        text: `${topSport.sport} is your strongest sport (${topSport.winRate.toFixed(0)}% on ${topSport.won + topSport.lost} bets). The AI's signal here matches your bets well.`,
      });
    }
    const worstSport = sportBreakdown
      .filter((s) => s.won + s.lost >= 8)
      .sort((a, b) => a.winRate - b.winRate)[0];
    if (worstSport && worstSport.winRate < 25 && worstSport !== topSport) {
      insights.push({
        tone: "bad",
        text: `${worstSport.sport} is dragging the record (${worstSport.won}-${worstSport.lost}, ${worstSport.winRate.toFixed(0)}%). Worth pausing this sport for a week to see if the model's bias clears.`,
      });
    }

    // --- Recent bets (last 20) ---
    const recentBets = rows.slice(0, 20).map((p) => ({
      id: p.id,
      created_at: p.created_at,
      legs: p.legs ?? [],
      combined_odds: p.combined_odds,
      combined_decimal: p.combined_decimal ?? 0,
      status: p.status,
      stake: p.stake ?? 0,
      payout: p.payout ?? 0,
      profit: p.profit ?? 0,
      category: p.category,
    }));

    return NextResponse.json(
      {
        stats: {
          totalBets,
          won,
          lost,
          pending,
          winRate,
          totalProfit: Math.round(totalProfit * 100) / 100,
          totalWagered: Math.round(totalWagered * 100) / 100,
          roi,
          currentStreak: { type: streakType, count: streakCount },
          bestPayout: Math.round(bestPayout * 100) / 100,
          bestProfit: Math.round(bestProfit * 100) / 100,
          last7Days,
        },
        sportBreakdown,
        categoryBreakdown,
        legCountBreakdown,
        oddsRangeBreakdown,
        perLeg,
        trend,
        recentForm,
        insights,
        recentBets,
      },
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    console.error("My stats error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
