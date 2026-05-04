import { NextResponse } from "next/server";
import { supabase as anonSupabase } from "@/lib/supabase";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

// Server-side only — this route is gated by isAdmin in the calling page.
// Using the service-role client bypasses RLS so anon-grant gaps don't
// silently swallow rows. Falls back to the anon client if the service
// role env var isn't set (dev environments without the secret).
const supabase = supabaseAdmin ?? anonSupabase;

// Returns the latest calibration row per (sport, market, odds_bucket) cell so
// the admin page can render the model's current learned adjustments. Falls
// back to v1 columns if odds_bucket isn't migrated yet.

interface CalibRow {
  sport: string | null;
  market: string | null;
  odds_bucket: string | null;
  sample_size: number;
  predicted_prob_avg: number;
  actual_hit_rate: number;
  calibration_factor: number;
  notes: string | null;
  computed_at: string;
  avg_clv: number | null;
  clv_sample: number | null;
}

export async function GET() {
  let rows: CalibRow[] | null = null;

  // Fallback ladder — fullest select first, drop columns one tier at a time
  // if a deploy is behind on migrations.
  const SELECTS = [
    "sport, market, odds_bucket, sample_size, predicted_prob_avg, actual_hit_rate, calibration_factor, notes, computed_at, avg_clv, clv_sample",
    "sport, market, odds_bucket, sample_size, predicted_prob_avg, actual_hit_rate, calibration_factor, notes, computed_at",
    "sport, market, sample_size, predicted_prob_avg, actual_hit_rate, calibration_factor, notes, computed_at",
  ];

  for (const sel of SELECTS) {
    const { data, error } = await supabase
      .from("model_calibration")
      .select(sel)
      .order("computed_at", { ascending: false })
      .limit(1000);
    if (!error) {
      rows = (data as unknown as CalibRow[]).map((r) => ({
        sport: r.sport ?? null,
        market: r.market ?? null,
        odds_bucket: r.odds_bucket ?? null,
        sample_size: r.sample_size,
        predicted_prob_avg: r.predicted_prob_avg,
        actual_hit_rate: r.actual_hit_rate,
        calibration_factor: r.calibration_factor,
        notes: r.notes ?? null,
        computed_at: r.computed_at,
        avg_clv: r.avg_clv ?? null,
        clv_sample: r.clv_sample ?? null,
      }));
      break;
    }
    if (!/column .*(odds_bucket|avg_clv|clv_sample)/i.test(error.message || "")) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  if (!rows) return NextResponse.json({ cells: [] });

  // Most-recent-wins per cell key — same dedup logic as the EV reader so the
  // admin UI shows exactly the row that's currently driving live picks.
  const seen = new Set<string>();
  const latest: CalibRow[] = [];
  for (const row of rows) {
    const key = `${row.sport ?? ""}|${row.market ?? ""}|${row.odds_bucket ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    latest.push(row);
  }

  // Sort by sample_size desc so most-trusted cells surface first.
  latest.sort((a, b) => b.sample_size - a.sample_size);

  return NextResponse.json({
    cells: latest,
    total_cells: latest.length,
    last_run: latest[0]?.computed_at ?? null,
  });
}
