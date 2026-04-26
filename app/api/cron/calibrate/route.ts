import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// HTTP-callable wrapper around the calibration script. Used by the GH Actions
// daily cron + manual triggers. Same logic as scripts/calibrate.ts but inline
// here so we don't need a separate process.

const MIN_SAMPLE = 25;
const FULL_TRUST_AT = 100;
const MIN_FACTOR = 0.6;
const MAX_FACTOR = 1.4;

interface ResolvedParlay {
  status: "won" | "lost";
  combined_decimal: number;
  ev_percent: number | null;
  sports: string[] | null;
  legs: Array<{ sport?: string; market?: string }> | null;
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

  // Pull resolved data from BOTH parlays (AI's daily picks) and
  // research_parlays (top-EV combos from the brute-force scanner).
  // Both have ev_percent + status, so calibration treats them the same way.
  // research_parlays is potentially 10x+ the sample size once the scanner
  // and resolver are running steadily.
  const allParlays: ResolvedParlay[] = [];
  for (const tableName of ["parlays", "research_parlays"] as const) {
    let from = 0;
    const PAGE = 1000;
    while (true) {
      const { data, error } = await supabase
        .from(tableName)
        .select("status, combined_decimal, ev_percent, sports, legs")
        .neq("status", "pending")
        .range(from, from + PAGE - 1);
      if (error) {
        return NextResponse.json(
          { error: `${tableName}: ${error.message}` },
          { status: 500 },
        );
      }
      if (!data || data.length === 0) break;
      allParlays.push(...(data as ResolvedParlay[]));
      if (data.length < PAGE) break;
      from += PAGE;
    }
  }

  if (allParlays.length === 0) {
    return NextResponse.json({ resolved: 0, written: 0, message: "no resolved parlays" });
  }

  type Bucket = { predicted: number[]; actual: number[] };
  const groups = new Map<string | null, Bucket>();
  groups.set(null, { predicted: [], actual: [] });

  for (const p of allParlays) {
    if (!p.combined_decimal || p.combined_decimal <= 1) continue;
    const bookImpliedProb = 1 / p.combined_decimal;
    const aiPredictedProb = bookImpliedProb * (1 + (p.ev_percent ?? 0) / 100);
    const clamped = Math.max(0.01, Math.min(0.99, aiPredictedProb));
    const actual = p.status === "won" ? 1 : 0;

    groups.get(null)!.predicted.push(clamped);
    groups.get(null)!.actual.push(actual);

    const sport = p.sports?.[0] ?? p.legs?.[0]?.sport ?? null;
    if (sport) {
      if (!groups.has(sport)) groups.set(sport, { predicted: [], actual: [] });
      groups.get(sport)!.predicted.push(clamped);
      groups.get(sport)!.actual.push(actual);
    }
  }

  const rows: Array<{
    sport: string | null;
    market: null;
    sample_size: number;
    predicted_prob_avg: number;
    actual_hit_rate: number;
    calibration_factor: number;
    notes: string;
  }> = [];

  for (const [sport, { predicted, actual }] of groups) {
    const n = predicted.length;
    if (n < MIN_SAMPLE) continue;
    const predictedAvg = predicted.reduce((s, v) => s + v, 0) / n;
    const actualRate = actual.reduce((s, v) => s + v, 0) / n;
    const rawFactor = predictedAvg > 0 ? actualRate / predictedAvg : 1;
    const trust = Math.min(1, n / FULL_TRUST_AT);
    const blended = 1 + (rawFactor - 1) * trust;
    const clampedFactor = Math.max(MIN_FACTOR, Math.min(MAX_FACTOR, blended));
    rows.push({
      sport,
      market: null,
      sample_size: n,
      predicted_prob_avg: Math.round(predictedAvg * 10000) / 10000,
      actual_hit_rate: Math.round(actualRate * 10000) / 10000,
      calibration_factor: Math.round(clampedFactor * 10000) / 10000,
      notes:
        trust < 1
          ? `Shrunk: raw=${rawFactor.toFixed(3)} (trust ${(trust * 100).toFixed(0)}%)`
          : `Full trust (n=${n})`,
    });
  }

  if (rows.length === 0) {
    return NextResponse.json({
      resolved: allParlays.length,
      written: 0,
      message: "no buckets met sample threshold",
    });
  }

  const { error: insertErr } = await supabase
    .from("model_calibration")
    .insert(rows);
  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  return NextResponse.json({
    resolved: allParlays.length,
    written: rows.length,
    rows,
    timestamp: new Date().toISOString(),
  });
}
