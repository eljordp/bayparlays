import { NextResponse } from "next/server";
import { supabase as anonSupabase } from "@/lib/supabase";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const supabase = supabaseAdmin ?? anonSupabase;

// Public endpoint feeding the /learnings page. Returns the AI's learned
// edge profile in plain-English-friendly form: top sharp buckets, top
// penalized buckets, headline stats. Data sourced from the same
// model_calibration + parlays tables the admin pages use, but
// formatted for non-technical users.

interface CalibCell {
  sport: string | null;
  market: string | null;
  odds_bucket: string | null;
  sample_size: number;
  predicted_prob_avg: number;
  actual_hit_rate: number;
  calibration_factor: number;
  avg_clv: number | null;
  clv_sample: number | null;
  computed_at: string;
}

const BUCKET_LABEL: Record<string, string> = {
  heavy_fav: "heavy favorites (≤1.50)",
  fav: "favorites (1.50-1.91)",
  pick: "pick'em odds (1.91-2.10)",
  dog: "underdogs (2.10-3.00)",
  long: "longshots (3.00-6.00)",
  moon: "moonshots (>6.00)",
};

const SHARP_THRESHOLD = 1.1; // factor ≥1.10 = meaningfully boosted
const PENALIZED_THRESHOLD = 0.85; // factor ≤0.85 = meaningfully penalized
const MIN_SAMPLE = 50; // exclude tiny-sample cells from the public summary

function describeCell(c: CalibCell): { label: string; secondary: string } {
  const parts = [c.sport, c.market].filter(Boolean) as string[];
  const head = parts.length > 0 ? parts.join(" ") : "All sports / markets";
  const oddsPart = c.odds_bucket ? BUCKET_LABEL[c.odds_bucket] ?? c.odds_bucket : "all odds";
  return {
    label: head,
    secondary: oddsPart,
  };
}

export async function GET() {
  // Pull most-recent snapshot per cell key from model_calibration. Same
  // dedup strategy as /api/admin/calibration so the public page reflects
  // exactly the buckets driving live picks.
  const { data: calibRows, error: calibErr } = await supabase
    .from("model_calibration")
    .select(
      "sport, market, odds_bucket, sample_size, predicted_prob_avg, actual_hit_rate, calibration_factor, avg_clv, clv_sample, computed_at",
    )
    .order("computed_at", { ascending: false })
    .limit(500);

  if (calibErr) {
    return NextResponse.json({ error: calibErr.message }, { status: 500 });
  }

  const seen = new Set<string>();
  const cells: CalibCell[] = [];
  for (const row of (calibRows ?? []) as CalibCell[]) {
    const key = `${row.sport ?? ""}|${row.market ?? ""}|${row.odds_bucket ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    cells.push(row);
  }

  // Filter out the noisy stuff and split into sharp / penalized.
  const meaningful = cells.filter((c) => c.sample_size >= MIN_SAMPLE);
  const sharp = meaningful
    .filter((c) => c.calibration_factor >= SHARP_THRESHOLD)
    .sort((a, b) => b.calibration_factor - a.calibration_factor)
    .slice(0, 8)
    .map((c) => ({
      ...describeCell(c),
      sample_size: c.sample_size,
      factor: c.calibration_factor,
      hit_rate: c.actual_hit_rate,
      predicted: c.predicted_prob_avg,
      avg_clv: c.avg_clv,
      clv_sample: c.clv_sample,
    }));

  const penalized = meaningful
    .filter((c) => c.calibration_factor <= PENALIZED_THRESHOLD)
    .sort((a, b) => a.calibration_factor - b.calibration_factor)
    .slice(0, 8)
    .map((c) => ({
      ...describeCell(c),
      sample_size: c.sample_size,
      factor: c.calibration_factor,
      hit_rate: c.actual_hit_rate,
      predicted: c.predicted_prob_avg,
      avg_clv: c.avg_clv,
      clv_sample: c.clv_sample,
    }));

  // Headline stats — same source as /api/track/results so numbers stay
  // consistent across the two pages.
  let headline: {
    total_graded: number;
    win_rate: number;
    profit_at_unit: number;
    avg_clv: number | null;
    clv_sample: number;
    last_calibration: string | null;
  } | null = null;
  try {
    const { data: parlayRows } = await supabase
      .from("parlays")
      .select("status, combined_decimal, clv_percent")
      .neq("status", "pending");
    if (parlayRows) {
      let won = 0;
      let lost = 0;
      let profitAtUnit = 0;
      const STAKE = 10;
      const clvs: number[] = [];
      for (const r of parlayRows as Array<{
        status: string;
        combined_decimal: number | null;
        clv_percent: number | null;
      }>) {
        if (r.status === "won") {
          won++;
          if (r.combined_decimal && r.combined_decimal > 1) {
            profitAtUnit += STAKE * (r.combined_decimal - 1);
          }
        } else if (r.status === "lost") {
          lost++;
          profitAtUnit -= STAKE;
        }
        if (typeof r.clv_percent === "number") clvs.push(r.clv_percent);
      }
      const total = won + lost;
      headline = {
        total_graded: total,
        win_rate: total > 0 ? Math.round((won / total) * 1000) / 10 : 0,
        profit_at_unit: Math.round(profitAtUnit),
        avg_clv:
          clvs.length > 0
            ? Math.round((clvs.reduce((s, v) => s + v, 0) / clvs.length) * 100) / 100
            : null,
        clv_sample: clvs.length,
        last_calibration: cells[0]?.computed_at ?? null,
      };
    }
  } catch {
    // headline stays null
  }

  return NextResponse.json({
    headline,
    sharp,
    penalized,
    cell_count_total: cells.length,
    cell_count_meaningful: meaningful.length,
  });
}
