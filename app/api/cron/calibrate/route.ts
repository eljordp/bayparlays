import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// v2 calibration — runs daily via GitHub Actions / Vercel Cron.
//
// Operates at the LEG level when leg_results is available. For each graded
// leg we know the sport, market, decimal odds, and outcome, so we can bucket
// (sport × market × odds_bucket) and learn that e.g. NBA spreads at the
// "pick" bucket hit 68% while NBA moneylines at "long" bucket hit 22%.
//
// Falls back to the v1 parlay-level computation for historical rows that
// don't have leg_results yet — those still feed the per-sport cascade.

const MIN_SAMPLE = 25;
const FULL_TRUST_AT = 100;
const MIN_FACTOR = 0.6;
const MAX_FACTOR = 1.4;

interface ResolvedParlay {
  status: "won" | "lost";
  combined_decimal: number;
  ev_percent: number | null;
  sports: string[] | null;
  legs: Array<{ sport?: string; market?: string; odds?: number; decimalOdds?: number }> | null;
  leg_results: Array<{
    sport?: string | null;
    market?: string | null;
    odds?: number | null;
    decimalOdds?: number | null;
    result: "won" | "lost" | "pending";
  }> | null;
}

// Decimal-odds buckets — kept narrow enough that each bucket represents a
// coherent bet type (heavy favorites behave nothing like longshots, even
// inside the same sport/market).
function oddsBucket(decimal: number): string | null {
  if (!isFinite(decimal) || decimal <= 1) return null;
  if (decimal <= 1.5) return "heavy_fav";
  if (decimal <= 1.91) return "fav";
  if (decimal <= 2.1) return "pick";
  if (decimal <= 3.0) return "dog";
  if (decimal <= 6.0) return "long";
  return "moon";
}

function americanToDecimal(odds: number): number {
  if (odds >= 0) return 1 + odds / 100;
  return 1 + 100 / Math.abs(odds);
}

interface Bucket {
  predicted: number[];
  actual: number[];
}

interface CalibRow {
  sport: string | null;
  market: string | null;
  odds_bucket: string | null;
  sample_size: number;
  predicted_prob_avg: number;
  actual_hit_rate: number;
  calibration_factor: number;
  notes: string;
}

function shrinkAndClamp(predictedAvg: number, actualRate: number, n: number) {
  const rawFactor = predictedAvg > 0 ? actualRate / predictedAvg : 1;
  const trust = Math.min(1, n / FULL_TRUST_AT);
  const blended = 1 + (rawFactor - 1) * trust;
  const clamped = Math.max(MIN_FACTOR, Math.min(MAX_FACTOR, blended));
  return {
    rawFactor,
    trust,
    factor: clamped,
    notes:
      trust < 1
        ? `Shrunk: raw=${rawFactor.toFixed(3)} (trust ${(trust * 100).toFixed(0)}%)`
        : `Full trust (n=${n})`,
  };
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
  const allParlays: ResolvedParlay[] = [];
  for (const tableName of ["parlays", "research_parlays"] as const) {
    let from = 0;
    const PAGE = 1000;
    while (true) {
      const { data, error } = await supabase
        .from(tableName)
        .select("status, combined_decimal, ev_percent, sports, legs, leg_results")
        .neq("status", "pending")
        .range(from, from + PAGE - 1);
      if (error) {
        // leg_results may not exist yet on older deploys — retry without it.
        if (/column .*leg_results/i.test(error.message || "")) {
          const { data: fallback, error: fallbackErr } = await supabase
            .from(tableName)
            .select("status, combined_decimal, ev_percent, sports, legs")
            .neq("status", "pending")
            .range(from, from + PAGE - 1);
          if (fallbackErr) {
            return NextResponse.json(
              { error: `${tableName}: ${fallbackErr.message}` },
              { status: 500 },
            );
          }
          if (!fallback || fallback.length === 0) break;
          allParlays.push(...(fallback as ResolvedParlay[]));
          if (fallback.length < PAGE) break;
          from += PAGE;
          continue;
        }
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

  // ── v1 buckets: parlay-level by sport (kept for back-compat) ──────────
  const parlaySportGroups = new Map<string | null, Bucket>();
  parlaySportGroups.set(null, { predicted: [], actual: [] });

  // ── v2 buckets: leg-level by (sport, market, odds_bucket) ─────────────
  // Key format: `${sport}|${market}|${bucket}` (also intermediate keys with
  // null components for less-specific cells).
  const legBuckets = new Map<string, Bucket>();

  // ── Stats for the response payload ────────────────────────────────────
  let legsGraded = 0;
  let legsSkipped = 0;

  for (const p of allParlays) {
    if (!p.combined_decimal || p.combined_decimal <= 1) continue;

    // v1: parlay-level signal
    const bookImpliedProb = 1 / p.combined_decimal;
    const aiPredictedProb = bookImpliedProb * (1 + (p.ev_percent ?? 0) / 100);
    const clamped = Math.max(0.01, Math.min(0.99, aiPredictedProb));
    const actual = p.status === "won" ? 1 : 0;

    parlaySportGroups.get(null)!.predicted.push(clamped);
    parlaySportGroups.get(null)!.actual.push(actual);

    const sport = p.sports?.[0] ?? p.legs?.[0]?.sport ?? null;
    if (sport) {
      if (!parlaySportGroups.has(sport)) parlaySportGroups.set(sport, { predicted: [], actual: [] });
      parlaySportGroups.get(sport)!.predicted.push(clamped);
      parlaySportGroups.get(sport)!.actual.push(actual);
    }

    // v2: leg-level signal — only available when leg_results was populated
    // by the resolver. For each leg, we know its outcome; use the leg's
    // implied probability (1 / decimalOdds) as the "predicted" value since
    // that's the closest comparable signal for individual legs (the parlay
    // route then scales ourProb by the resulting calibration factor).
    if (Array.isArray(p.leg_results) && p.leg_results.length > 0) {
      for (const lr of p.leg_results) {
        if (lr.result !== "won" && lr.result !== "lost") {
          legsSkipped++;
          continue;
        }
        const dec =
          typeof lr.decimalOdds === "number" && lr.decimalOdds > 1
            ? lr.decimalOdds
            : typeof lr.odds === "number"
              ? americanToDecimal(lr.odds)
              : null;
        if (!dec || dec <= 1) {
          legsSkipped++;
          continue;
        }
        const legSport = lr.sport ?? null;
        const legMarket = lr.market ?? null;
        const bucket = oddsBucket(dec);
        const legImplied = Math.max(0.01, Math.min(0.99, 1 / dec));
        const legActual = lr.result === "won" ? 1 : 0;
        legsGraded++;

        // Insert into every applicable bucket key so the cascade in
        // /api/parlays can fall back from most-specific to general.
        const keys = new Set<string>();
        if (legSport && legMarket && bucket) keys.add(`${legSport}|${legMarket}|${bucket}`);
        if (legSport && legMarket) keys.add(`${legSport}|${legMarket}|`);
        if (legSport && bucket) keys.add(`${legSport}||${bucket}`);
        if (bucket) keys.add(`||${bucket}`);

        for (const k of keys) {
          if (!legBuckets.has(k)) legBuckets.set(k, { predicted: [], actual: [] });
          legBuckets.get(k)!.predicted.push(legImplied);
          legBuckets.get(k)!.actual.push(legActual);
        }
      }
    }
  }

  const rows: CalibRow[] = [];

  // ── Build v1 parlay-level rows ──────────────────────────────────────────
  for (const [sport, { predicted, actual }] of parlaySportGroups) {
    const n = predicted.length;
    if (n < MIN_SAMPLE) continue;
    const predictedAvg = predicted.reduce((s, v) => s + v, 0) / n;
    const actualRate = actual.reduce((s, v) => s + v, 0) / n;
    const { factor, notes } = shrinkAndClamp(predictedAvg, actualRate, n);
    rows.push({
      sport,
      market: null,
      odds_bucket: null,
      sample_size: n,
      predicted_prob_avg: Math.round(predictedAvg * 10000) / 10000,
      actual_hit_rate: Math.round(actualRate * 10000) / 10000,
      calibration_factor: Math.round(factor * 10000) / 10000,
      notes: `parlay-level | ${notes}`,
    });
  }

  // ── Build v2 leg-level rows ─────────────────────────────────────────────
  for (const [key, { predicted, actual }] of legBuckets) {
    const n = predicted.length;
    if (n < MIN_SAMPLE) continue;
    const [sportPart, marketPart, bucketPart] = key.split("|");
    const predictedAvg = predicted.reduce((s, v) => s + v, 0) / n;
    const actualRate = actual.reduce((s, v) => s + v, 0) / n;
    const { factor, notes } = shrinkAndClamp(predictedAvg, actualRate, n);
    rows.push({
      sport: sportPart || null,
      market: marketPart || null,
      odds_bucket: bucketPart || null,
      sample_size: n,
      predicted_prob_avg: Math.round(predictedAvg * 10000) / 10000,
      actual_hit_rate: Math.round(actualRate * 10000) / 10000,
      calibration_factor: Math.round(factor * 10000) / 10000,
      notes: `leg-level | ${notes}`,
    });
  }

  if (rows.length === 0) {
    return NextResponse.json({
      resolved: allParlays.length,
      legs_graded: legsGraded,
      legs_skipped: legsSkipped,
      written: 0,
      message: "no buckets met sample threshold",
    });
  }

  // Some installs don't have odds_bucket migrated yet — try with it first,
  // fall back to the v1 columns if the column is missing.
  let insertErr: { message: string } | null = null;
  {
    const { error } = await supabase.from("model_calibration").insert(rows);
    insertErr = error;
  }
  if (insertErr && /column .*odds_bucket/i.test(insertErr.message || "")) {
    const v1Rows = rows
      .filter((r) => r.odds_bucket === null)
      .map((r) => {
        const copy = { ...r } as Partial<CalibRow>;
        delete copy.odds_bucket;
        return copy;
      });
    const { error: retryErr } = await supabase.from("model_calibration").insert(v1Rows);
    insertErr = retryErr;
  }
  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  return NextResponse.json({
    resolved: allParlays.length,
    legs_graded: legsGraded,
    legs_skipped: legsSkipped,
    written: rows.length,
    rows,
    timestamp: new Date().toISOString(),
  });
}
