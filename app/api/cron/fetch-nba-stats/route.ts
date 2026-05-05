import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { fetchAllNbaTeamStats } from "@/lib/sources/espn-nba";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Daily cron — pulls NBA team season summaries from ESPN's public core
// API. ~30 teams × 1 request each = ~15s end-to-end. Free, no Odds API
// credit cost, works fine from Vercel-region IPs (unlike stats.nba.com).
//
// Pulls BOTH regular season (type=2) and playoffs (type=3). Once
// playoffs end and offseason begins, pulling playoffs returns 0 teams
// gracefully.

function defaultSeason(): number {
  // NBA seasons span Oct → June. We label them by the END year:
  // 2025-26 season = 2026. Switch to next year on Oct 1.
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth(); // 0-indexed
  return m >= 9 ? y + 1 : y;
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
  const season = defaultSeason();
  const result = {
    season,
    regular_season: { fetched: 0, upserted: 0, errors: [] as string[] },
    playoffs: { fetched: 0, upserted: 0, errors: [] as string[] },
  };

  for (const seasonType of [2, 3] as const) {
    const bucket = seasonType === 2 ? result.regular_season : result.playoffs;
    try {
      const stats = await fetchAllNbaTeamStats(season, seasonType);
      bucket.fetched = stats.length;
      if (stats.length > 0) {
        const rows = stats.map((s) => ({
          ...s,
          updated_at: new Date().toISOString(),
        }));
        const { error } = await supabase
          .from("nba_team_stats")
          .upsert(rows, { onConflict: "team_id,season,season_type" });
        if (error) {
          bucket.errors.push(error.message);
        } else {
          bucket.upserted = rows.length;
        }
      }
    } catch (e) {
      bucket.errors.push(e instanceof Error ? e.message : String(e));
    }
  }

  return NextResponse.json({
    ok: true,
    duration_ms: Date.now() - startTime,
    ...result,
    timestamp: new Date().toISOString(),
  });
}
