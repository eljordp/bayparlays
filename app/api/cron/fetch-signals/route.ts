import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { fetchActionNetworkScoreboard } from "@/lib/sources/actionnetwork";
import { fetchAllPinnacleSignals } from "@/lib/sources/pinnacle";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Hourly cron that pulls fresh signals from Action Network + Pinnacle and
// inserts to the betting_signals table. Both sources are free public
// APIs — no Odds API credit cost.
//
// What we get from each:
//   - Action Network: multi-book consensus + public bet % + money %
//     (sharp/square split on each game)
//   - Pinnacle: sharp lines + max bet limits (the canonical "true" price
//     used as benchmark by every paid handicapper)
//
// Schedule: GitHub Actions hourly during 16:00-04:00 UTC active window
// (see .github/workflows/fetch-signals.yml). Each run does ~1 second of
// work, no rate-limit issues observed in testing.

const AN_LEAGUES = ["mlb", "nba", "nhl"];

interface SignalRow {
  source: "actionnetwork" | "pinnacle";
  sport: string;
  ext_game_id: string;
  home_team: string;
  away_team: string;
  commence_time: string | null;
  ml_home: number | null;
  ml_away: number | null;
  spread_home_line: number | null;
  spread_away_line: number | null;
  spread_home_price: number | null;
  spread_away_price: number | null;
  total_line: number | null;
  total_over_price: number | null;
  total_under_price: number | null;
  public_pct_home: number | null;
  public_pct_away: number | null;
  money_pct_home: number | null;
  money_pct_away: number | null;
  public_pct_over: number | null;
  public_pct_under: number | null;
  money_pct_over: number | null;
  money_pct_under: number | null;
  pinnacle_max_stake: number | null;
  raw: unknown;
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: "Missing Supabase env" }, { status: 500 });
  }
  const supabase = createClient(url, key);

  const startTime = Date.now();
  const results = {
    actionnetwork: { fetched: 0, errors: [] as string[] },
    pinnacle: { fetched: 0, errors: [] as string[] },
    inserted: 0,
    insert_errors: [] as string[],
  };

  // ── Action Network ──────────────────────────────────────────────────
  const anRows: SignalRow[] = [];
  for (const league of AN_LEAGUES) {
    try {
      const signals = await fetchActionNetworkScoreboard(league);
      results.actionnetwork.fetched += signals.length;
      for (const s of signals) {
        anRows.push({
          source: s.source,
          sport: s.sport,
          ext_game_id: s.ext_game_id,
          home_team: s.home_team,
          away_team: s.away_team,
          commence_time: s.commence_time,
          ml_home: s.ml_home,
          ml_away: s.ml_away,
          spread_home_line: s.spread_home_line,
          spread_away_line: s.spread_away_line,
          spread_home_price: s.spread_home_price,
          spread_away_price: s.spread_away_price,
          total_line: s.total_line,
          total_over_price: s.total_over_price,
          total_under_price: s.total_under_price,
          public_pct_home: s.public_pct_home,
          public_pct_away: s.public_pct_away,
          money_pct_home: s.money_pct_home,
          money_pct_away: s.money_pct_away,
          public_pct_over: s.public_pct_over,
          public_pct_under: s.public_pct_under,
          money_pct_over: s.money_pct_over,
          money_pct_under: s.money_pct_under,
          pinnacle_max_stake: null,
          raw: s.raw,
        });
      }
    } catch (e) {
      results.actionnetwork.errors.push(
        `${league}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  // ── Pinnacle ────────────────────────────────────────────────────────
  const pRows: SignalRow[] = [];
  try {
    const signals = await fetchAllPinnacleSignals();
    results.pinnacle.fetched = signals.length;
    for (const s of signals) {
      pRows.push({
        source: s.source,
        sport: s.sport,
        ext_game_id: s.ext_game_id,
        home_team: s.home_team,
        away_team: s.away_team,
        commence_time: s.commence_time,
        ml_home: s.ml_home,
        ml_away: s.ml_away,
        spread_home_line: s.spread_home_line,
        spread_away_line: s.spread_away_line,
        spread_home_price: s.spread_home_price,
        spread_away_price: s.spread_away_price,
        total_line: s.total_line,
        total_over_price: s.total_over_price,
        total_under_price: s.total_under_price,
        public_pct_home: null,
        public_pct_away: null,
        money_pct_home: null,
        money_pct_away: null,
        public_pct_over: null,
        public_pct_under: null,
        money_pct_over: null,
        money_pct_under: null,
        pinnacle_max_stake: s.pinnacle_max_stake,
        raw: s.raw,
      });
    }
  } catch (e) {
    results.pinnacle.errors.push(
      e instanceof Error ? e.message : String(e),
    );
  }

  // ── Insert in batches. (source, ext_game_id, captured_at) is unique;
  // since captured_at defaults to now() each run is a fresh snapshot.
  const allRows = [...anRows, ...pRows];
  for (let i = 0; i < allRows.length; i += 100) {
    const batch = allRows.slice(i, i + 100);
    const { error } = await supabase.from("betting_signals").insert(batch);
    if (error) {
      results.insert_errors.push(
        `batch ${i}-${i + batch.length}: ${error.message}`,
      );
    } else {
      results.inserted += batch.length;
    }
  }

  // Auto-cleanup — delete rows older than 30 days. Calibration uses
  // rolling 60-day windows but per-leg signals beyond 30d are noise.
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  await supabase.from("betting_signals").delete().lt("captured_at", cutoff);

  return NextResponse.json({
    ok: true,
    duration_ms: Date.now() - startTime,
    ...results,
    timestamp: new Date().toISOString(),
  });
}
