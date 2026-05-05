import { NextResponse } from "next/server";
import { supabase as anonSupabase } from "@/lib/supabase";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const supabase = supabaseAdmin ?? anonSupabase;

// Returns the latest betting_signals snapshot per (source, ext_game_id)
// so the /admin/signals page can render the current state of public/
// money percentages and Pinnacle benchmarks for every game we're
// tracking. Signals older than 36 hours are excluded so the page
// reflects "today's slate" not historical noise.

interface SignalRow {
  id: string;
  captured_at: string;
  source: "actionnetwork" | "pinnacle";
  sport: string;
  ext_game_id: string;
  home_team: string;
  away_team: string;
  commence_time: string | null;
  ml_home: number | null;
  ml_away: number | null;
  total_line: number | null;
  public_pct_home: number | null;
  public_pct_away: number | null;
  money_pct_home: number | null;
  money_pct_away: number | null;
  pinnacle_max_stake: number | null;
}

export async function GET() {
  const cutoff = new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("betting_signals")
    .select(
      "id, captured_at, source, sport, ext_game_id, home_team, away_team, commence_time, ml_home, ml_away, total_line, public_pct_home, public_pct_away, money_pct_home, money_pct_away, pinnacle_max_stake",
    )
    .gte("captured_at", cutoff)
    .order("captured_at", { ascending: false })
    .limit(2000);

  if (error) {
    if (/relation .*betting_signals/i.test(error.message || "")) {
      return NextResponse.json({
        rows: [],
        message:
          "betting_signals table missing. Apply migration 027 then run /api/cron/fetch-signals.",
      });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Dedupe to latest snapshot per (source, ext_game_id) — we only want
  // the freshest read for each (source, game), not the full history.
  const rows = (data ?? []) as SignalRow[];
  const latest = new Map<string, SignalRow>();
  for (const row of rows) {
    const key = `${row.source}|${row.ext_game_id}`;
    if (!latest.has(key)) latest.set(key, row);
  }

  // Group by ext_game_id (loose match on home/away to align AN ↔ Pinnacle
  // rows for the same game). Returned shape gives the page everything it
  // needs to render side-by-side comparison cards.
  type GameBundle = {
    home_team: string;
    away_team: string;
    sport: string;
    commence_time: string | null;
    actionnetwork: SignalRow | null;
    pinnacle: SignalRow | null;
  };
  const games = new Map<string, GameBundle>();
  for (const row of latest.values()) {
    // Loose join key — same teams, same sport, same calendar day
    const day = row.commence_time ? row.commence_time.slice(0, 10) : "?";
    const teamKey = [row.home_team, row.away_team].sort().join("|");
    const gkey = `${row.sport}|${teamKey}|${day}`;
    const bundle = games.get(gkey) ?? {
      home_team: row.home_team,
      away_team: row.away_team,
      sport: row.sport,
      commence_time: row.commence_time,
      actionnetwork: null,
      pinnacle: null,
    };
    if (row.source === "actionnetwork") bundle.actionnetwork = row;
    if (row.source === "pinnacle") bundle.pinnacle = row;
    games.set(gkey, bundle);
  }

  const bundles = Array.from(games.values()).sort((a, b) => {
    const ta = a.commence_time ? new Date(a.commence_time).getTime() : Infinity;
    const tb = b.commence_time ? new Date(b.commence_time).getTime() : Infinity;
    return ta - tb;
  });

  return NextResponse.json({
    games: bundles,
    total_games: bundles.length,
    last_capture: rows[0]?.captured_at ?? null,
  });
}
