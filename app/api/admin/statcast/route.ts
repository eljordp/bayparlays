import { NextResponse } from "next/server";
import { supabase as anonSupabase } from "@/lib/supabase";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const supabase = supabaseAdmin ?? anonSupabase;

// Returns Statcast snapshots — top pitchers and batters by sample size,
// ranked by regression signal (bigger diff = bigger expected mean reversion
// in either direction). Used by /admin/statcast to verify data freshness
// and surface notable regression candidates.

export async function GET() {
  const { data: pitchers, error: pErr } = await supabase
    .from("statcast_pitchers")
    .select(
      "player_id, player_name, season, pa, woba, est_woba, est_woba_diff, era, xera, era_xera_diff, updated_at",
    )
    .order("pa", { ascending: false })
    .limit(200);

  const { data: batters, error: bErr } = await supabase
    .from("statcast_batters")
    .select(
      "player_id, player_name, season, pa, woba, est_woba, est_woba_diff, barrel_pct, hard_hit_pct, updated_at",
    )
    .order("pa", { ascending: false })
    .limit(200);

  if (pErr && /relation .*statcast/i.test(pErr.message || "")) {
    return NextResponse.json({
      pitchers: [],
      batters: [],
      message:
        "statcast tables missing. Apply migration 028 then run /api/cron/fetch-statcast.",
    });
  }
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
  if (bErr) return NextResponse.json({ error: bErr.message }, { status: 500 });

  return NextResponse.json({
    pitchers: pitchers ?? [],
    batters: batters ?? [],
    last_pitcher_update: pitchers?.[0]?.updated_at ?? null,
    last_batter_update: batters?.[0]?.updated_at ?? null,
  });
}
