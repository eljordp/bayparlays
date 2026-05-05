import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { fetchNhlGoalies } from "@/lib/sources/nhl";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Daily cron — pulls NHL goalie season-to-date stats from the official
// NHL Stats API and upserts to nhl_goalies. Runs at 14:30 UTC = 9:30am
// ET, after the NHL's overnight refresh and just after Statcast.

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
  const result = {
    fetched: 0,
    upserted: 0,
    errors: [] as string[],
  };

  try {
    const goalies = await fetchNhlGoalies();
    result.fetched = goalies.length;
    if (goalies.length > 0) {
      const rows = goalies.map((g) => ({
        ...g,
        updated_at: new Date().toISOString(),
      }));
      for (let i = 0; i < rows.length; i += 100) {
        const batch = rows.slice(i, i + 100);
        const { error } = await supabase
          .from("nhl_goalies")
          .upsert(batch, { onConflict: "player_id" });
        if (error) {
          result.errors.push(`batch ${i}-${i + batch.length}: ${error.message}`);
        } else {
          result.upserted += batch.length;
        }
      }
    }
  } catch (e) {
    result.errors.push(e instanceof Error ? e.message : String(e));
  }

  return NextResponse.json({
    ok: true,
    duration_ms: Date.now() - startTime,
    ...result,
    timestamp: new Date().toISOString(),
  });
}
