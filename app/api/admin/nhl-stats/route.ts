import { NextResponse } from "next/server";
import { supabase as anonSupabase } from "@/lib/supabase";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const supabase = supabaseAdmin ?? anonSupabase;

export async function GET() {
  const { data, error } = await supabase
    .from("nhl_goalies")
    .select(
      "player_id, goalie_name, team_abbrev, games_played, games_started, wins, losses, save_pct, gaa, shutouts, shots_against, updated_at",
    )
    .order("games_started", { ascending: false })
    .limit(100);

  if (error && /relation .*nhl_goalies/i.test(error.message || "")) {
    return NextResponse.json({
      goalies: [],
      message:
        "nhl_goalies table missing. Apply migration 029 then run /api/cron/fetch-nhl-stats.",
    });
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    goalies: data ?? [],
    last_update: data?.[0]?.updated_at ?? null,
  });
}
