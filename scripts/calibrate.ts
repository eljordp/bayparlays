// ─── Model Calibration ─────────────────────────────────────────────────────
//
// The actual learning loop. Reads every resolved parlay, computes how well
// the AI's predicted probability matched the actual outcome, and writes
// per-sport calibration factors to model_calibration. /api/parlays reads
// the latest factors and scales its combinedProb estimate accordingly so
// future picks are gradually corrected.
//
// What "calibration" means here:
//   AI predicts a parlay hits 30% of the time.
//   100 such parlays resolve, 22 actually hit (22%).
//   AI is over-confident by 22/30 = 0.733x.
//   Going forward, multiply AI's combinedProb by 0.733 for that sport.
//
// Bayesian shrinkage: with <100 resolved bets, the calibration factor
// gets pulled toward 1.0 (no adjustment). At 100+ it applies fully.
// Prevents 5-bet flukes from yanking the model around.
//
// Run locally: npx tsx scripts/calibrate.ts
// Run via API: GET /api/cron/calibrate (auth: Bearer $CRON_SECRET)
// Run via cron: see .github/workflows/calibrate.yml

import { createClient } from "@supabase/supabase-js";

interface ResolvedParlay {
  id: string;
  status: "won" | "lost";
  combined_decimal: number;
  ev_percent: number | null;
  sports: string[] | null;
  legs: Array<{ sport?: string; market?: string }> | null;
}

interface CalibrationRow {
  sport: string | null;
  market: string | null;
  sample_size: number;
  predicted_prob_avg: number;
  actual_hit_rate: number;
  calibration_factor: number;
  notes: string | null;
}

// Minimum sample to compute a calibration row at all. Below this we skip
// (don't even insert) so the lookup falls back to a broader scope.
const MIN_SAMPLE = 25;

// Bayesian shrinkage: full effect at this sample size, scales down linearly
// below it. With 50 resolved bets, factor moves halfway from 1.0 toward the
// raw measurement.
const FULL_TRUST_AT = 100;

// Hard clamp on the calibration factor. The model can be wrong, but a 3x
// adjustment from 50 bets is almost certainly noise. Keep adjustments
// bounded so a single bad week can't break the picks generator.
const MIN_FACTOR = 0.6;
const MAX_FACTOR = 1.4;

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing Supabase env vars");
  }
  const supabase = createClient(url, key);

  // Pull resolved parlays from BOTH tables. parlays = AI's full track record;
  // sim_parlays = what users actually placed. Both are valid signal — combining
  // gives us more sample. (Sim users may have selected a biased subset, but
  // parlay-level outcomes are what we care about.)
  const allParlays: ResolvedParlay[] = [];

  for (const tableName of ["parlays", "sim_parlays"] as const) {
    let from = 0;
    const PAGE = 1000;
    while (true) {
      const { data, error } = await supabase
        .from(tableName)
        .select("id, status, combined_decimal, ev_percent, sports, legs")
        .neq("status", "pending")
        .range(from, from + PAGE - 1);
      if (error) {
        throw new Error(`${tableName}: ${error.message}`);
      }
      if (!data || data.length === 0) break;
      allParlays.push(...(data as ResolvedParlay[]));
      if (data.length < PAGE) break;
      from += PAGE;
    }
  }

  console.log(`Loaded ${allParlays.length} resolved parlays.`);

  if (allParlays.length === 0) {
    console.log("No resolved parlays to calibrate against. Exiting.");
    return;
  }

  // Group by primary sport. Primary sport = first leg's sport (matches how
  // sportBreakdown attributes parlays in /api/track/results).
  type Bucket = { predicted: number[]; actual: number[] };
  const groups = new Map<string | null, Bucket>();
  groups.set(null, { predicted: [], actual: [] }); // global

  for (const p of allParlays) {
    if (!p.combined_decimal || p.combined_decimal <= 1) continue;

    // AI's predicted probability of this parlay hitting.
    // Book-implied = 1 / decimal_odds.
    // AI's adjustment = (1 + ev_percent/100). Positive EV means AI thinks
    // the true prob is higher than the book's implied prob.
    const bookImpliedProb = 1 / p.combined_decimal;
    const aiPredictedProb =
      bookImpliedProb * (1 + (p.ev_percent ?? 0) / 100);
    const clampedPredicted = Math.max(0.01, Math.min(0.99, aiPredictedProb));

    const actual = p.status === "won" ? 1 : 0;

    // Always include in global bucket
    groups.get(null)!.predicted.push(clampedPredicted);
    groups.get(null)!.actual.push(actual);

    // Sport-specific bucket
    const sport = p.sports?.[0] ?? p.legs?.[0]?.sport ?? null;
    if (sport) {
      if (!groups.has(sport)) {
        groups.set(sport, { predicted: [], actual: [] });
      }
      groups.get(sport)!.predicted.push(clampedPredicted);
      groups.get(sport)!.actual.push(actual);
    }
  }

  const rows: CalibrationRow[] = [];

  for (const [sport, { predicted, actual }] of groups) {
    const n = predicted.length;
    if (n < MIN_SAMPLE) {
      console.log(
        `  Skipping ${sport ?? "GLOBAL"}: only ${n} resolved (need ≥${MIN_SAMPLE})`,
      );
      continue;
    }

    const predictedAvg = predicted.reduce((s, v) => s + v, 0) / n;
    const actualRate = actual.reduce((s, v) => s + v, 0) / n;

    // Raw calibration factor — what we'd apply if we had infinite data.
    const rawFactor = predictedAvg > 0 ? actualRate / predictedAvg : 1;

    // Shrinkage: blend toward 1.0 (no adjustment) when sample is small.
    // At n=FULL_TRUST_AT we use the raw factor; at n=0 we'd use 1.0.
    const trust = Math.min(1, n / FULL_TRUST_AT);
    const blended = 1 + (rawFactor - 1) * trust;
    const clamped = Math.max(MIN_FACTOR, Math.min(MAX_FACTOR, blended));

    const notes =
      trust < 1
        ? `Shrunk: raw=${rawFactor.toFixed(3)} blended=${clamped.toFixed(3)} (n=${n}, trust=${(trust * 100).toFixed(0)}%)`
        : `Full trust (n=${n})`;

    rows.push({
      sport,
      market: null,
      sample_size: n,
      predicted_prob_avg: Math.round(predictedAvg * 10000) / 10000,
      actual_hit_rate: Math.round(actualRate * 10000) / 10000,
      calibration_factor: Math.round(clamped * 10000) / 10000,
      notes,
    });

    console.log(
      `  ${sport ?? "GLOBAL"}: n=${n}, predicted=${(predictedAvg * 100).toFixed(1)}%, actual=${(actualRate * 100).toFixed(1)}%, factor=${clamped.toFixed(3)}`,
    );
  }

  if (rows.length === 0) {
    console.log("No calibration rows met the sample threshold. Exiting.");
    return;
  }

  const { error: insertErr } = await supabase
    .from("model_calibration")
    .insert(rows);
  if (insertErr) {
    throw new Error(`Insert failed: ${insertErr.message}`);
  }

  console.log(`\n✅ Wrote ${rows.length} calibration rows.`);
}

main().catch((e) => {
  console.error("Calibration failed:", e);
  process.exit(1);
});
