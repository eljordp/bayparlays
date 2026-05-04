import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

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
}

export async function GET() {
  let rows: CalibRow[] | null = null;

  const { data, error } = await supabase
    .from("model_calibration")
    .select(
      "sport, market, odds_bucket, sample_size, predicted_prob_avg, actual_hit_rate, calibration_factor, notes, computed_at",
    )
    .order("computed_at", { ascending: false })
    .limit(1000);

  if (error && /column .*odds_bucket/i.test(error.message || "")) {
    // v1-only DB — fetch without odds_bucket and synthesize the field as null.
    const { data: v1, error: v1err } = await supabase
      .from("model_calibration")
      .select(
        "sport, market, sample_size, predicted_prob_avg, actual_hit_rate, calibration_factor, notes, computed_at",
      )
      .order("computed_at", { ascending: false })
      .limit(1000);
    if (v1err) return NextResponse.json({ error: v1err.message }, { status: 500 });
    rows = (v1 ?? []).map((r) => ({ ...r, odds_bucket: null }));
  } else if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    rows = data;
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
