import { NextResponse } from "next/server";
import { supabase as anonSupabase } from "@/lib/supabase";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const supabase = supabaseAdmin ?? anonSupabase;

export async function GET() {
  const { data, error } = await supabase
    .from("nba_team_stats")
    .select(
      "team_id, season, season_type, team_abbrev, team_name, games_played, points_per_game, points_against_per_game, fg_pct, three_pct, pace, off_rating, def_rating, net_rating, updated_at",
    )
    .order("net_rating", { ascending: false });

  if (error && /relation .*nba_team_stats/i.test(error.message || "")) {
    return NextResponse.json({
      teams: [],
      message:
        "nba_team_stats table missing. Apply migration 030 then run /api/cron/fetch-nba-stats.",
    });
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = data ?? [];
  return NextResponse.json({
    teams: rows,
    last_update: rows[0]?.updated_at ?? null,
  });
}
