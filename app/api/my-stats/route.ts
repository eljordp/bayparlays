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

    // --- Category breakdown ---
    const categoryMap = new Map<Category, { won: number; lost: number }>();
    for (const p of rows) {
      if (p.status === "pending") continue;
      if (!p.category) continue;
      const entry = categoryMap.get(p.category) ?? { won: 0, lost: 0 };
      if (p.status === "won") entry.won++;
      if (p.status === "lost") entry.lost++;
      categoryMap.set(p.category, entry);
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
