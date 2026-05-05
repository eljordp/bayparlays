import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  fetchPitcherExpectedStats,
  fetchBatterFull,
} from "@/lib/sources/savant";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Daily cron — pulls Statcast leaderboards from Baseball Savant and
// upserts into statcast_pitchers + statcast_batters.
//
// Savant publishes season-to-date aggregates that update each morning
// (around 6am ET) after the previous day's games are processed. Running
// at 14:00 UTC = 9am ET catches the fresh numbers before our morning
// slate generation kicks off.
//
// No Odds API credit cost — Savant is free public CSV.

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
  const season = new Date().getFullYear();
  const result = {
    pitchers: { fetched: 0, upserted: 0, errors: [] as string[] },
    batters: { fetched: 0, upserted: 0, errors: [] as string[] },
  };

  // ── Pitchers ─────────────────────────────────────────────────────────
  try {
    const pitchers = await fetchPitcherExpectedStats(season);
    result.pitchers.fetched = pitchers.length;
    if (pitchers.length > 0) {
      const rows = pitchers.map((p) => ({
        ...p,
        updated_at: new Date().toISOString(),
      }));
      // Upsert in batches of 200 to stay under Supabase request size limits.
      for (let i = 0; i < rows.length; i += 200) {
        const batch = rows.slice(i, i + 200);
        const { error } = await supabase
          .from("statcast_pitchers")
          .upsert(batch, { onConflict: "player_id" });
        if (error) {
          result.pitchers.errors.push(
            `batch ${i}-${i + batch.length}: ${error.message}`,
          );
        } else {
          result.pitchers.upserted += batch.length;
        }
      }
    }
  } catch (e) {
    result.pitchers.errors.push(e instanceof Error ? e.message : String(e));
  }

  // ── Batters (expected stats + exit velocity merged) ──────────────────
  try {
    const batters = await fetchBatterFull(season);
    result.batters.fetched = batters.length;
    if (batters.length > 0) {
      const rows = batters.map((b) => ({
        ...b,
        updated_at: new Date().toISOString(),
      }));
      for (let i = 0; i < rows.length; i += 200) {
        const batch = rows.slice(i, i + 200);
        const { error } = await supabase
          .from("statcast_batters")
          .upsert(batch, { onConflict: "player_id" });
        if (error) {
          result.batters.errors.push(
            `batch ${i}-${i + batch.length}: ${error.message}`,
          );
        } else {
          result.batters.upserted += batch.length;
        }
      }
    }
  } catch (e) {
    result.batters.errors.push(e instanceof Error ? e.message : String(e));
  }

  return NextResponse.json({
    ok: true,
    duration_ms: Date.now() - startTime,
    season,
    ...result,
    timestamp: new Date().toISOString(),
  });
}
