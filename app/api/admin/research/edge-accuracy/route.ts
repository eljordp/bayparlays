import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// ─── Edge-accuracy bucket analysis ──────────────────────────────────────────
//
// Asks the data: when the AI claims "+8% edge over book," does the parlay
// actually win 8% more than book-implied? Buckets every resolved parlay by
// claimed EV percent, compares the AI's predicted hit rate (book-implied
// inflated by EV claim) against the actual hit rate.
//
// Powers /admin/research/edge-accuracy. The first Tier 1 query — proves or
// disproves the model's edge claims at every confidence level.

interface ParlayRow {
  status: "won" | "lost";
  combined_decimal: number;
  ev_percent: number | null;
}

interface Bucket {
  label: string;
  min: number;
  max: number;
  predicted: number[];
  actual: number[];
}

// Defined inside GET (not module-level) so each request gets fresh arrays.
// Module-level mutable state in serverless = arrays grow forever across calls.
function freshBuckets(): Bucket[] {
  return [
    { label: "Negative EV (-Inf to 0%)", min: -Infinity, max: 0, predicted: [], actual: [] },
    { label: "Low (0-2%)", min: 0, max: 2, predicted: [], actual: [] },
    { label: "Modest (2-5%)", min: 2, max: 5, predicted: [], actual: [] },
    { label: "Solid (5-10%)", min: 5, max: 10, predicted: [], actual: [] },
    { label: "Strong (10-20%)", min: 10, max: 20, predicted: [], actual: [] },
    { label: "Big (20-50%)", min: 20, max: 50, predicted: [], actual: [] },
    { label: "Insane (50%+)", min: 50, max: Infinity, predicted: [], actual: [] },
  ];
}

export async function GET() {
  // Pull all resolved parlays from the parlays table (the AI's daily picks
  // which carry ev_percent). research_parlays could feed this too once
  // resolver populates them.
  const rows: ParlayRow[] = [];
  const PAGE = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("parlays")
      .select("status, combined_decimal, ev_percent")
      .neq("status", "pending")
      .range(from, from + PAGE - 1);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data || data.length === 0) break;
    rows.push(...(data as ParlayRow[]));
    if (data.length < PAGE) break;
    from += PAGE;
  }

  if (rows.length === 0) {
    return NextResponse.json({ rows: [], buckets: [], totalSampled: 0 });
  }

  const buckets = freshBuckets();

  // Bucket each parlay by its claimed EV percent
  for (const p of rows) {
    if (!p.combined_decimal || p.combined_decimal <= 1) continue;
    const ev = p.ev_percent ?? 0;
    const bookImpliedProb = 1 / p.combined_decimal;
    const aiPredictedProb = bookImpliedProb * (1 + ev / 100);
    const actual = p.status === "won" ? 1 : 0;

    const bucket = buckets.find((b) => ev >= b.min && ev < b.max);
    if (!bucket) continue;
    bucket.predicted.push(aiPredictedProb);
    bucket.actual.push(actual);
  }

  const out = buckets.map((b) => {
    const n = b.predicted.length;
    if (n === 0) {
      return {
        label: b.label,
        sample: 0,
        predictedHitRate: null,
        actualHitRate: null,
        diff: null,
        verdict: "no data",
      };
    }
    const predictedAvg =
      Math.round(
        (b.predicted.reduce((s, v) => s + v, 0) / n) * 10000,
      ) / 100;
    const actualAvg =
      Math.round((b.actual.reduce((s, v) => s + v, 0) / n) * 10000) / 100;
    const diff = Math.round((actualAvg - predictedAvg) * 100) / 100;
    let verdict: string;
    if (n < 20) verdict = "thin sample";
    else if (Math.abs(diff) < 3) verdict = "honest — model accurate";
    else if (diff > 0) verdict = `model UNDER-confident by ${diff.toFixed(1)} pts`;
    else verdict = `model OVER-confident by ${Math.abs(diff).toFixed(1)} pts`;
    return {
      label: b.label,
      sample: n,
      predictedHitRate: predictedAvg,
      actualHitRate: actualAvg,
      diff,
      verdict,
    };
  });

  return NextResponse.json({
    totalSampled: rows.length,
    buckets: out,
    timestamp: new Date().toISOString(),
  });
}
