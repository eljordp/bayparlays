import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { canFetch } from "@/lib/odds-quota";
import type { OddsResponse, GameOdds, BestOdds } from "@/app/api/odds/route";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Pre-tip closing-line capture.
//
// CLV (closing-line value) is the one metric that proves a model is sharp.
// The check-scores CLV lookup picks the most recent line_history row before
// commence_time. If our most recent capture is 4hrs pre-tip, CLV is noise.
// This endpoint captures within ~30 min of tip-off so CLV reflects real close.
//
// Runs via GitHub Actions every 10 min (.github/workflows/pre-tip-capture.yml).
// Gated on Odds API quota and Next.js route cache — repeated calls inside the
// 30-min /api/odds revalidate window cost zero extra credits.

// Sports to capture — must be keys that /api/odds SPORT_MAP supports AND
// sports we actually generate tracked parlays for. Filtered by in-season
// month at runtime so off-season fetches don't burn credits returning empty.
const ALL_SPORTS = ["nba", "mlb", "nhl", "nfl", "ncaaf", "ncaab"];

function inSeasonSports(): string[] {
  const month = new Date().getUTCMonth(); // 0=Jan
  return ALL_SPORTS.filter((s) => {
    switch (s) {
      case "nba": return month >= 9 || month <= 5;
      case "nhl": return month >= 9 || month <= 5;
      case "mlb": return month >= 2 && month <= 9;
      case "nfl": return month >= 8 || month <= 1;
      case "ncaaf": return month >= 7 || month === 0;
      case "ncaab": return month >= 10 || month <= 3;
      default: return false;
    }
  });
}

// Only capture for games starting in this window (minutes from now).
// Before LOWER: too early, line could still move. After UPPER: game started.
const WINDOW_LOWER_MIN = 5;
const WINDOW_UPPER_MIN = 30;

// Skip re-capturing the same (game, market, team) triple if we already have
// a row within this many minutes. Prevents the 10-min cron from piling up
// redundant near-duplicate rows.
const DEDUP_WINDOW_MIN = 8;

type LineRow = {
  game_id: string;
  sport: string;
  market: string;
  team: string;
  point: number | null;
  best_odds: number;
  best_book: string | null;
  avg_odds: number | null;
};

function formatPick(marketKey: string, outcome: BestOdds): {
  market: string;
  pick: string;
} | null {
  if (marketKey === "h2h") {
    return { market: "moneyline", pick: `${outcome.outcomeName} ML` };
  }
  if (marketKey === "spreads") {
    if (outcome.bestPoint === undefined) return null;
    const pointStr =
      outcome.bestPoint > 0 ? `+${outcome.bestPoint}` : `${outcome.bestPoint}`;
    return {
      market: "spread",
      pick: `${outcome.outcomeName} ${pointStr}`,
    };
  }
  if (marketKey === "totals") {
    if (outcome.bestPoint === undefined) return null;
    return {
      market: "total",
      pick: `${outcome.outcomeName} ${outcome.bestPoint}`,
    };
  }
  return null;
}

function gamesInWindow(
  games: GameOdds[],
  lowerMin: number,
  upperMin: number,
): GameOdds[] {
  const now = Date.now();
  const lower = now + lowerMin * 60 * 1000;
  const upper = now + upperMin * 60 * 1000;
  return games.filter((g) => {
    const t = new Date(g.commenceTime).getTime();
    return t >= lower && t <= upper;
  });
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // Quota gate — bail early if we're near the free-tier cap.
  const safe = await canFetch(20);
  if (!safe) {
    return NextResponse.json({
      ok: false,
      skipped: "quota",
      message: "Odds API quota too low; skipping pre-tip capture.",
    });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json(
      { error: "Supabase env missing" },
      { status: 500 },
    );
  }
  const supabase = createClient(supabaseUrl, supabaseKey);

  const baseUrl =
    process.env.NEXT_PUBLIC_BASE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

  // Dev-only dry run: wider window + return rows without inserting. Used to
  // verify row shape end-to-end against live /api/odds output without
  // polluting line_history. Disabled in production.
  const url = new URL(req.url);
  const dry =
    process.env.NODE_ENV !== "production" && url.searchParams.get("dry") === "1";
  const windowLower = dry ? 0 : WINDOW_LOWER_MIN;
  const windowUpper = dry ? 600 : WINDOW_UPPER_MIN;

  const perSport: Array<{
    sport: string;
    gamesInWindow: number;
    rowsInserted: number;
    skipped?: string;
  }> = [];

  const dedupCutoff = new Date(
    Date.now() - DEDUP_WINDOW_MIN * 60 * 1000,
  ).toISOString();

  for (const sport of inSeasonSports()) {
    try {
      const res = await fetch(`${baseUrl}/api/odds?sport=${sport}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        perSport.push({ sport, gamesInWindow: 0, rowsInserted: 0, skipped: `fetch ${res.status}` });
        continue;
      }
      const data: OddsResponse = await res.json();
      const windowed = gamesInWindow(data.games, windowLower, windowUpper);
      if (windowed.length === 0) {
        perSport.push({ sport, gamesInWindow: 0, rowsInserted: 0 });
        continue;
      }

      const rows: LineRow[] = [];
      for (const game of windowed) {
        for (const [marketKey, outcomes] of Object.entries(game.bestOdds)) {
          for (const outcome of outcomes) {
            const fmt = formatPick(marketKey, outcome);
            if (!fmt) continue;
            rows.push({
              game_id: game.id,
              sport: sport.toUpperCase(),
              market: fmt.market,
              team: fmt.pick,
              point: outcome.bestPoint ?? null,
              best_odds: outcome.bestPrice,
              best_book: outcome.bestBook || null,
              avg_odds: null,
            });
          }
        }
      }

      if (rows.length === 0) {
        perSport.push({ sport, gamesInWindow: windowed.length, rowsInserted: 0 });
        continue;
      }

      if (dry) {
        perSport.push({
          sport,
          gamesInWindow: windowed.length,
          rowsInserted: 0,
          skipped: `dry-run (would insert ${rows.length})`,
        });
        // Attach sample rows for inspection.
        (perSport[perSport.length - 1] as Record<string, unknown>).sampleRow = rows[0];
        continue;
      }

      // Dedup: drop rows that already have a recent capture for the same
      // (game, market, team) triple. Avoids piling up near-duplicates when
      // the cron fires multiple times inside DEDUP_WINDOW_MIN.
      const gameIds = Array.from(new Set(rows.map((r) => r.game_id)));
      const { data: recent } = await supabase
        .from("line_history")
        .select("game_id, market, team, captured_at")
        .in("game_id", gameIds)
        .gte("captured_at", dedupCutoff);

      const recentKeys = new Set(
        (recent || []).map((r) => `${r.game_id}|${r.market}|${r.team}`),
      );
      const fresh = rows.filter(
        (r) => !recentKeys.has(`${r.game_id}|${r.market}|${r.team}`),
      );

      if (fresh.length === 0) {
        perSport.push({ sport, gamesInWindow: windowed.length, rowsInserted: 0, skipped: "dedup" });
        continue;
      }

      const { error: insertErr } = await supabase
        .from("line_history")
        .insert(fresh);

      if (insertErr) {
        perSport.push({
          sport,
          gamesInWindow: windowed.length,
          rowsInserted: 0,
          skipped: `insert: ${insertErr.message}`,
        });
      } else {
        perSport.push({
          sport,
          gamesInWindow: windowed.length,
          rowsInserted: fresh.length,
        });
      }
    } catch (e) {
      perSport.push({
        sport,
        gamesInWindow: 0,
        rowsInserted: 0,
        skipped: `error: ${String(e)}`,
      });
    }
  }

  const totalInserted = perSport.reduce((s, r) => s + r.rowsInserted, 0);
  const totalGames = perSport.reduce((s, r) => s + r.gamesInWindow, 0);

  return NextResponse.json({
    ok: true,
    timestamp: new Date().toISOString(),
    windowMinutes: [windowLower, windowUpper],
    dry: dry || undefined,
    totalGamesInWindow: totalGames,
    totalRowsInserted: totalInserted,
    perSport,
  });
}
