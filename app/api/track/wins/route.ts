import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

// All Wins feed.
//
// Returns winning parlays newest first. Drives the public /wins page —
// a stream of receipts that doubles as marketing fuel and lets users
// spot patterns the model hasn't fully learned yet.
//
// Pagination via ?cursor=<created_at>&limit=N. Default 30 per page.

interface WinLeg {
  sport?: string;
  game?: string;
  pick?: string;
  market?: string;
  odds?: number;
  book?: string;
  commenceTime?: string;
}

interface WinRow {
  id: string;
  created_at: string;
  legs: WinLeg[];
  combined_odds: string;
  combined_decimal: number;
  confidence: number;
  payout: number;
  profit: number | null;
  ev_percent: number;
  sports: string[];
  legs_total: number;
  category: string | null;
}

const MAX_LIMIT = 100;
const UNIT_STAKE = 10;

export async function GET(req: NextRequest) {
  try {
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(1, parseInt(req.nextUrl.searchParams.get("limit") || "30", 10)),
    );
    const cursor = req.nextUrl.searchParams.get("cursor");
    const sport = req.nextUrl.searchParams.get("sport"); // optional filter

    let query = supabase
      .from("parlays")
      .select(
        "id, created_at, legs, combined_odds, combined_decimal, confidence, payout, profit, ev_percent, sports, legs_total, category",
      )
      .eq("status", "won")
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (cursor) {
      query = query.lt("created_at", cursor);
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = (data || []) as WinRow[];

    // Optional sport filter applied client-side after the DB query because
    // sports is a TEXT[] and we want "any leg matches" semantics. Cheap on
    // a 30-row page.
    const filtered = sport
      ? rows.filter(
          (r) =>
            Array.isArray(r.sports) &&
            r.sports.some((s) => s.toUpperCase() === sport.toUpperCase()),
        )
      : rows;

    // Compute the $10-stake versions of payout/profit so the UI can show
    // beginner-friendly numbers consistently with the rest of the site.
    const wins = filtered.map((r) => {
      const profitAtUnit = UNIT_STAKE * ((r.combined_decimal ?? 1) - 1);
      const payoutAtUnit = UNIT_STAKE * (r.combined_decimal ?? 1);
      return {
        id: r.id,
        createdAt: r.created_at,
        legs: r.legs,
        combinedOdds: r.combined_odds,
        confidence: r.confidence,
        payoutAtUnit: Math.round(payoutAtUnit * 100) / 100,
        profitAtUnit: Math.round(profitAtUnit * 100) / 100,
        evPercent: r.ev_percent,
        sports: r.sports,
        legsTotal: r.legs_total,
        category: r.category,
      };
    });

    const nextCursor =
      wins.length === limit ? wins[wins.length - 1].createdAt : null;

    return NextResponse.json(
      { wins, nextCursor, unitStake: UNIT_STAKE },
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
