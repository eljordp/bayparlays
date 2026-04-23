import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

interface EdgeRow {
  id: string;
  created_at: string;
  sport: string;
  game: string;
  market: string;
  pick: string;
  commence_time: string;
  odds: number;
  decimal_odds: number;
  book: string;
  implied_prob: number;
  fair_prob: number | null;
  ev_vs_fair: number | null;
  status: string;
  profit: number;
  closing_odds: number | null;
  clv_percent: number | null;
  resolved_at: string | null;
}

const SMALL_SAMPLE_THRESHOLD = 30;

export async function GET() {
  try {
    const all: EdgeRow[] = [];
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from("edge_picks")
        .select("*")
        .order("created_at", { ascending: false })
        .range(from, from + PAGE - 1);
      if (error) {
        // Table may not exist yet if migration 013 hasn't been applied.
        // Supabase PostgREST returns variations like "Could not find the table
        // 'public.edge_picks'", or "relation does not exist". Match loosely.
        const msg = error.message || "";
        if (/edge_picks/i.test(msg) && /(does not exist|not find|cache)/i.test(msg)) {
          return NextResponse.json(
            {
              stats: null,
              recent: [],
              bySport: [],
              migrationPending: true,
            },
            { headers: { "Cache-Control": "no-store" } },
          );
        }
        return NextResponse.json(
          { error: "Failed to fetch edges", details: error.message },
          { status: 500 },
        );
      }
      if (!data || data.length === 0) break;
      all.push(...(data as EdgeRow[]));
      if (data.length < PAGE) break;
    }

    const total = all.length;
    const won = all.filter((e) => e.status === "won").length;
    const lost = all.filter((e) => e.status === "lost").length;
    const pending = all.filter((e) => e.status === "pending").length;
    const resolved = won + lost;
    const winRate = resolved > 0 ? (won / resolved) * 100 : 0;

    const resolvedRows = all.filter((e) => e.status !== "pending");
    const totalStaked = resolvedRows.length * 100; // $100 unit per pick
    const totalProfit = resolvedRows.reduce((s, e) => s + (e.profit ?? 0), 0);
    const roi = totalStaked > 0 ? (totalProfit / totalStaked) * 100 : 0;

    const clvRows = resolvedRows.filter(
      (e) => typeof e.clv_percent === "number",
    );
    const avgClv =
      clvRows.length > 0
        ? clvRows.reduce((s, e) => s + (e.clv_percent ?? 0), 0) / clvRows.length
        : null;

    // Per-sport breakdown
    const sportMap = new Map<string, { won: number; lost: number; profit: number }>();
    for (const e of resolvedRows) {
      const entry = sportMap.get(e.sport) ?? { won: 0, lost: 0, profit: 0 };
      if (e.status === "won") entry.won++;
      if (e.status === "lost") entry.lost++;
      entry.profit += e.profit ?? 0;
      sportMap.set(e.sport, entry);
    }
    const bySport = Array.from(sportMap.entries()).map(([sport, v]) => ({
      sport,
      won: v.won,
      lost: v.lost,
      winRate:
        v.won + v.lost > 0
          ? Math.round((v.won / (v.won + v.lost)) * 10000) / 100
          : 0,
      profit: Math.round(v.profit * 100) / 100,
    }));

    // Recent 30 edges
    const recent = all.slice(0, 30).map((e) => ({
      id: e.id,
      createdAt: e.created_at,
      sport: e.sport,
      game: e.game,
      market: e.market,
      pick: e.pick,
      odds: e.odds,
      book: e.book,
      evVsFair: e.ev_vs_fair,
      fairProb: e.fair_prob,
      impliedProb: e.implied_prob,
      status: e.status,
      profit: e.profit,
      clvPercent: e.clv_percent,
      closingOdds: e.closing_odds,
    }));

    return NextResponse.json(
      {
        stats: {
          total,
          won,
          lost,
          pending,
          winRate: Math.round(winRate * 100) / 100,
          totalProfit: Math.round(totalProfit * 100) / 100,
          roi: Math.round(roi * 100) / 100,
          avgClv:
            avgClv !== null
              ? Math.round(avgClv * 100) / 100
              : null,
          clvSample: clvRows.length,
          resolved,
          smallSample: resolved < SMALL_SAMPLE_THRESHOLD,
        },
        bySport,
        recent,
        migrationPending: false,
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      },
    );
  } catch (error) {
    console.error("Edges results error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
