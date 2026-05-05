import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  fitLogReg,
  extractFeatures,
  MODEL_VERSION,
  type TrainSample,
} from "@/lib/ml-inference";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Nightly training of the per-leg logistic regression. Pulls every graded
// leg with known features + outcome, fits a fresh model, persists weights.
// /api/parlays loads the most recent row of the current MODEL_VERSION at
// generation time. Old rows are kept for audit / rollback.

// Below this the model is memorizing rather than generalizing. Bumped
// 200 → 300 (2026-05-03) — with ~25 features one-hot encoded, the
// rule-of-thumb is ≥10 samples per feature for stable logistic
// regression weights. 300 keeps us safely on the right side of that.
const MIN_TRAIN_SIZE = 300;

interface ParlayRow {
  legs: Array<{
    sport?: string;
    market?: string;
    odds?: number;
    decimalOdds?: number;
    pick?: string;
    gameId?: string;
    ourProb?: number;
    fairProb?: number;
    evVsFair?: number;
    bookCount?: number;
    sharpEdge?: boolean;
    weatherNote?: string | null;
    pitcherNote?: string | null;
    injuryNote?: string | null;
    restNote?: string | null;
    scored?: boolean;
  }> | null;
  leg_results: Array<{
    gameId?: string | null;
    market?: string | null;
    pick?: string | null;
    sport?: string | null;
    result: "won" | "lost" | "pending";
  }> | null;
}

function americanToDecimal(odds: number): number {
  if (odds >= 0) return 1 + odds / 100;
  return 1 + 100 / Math.abs(odds);
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

  // Pull resolved parlays from BOTH the AI's daily picks and the brute-force
  // research scanner. Research adds a layer of selection-bias correction
  // since it surfaces combos the daily picker would never have chosen.
  const allRows: ParlayRow[] = [];
  for (const tableName of ["parlays", "research_parlays"] as const) {
    let from = 0;
    const PAGE = 1000;
    while (true) {
      const { data, error } = await supabase
        .from(tableName)
        .select("legs, leg_results")
        .neq("status", "pending")
        .range(from, from + PAGE - 1);
      if (error) {
        return NextResponse.json(
          { error: `${tableName}: ${error.message}` },
          { status: 500 },
        );
      }
      if (!data || data.length === 0) break;
      allRows.push(...(data as unknown as ParlayRow[]));
      if (data.length < PAGE) break;
      from += PAGE;
    }
  }

  // Build training samples by joining legs[] to leg_results[] on
  // (gameId, market, pick). Only legs with both a feature vector AND a
  // resolved outcome become samples — pending or unmatchable legs skip.
  const samples: TrainSample[] = [];
  let parlaysScanned = 0;
  let legsMatched = 0;
  let legsSkippedNoMatch = 0;

  for (const row of allRows) {
    parlaysScanned++;
    if (!Array.isArray(row.legs) || !Array.isArray(row.leg_results)) continue;
    const resultByKey = new Map<string, "won" | "lost">();
    for (const lr of row.leg_results) {
      if (lr.result !== "won" && lr.result !== "lost") continue;
      if (!lr.gameId || !lr.market || !lr.pick) continue;
      resultByKey.set(`${lr.gameId}|${lr.market}|${lr.pick}`, lr.result);
    }
    for (const leg of row.legs) {
      if (!leg.gameId || !leg.market || !leg.pick) continue;
      const result = resultByKey.get(`${leg.gameId}|${leg.market}|${leg.pick}`);
      if (!result) {
        legsSkippedNoMatch++;
        continue;
      }
      // Recover decimalOdds if only American odds was stored on the leg.
      const dec =
        typeof leg.decimalOdds === "number" && leg.decimalOdds > 1
          ? leg.decimalOdds
          : typeof leg.odds === "number"
            ? americanToDecimal(leg.odds)
            : undefined;
      const features = extractFeatures({
        sport: leg.sport,
        market: leg.market,
        decimalOdds: dec,
        ourProb: leg.ourProb,
        fairProb: leg.fairProb,
        evVsFair: leg.evVsFair,
        bookCount: leg.bookCount,
        sharpEdge: leg.sharpEdge,
        hasWeatherNote: !!leg.weatherNote,
        hasPitcherNote: !!leg.pitcherNote,
        hasInjuryNote: !!leg.injuryNote,
        hasRestNote: !!leg.restNote,
        scored: leg.scored,
        // sharpLeanForPick was added 2026-05-04. Old graded legs don't
        // have it stored on parlays.legs jsonb (the field didn't exist
        // when they were inserted), so for historical samples this is
        // undefined → defaults to 0 in extractFeatures → no influence.
        // New parlays generated post-deploy will have the value
        // populated and the model picks up the signal as it retrains.
        sharpLeanForPick: (leg as { sharpLeanForPick?: number }).sharpLeanForPick,
      });
      legsMatched++;
      samples.push({
        features,
        label: result === "won" ? 1 : 0,
      });
    }
  }

  if (samples.length < MIN_TRAIN_SIZE) {
    return NextResponse.json({
      model_version: MODEL_VERSION,
      parlays_scanned: parlaysScanned,
      legs_matched: legsMatched,
      legs_skipped_no_match: legsSkippedNoMatch,
      training_size: samples.length,
      written: 0,
      message: `Need at least ${MIN_TRAIN_SIZE} graded legs to train; have ${samples.length}.`,
    });
  }

  // Fit. Logistic regression on a few thousand samples runs in well
  // under the 60s timeout — gradient descent loops are tight TS, no
  // I/O inside the hot path.
  const result = fitLogReg(samples);

  const insertPayload = {
    model_version: MODEL_VERSION,
    training_size: samples.length,
    train_loss: Math.round(result.trainLoss * 1e6) / 1e6,
    val_loss: Math.round(result.valLoss * 1e6) / 1e6,
    weights: {
      intercept: result.intercept,
      weights: result.weights,
      feature_means: result.feature_means,
      feature_stds: result.feature_stds,
      feature_order: result.feature_order,
    },
    notes: `LR=0.05 L2=0.01 epochs=${result.epochsRun}/2000`,
  };

  const { error: insertErr } = await supabase
    .from("model_weights")
    .insert(insertPayload);
  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  // Compute a couple of summary signals so the cron's response is useful
  // for logs / GH Actions: the top positive + negative weights reveal
  // which features the model thinks matter most this run.
  const sortedByMagnitude = Object.entries(result.weights)
    .filter(([, w]) => Number.isFinite(w))
    .sort(([, a], [, b]) => Math.abs(b) - Math.abs(a))
    .slice(0, 8);

  return NextResponse.json({
    model_version: MODEL_VERSION,
    parlays_scanned: parlaysScanned,
    legs_matched: legsMatched,
    legs_skipped_no_match: legsSkippedNoMatch,
    training_size: samples.length,
    train_loss: insertPayload.train_loss,
    val_loss: insertPayload.val_loss,
    epochs_run: result.epochsRun,
    top_features: sortedByMagnitude,
    written: 1,
    timestamp: new Date().toISOString(),
  });
}
