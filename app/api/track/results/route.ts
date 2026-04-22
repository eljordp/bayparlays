import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// Force every request to hit the DB live — no fetch cache, no edge cache.
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

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
}

export async function GET() {
  try {
    // Paginate past Supabase's default 1000-row cap so older history isn't cut off.
    const rows: ParlayRow[] = [];
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
      rows.push(...(data as ParlayRow[]));
      if (data.length < PAGE_SIZE) break;
    }

    // --- Aggregate stats ---
    const totalParlays = rows.length;
    const won = rows.filter((p) => p.status === "won").length;
    const lost = rows.filter((p) => p.status === "lost").length;
    const pending = rows.filter((p) => p.status === "pending").length;
    const winRate =
      won + lost > 0 ? Math.round((won / (won + lost)) * 10000) / 100 : 0;

    const totalProfit = rows.reduce((sum, p) => sum + (p.profit ?? 0), 0);
    const totalStaked = rows
      .filter((p) => p.status !== "pending")
      .reduce((sum, p) => sum + (p.stake ?? 100), 0);
    const roi =
      totalStaked > 0
        ? Math.round((totalProfit / totalStaked) * 10000) / 100
        : 0;

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

    // --- Last 7 days ---
    // Use resolution time when available (falls back to created_at). A parlay
    // that was *created* 10 days ago but resolved yesterday still belongs here.
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const last7 = rows.filter((p) => {
      if (p.status === "pending") return false;
      const resolvedAt = new Date(p.created_at);
      return resolvedAt >= sevenDaysAgo;
    });
    const last7Days = {
      won: last7.filter((p) => p.status === "won").length,
      lost: last7.filter((p) => p.status === "lost").length,
      profit:
        Math.round(
          last7.reduce((sum, p) => sum + (p.profit ?? 0), 0) * 100,
        ) / 100,
    };

    // --- Sport breakdown ---
    // Each parlay counted once, attributed to its primary (first) sport.
    // Previously every leg-sport got a +1, so a 3-sport parlay inflated the
    // breakdown numbers above the actual win/loss counts.
    const sportMap = new Map<string, { won: number; lost: number }>();
    for (const p of rows) {
      if (p.status === "pending") continue;
      const sports = p.sports ?? [];
      const primary = sports[0];
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

    // --- Recent parlays ---
    const recentParlays = rows.slice(0, 20).map((p) => ({
      id: p.id,
      created_at: p.created_at,
      legs: p.legs,
      combined_odds: p.combined_odds,
      status: p.status,
      payout: p.payout,
      profit: p.profit ?? 0,
      ev_percent: p.ev_percent,
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
          currentStreak: { type: streakType, count: streakCount },
          bestPayout,
          last7Days,
        },
        sportBreakdown,
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
