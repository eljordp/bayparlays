// ─── Model Calibration ─────────────────────────────────────────────────────
//
// The learning loop. Reads every resolved parlay, computes how well the
// AI's predicted probability matched the actual outcome, and writes
// per-(sport, market) calibration factors to model_calibration. /api/parlays
// reads the latest factors and scales each leg's ourProb accordingly so
// future picks are gradually corrected.
//
// Three calibration scopes (lookup falls back from most-specific to general):
//   1. (sport, market) — e.g. NBA spreads vs NBA moneylines have very
//      different hit rates; one blanket NBA factor punishes good markets to
//      compensate for bad ones.
//   2. (sport, null) — fallback when a market lacks sample.
//   3. (null, null) — global fallback.
//
// Known limitation — parlay-level outcome attribution: a 3-leg parlay that
// loses because of ONE bad leg attributes "lost" to all 3 legs. So a market
// where individual legs hit 68% can show up as 10% at parlay level if those
// legs are co-occurring with other bad legs. The directional signal is still
// useful, but for precise market factors, leg-level grading against final
// scores is the right approach. Specific NBA factors were back-filled from
// leg-level ESPN grading; the script-generated rows for those keys are
// noisier and superseded by the manually-written ones (newer computed_at).
//
// Bayesian shrinkage: with <100 resolved bets, the calibration factor
// gets pulled toward 1.0 (no adjustment). At 100+ it applies fully.
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
  leg_results: boolean[] | null; // per-leg outcomes when score-check graded individually
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

  // Per-table column lists — sim_parlays is missing ev_percent and sports.
  // Calibration falls back to combined_decimal alone for those rows, which
  // gives a slightly less-accurate predicted probability but still valid signal.
  // leg_results: pulled when present so calibrate can attribute outcomes per-leg
  // instead of attributing parlay outcome to all legs.
  const tableSelects: Record<string, string> = {
    parlays: "id, status, combined_decimal, ev_percent, sports, legs, leg_results",
    sim_parlays: "id, status, combined_decimal, legs, leg_results",
  };

  for (const tableName of Object.keys(tableSelects)) {
    let from = 0;
    const PAGE = 1000;
    while (true) {
      const { data, error } = await supabase
        .from(tableName)
        .select(tableSelects[tableName])
        .neq("status", "pending")
        .range(from, from + PAGE - 1);
      if (error) {
        console.warn(`  ${tableName}: ${error.message} — skipping`);
        break;
      }
      if (!data || data.length === 0) break;
      allParlays.push(...(data as unknown as ResolvedParlay[]));
      if (data.length < PAGE) break;
      from += PAGE;
    }
  }

  console.log(`Loaded ${allParlays.length} resolved parlays.`);

  if (allParlays.length === 0) {
    console.log("No resolved parlays to calibrate against. Exiting.");
    return;
  }

  // Three calibration scopes — most-specific wins at lookup time:
  //   1. (sport, market) — e.g. NBA spreads vs NBA totals can have very
  //      different hit rates; one blanket NBA factor punishes the good market
  //      to compensate for the bad one.
  //   2. (sport, null)   — fallback when a market lacks sample.
  //   3. (null, null)    — global fallback.
  type Bucket = { predicted: number[]; actual: number[] };
  type Key = { sport: string | null; market: string | null };
  const keyId = (k: Key) => `${k.sport ?? ""}|${k.market ?? ""}`;
  const groups = new Map<string, { key: Key; bucket: Bucket }>();
  const ensure = (k: Key) => {
    const id = keyId(k);
    if (!groups.has(id)) {
      groups.set(id, { key: k, bucket: { predicted: [], actual: [] } });
    }
    return groups.get(id)!.bucket;
  };

  // Calibration is at the LEG level. Two attribution strategies:
  //
  // 1. CLEAN ATTRIBUTION — used when leg_results is present (per-leg ground
  //    truth from score-check) OR when the parlay is "homogeneous" (every
  //    leg shares the same sport+market). In those cases each leg's outcome
  //    is unambiguous and we can write per-(sport, market) calibration rows.
  //
  // 2. NOISY ATTRIBUTION — used for older mixed parlays without leg_results.
  //    Falls back to (sport, null) and (null, null) only. Skipping per-market
  //    here so we don't pollute market factors with cross-market noise.
  //
  // Net effect: as score-check fills leg_results going forward, per-market
  // factors get more accurate. Old data still contributes via per-sport rows.
  for (const p of allParlays) {
    if (!p.combined_decimal || p.combined_decimal <= 1) continue;
    if (!p.legs || p.legs.length === 0) continue;

    const parlayActual = p.status === "won" ? 1 : 0;
    const bookImpliedProb = 1 / p.combined_decimal;
    const aiPredictedProb =
      bookImpliedProb * (1 + (p.ev_percent ?? 0) / 100);
    // Approximate per-leg prob: parlay prob = product(leg_probs). If all legs
    // have the same prob p, then p = parlay^(1/n). Rough but unbiased.
    const legPredicted = Math.max(
      0.01,
      Math.min(0.99, Math.pow(aiPredictedProb, 1 / p.legs.length)),
    );

    // Global bucket (parlay-level — keeps the original signal intact)
    const globalBucket = ensure({ sport: null, market: null });
    globalBucket.predicted.push(Math.max(0.01, Math.min(0.99, aiPredictedProb)));
    globalBucket.actual.push(parlayActual);

    // Detect homogeneity: every leg has the same sport+market combo
    const firstLeg = p.legs[0];
    const isHomogeneous =
      firstLeg.sport != null &&
      firstLeg.market != null &&
      p.legs.every(
        (l) => l.sport === firstLeg.sport && l.market === firstLeg.market,
      );

    const hasLegResults =
      Array.isArray(p.leg_results) &&
      p.leg_results.length === p.legs.length;

    for (let i = 0; i < p.legs.length; i++) {
      const leg = p.legs[i];
      const sport = leg.sport ?? null;
      const market = leg.market ?? null;
      if (!sport) continue;

      // Per-leg observed outcome:
      //   - leg_results[i] when populated (1 / 0)
      //   - parlay outcome when homogeneous (clean attribution)
      //   - parlay outcome but only feed (sport, null) bucket otherwise
      let legActual: number;
      let canWriteMarket = false;

      if (hasLegResults) {
        const r = (p.leg_results as boolean[])[i];
        legActual = r ? 1 : 0;
        canWriteMarket = market != null;
      } else if (isHomogeneous) {
        legActual = parlayActual;
        canWriteMarket = market != null;
      } else {
        legActual = parlayActual;
        canWriteMarket = false;
      }

      // (sport, null) — every leg contributes here
      ensure({ sport, market: null }).predicted.push(legPredicted);
      ensure({ sport, market: null }).actual.push(legActual);

      // (sport, market) — only when attribution is clean
      if (canWriteMarket && market) {
        ensure({ sport, market }).predicted.push(legPredicted);
        ensure({ sport, market }).actual.push(legActual);
      }
    }
  }

  const rows: CalibrationRow[] = [];

  for (const { key, bucket } of groups.values()) {
    const { predicted, actual } = bucket;
    const n = predicted.length;
    const label = key.sport
      ? key.market
        ? `${key.sport} ${key.market}`
        : key.sport
      : "GLOBAL";
    if (n < MIN_SAMPLE) {
      console.log(`  Skipping ${label}: only ${n} resolved (need ≥${MIN_SAMPLE})`);
      continue;
    }

    const predictedAvg = predicted.reduce((s, v) => s + v, 0) / n;
    const actualRate = actual.reduce((s, v) => s + v, 0) / n;

    // Raw calibration factor — what we'd apply if we had infinite data.
    const rawFactor = predictedAvg > 0 ? actualRate / predictedAvg : 1;

    // Shrinkage: blend toward 1.0 (no adjustment) when sample is small.
    const trust = Math.min(1, n / FULL_TRUST_AT);
    const blended = 1 + (rawFactor - 1) * trust;
    const clamped = Math.max(MIN_FACTOR, Math.min(MAX_FACTOR, blended));

    const notes =
      trust < 1
        ? `Shrunk: raw=${rawFactor.toFixed(3)} blended=${clamped.toFixed(3)} (n=${n}, trust=${(trust * 100).toFixed(0)}%)`
        : `Full trust (n=${n})`;

    rows.push({
      sport: key.sport,
      market: key.market,
      sample_size: n,
      predicted_prob_avg: Math.round(predictedAvg * 10000) / 10000,
      actual_hit_rate: Math.round(actualRate * 10000) / 10000,
      calibration_factor: Math.round(clamped * 10000) / 10000,
      notes,
    });

    console.log(
      `  ${label}: n=${n}, predicted=${(predictedAvg * 100).toFixed(1)}%, actual=${(actualRate * 100).toFixed(1)}%, factor=${clamped.toFixed(3)}`,
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
