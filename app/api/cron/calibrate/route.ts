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
  created_at?: string;
  legs: Array<{
    sport?: string;
    market?: string;
    odds?: number;
    decimalOdds?: number;
    pick?: string;
    gameId?: string;
  }> | null;
  leg_results: Array<{
    sport?: string | null;
    market?: string | null;
    odds?: number | null;
    decimalOdds?: number | null;
    result: "won" | "lost" | "pending";
  }> | null;
  closing_lines: Array<{
    gameId: string | null;
    market: string | null;
    pick: string | null;
    closingOdds: number | null;
    clv: number | null;
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

// Separate CLV bucket — sourced from closing_lines, scoped to a rolling
// window so old data doesn't keep dead buckets alive.
interface ClvBucket {
  values: number[];
}

const CLV_WINDOW_DAYS = 60;

interface CalibRow {
  sport: string | null;
  market: string | null;
  odds_bucket: string | null;
  sample_size: number;
  predicted_prob_avg: number;
  actual_hit_rate: number;
  calibration_factor: number;
  notes: string;
  avg_clv: number | null;
  clv_sample: number | null;
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
  // Try the full v2-aware select first; if any column is missing on a stale
  // deploy, drop columns one tier at a time until something works.
  const SELECTS = [
    "status, combined_decimal, ev_percent, sports, legs, leg_results, closing_lines, created_at",
    "status, combined_decimal, ev_percent, sports, legs, leg_results, created_at",
    "status, combined_decimal, ev_percent, sports, legs",
  ];

  for (const tableName of ["parlays", "research_parlays"] as const) {
    let from = 0;
    const PAGE = 1000;
    let select = SELECTS[0];
    while (true) {
      const { data, error } = await supabase
        .from(tableName)
        .select(select)
        .neq("status", "pending")
        .range(from, from + PAGE - 1);
      if (error) {
        // Walk the fallback ladder: if a column is missing, try the next
        // narrower select. Once we exhaust SELECTS, surface the error.
        if (/column .*(closing_lines|leg_results|created_at)/i.test(error.message || "")) {
          const idx = SELECTS.indexOf(select);
          if (idx >= 0 && idx < SELECTS.length - 1) {
            select = SELECTS[idx + 1];
            continue;
          }
        }
        return NextResponse.json(
          { error: `${tableName}: ${error.message}` },
          { status: 500 },
        );
      }
      if (!data || data.length === 0) break;
      allParlays.push(...(data as unknown as ResolvedParlay[]));
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

  // ── CLV buckets (rolling 60d) ─────────────────────────────────────────
  // Same key scheme as legBuckets so they map 1:1 onto calibration rows.
  // Sourced from parlays.closing_lines (populated when the resolver grades),
  // matched back to parlays.legs to recover sport / market / odds bucket.
  const clvBuckets = new Map<string, ClvBucket>();
  const clvCutoff = Date.now() - CLV_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  let clvLegsCounted = 0;

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

    // CLV gate buckets — only consume parlays inside the rolling window so
    // a bucket that's faded recently doesn't keep coasting on stale wins.
    if (Array.isArray(p.closing_lines) && Array.isArray(p.legs) && p.created_at) {
      const createdMs = Date.parse(p.created_at);
      if (!isFinite(createdMs) || createdMs < clvCutoff) {
        // Outside the rolling window — skip CLV contribution but still feed
        // hit-rate calibration above (older outcomes still inform that).
      } else {
        // Match closing lines to their legs by (gameId, market, pick) so we
        // recover sport + decimal odds for bucketing. Closing lines without
        // a matching leg are skipped (rare; usually means a leg was edited).
        const legByKey = new Map<string, NonNullable<ResolvedParlay["legs"]>[number]>();
        for (const leg of p.legs) {
          if (!leg.gameId || !leg.market || !leg.pick) continue;
          legByKey.set(`${leg.gameId}|${leg.market}|${leg.pick}`, leg);
        }
        for (const cl of p.closing_lines) {
          if (cl.clv === null || typeof cl.clv !== "number") continue;
          if (!cl.gameId || !cl.market || !cl.pick) continue;
          const leg = legByKey.get(`${cl.gameId}|${cl.market}|${cl.pick}`);
          if (!leg) continue;
          const dec =
            typeof leg.decimalOdds === "number" && leg.decimalOdds > 1
              ? leg.decimalOdds
              : typeof leg.odds === "number"
                ? americanToDecimal(leg.odds)
                : null;
          const bucket = dec ? oddsBucket(dec) : null;
          const legSport = leg.sport ?? null;
          const legMarket = leg.market ?? null;

          const keys = new Set<string>();
          if (legSport && legMarket && bucket) keys.add(`${legSport}|${legMarket}|${bucket}`);
          if (legSport && legMarket) keys.add(`${legSport}|${legMarket}|`);
          if (legSport && bucket) keys.add(`${legSport}||${bucket}`);
          if (bucket) keys.add(`||${bucket}`);
          if (keys.size === 0) continue;

          clvLegsCounted++;
          for (const k of keys) {
            if (!clvBuckets.has(k)) clvBuckets.set(k, { values: [] });
            clvBuckets.get(k)!.values.push(cl.clv);
          }
        }
      }
    }
  }

  // Helper: pull avg/sample from clvBuckets at a given key, or null if missing.
  function clvFor(key: string): { avg: number; sample: number } | null {
    const b = clvBuckets.get(key);
    if (!b || b.values.length === 0) return null;
    const sum = b.values.reduce((s, v) => s + v, 0);
    return {
      avg: Math.round((sum / b.values.length) * 100) / 100,
      sample: b.values.length,
    };
  }

  const rows: CalibRow[] = [];

  // ── Build v1 parlay-level rows ──────────────────────────────────────────
  for (const [sport, { predicted, actual }] of parlaySportGroups) {
    const n = predicted.length;
    if (n < MIN_SAMPLE) continue;
    const predictedAvg = predicted.reduce((s, v) => s + v, 0) / n;
    const actualRate = actual.reduce((s, v) => s + v, 0) / n;
    const { factor, notes } = shrinkAndClamp(predictedAvg, actualRate, n);
    // Parlay-level CLV uses the sport-only bucket; reuses the leg-level CLV
    // accumulator so we don't double-count or recompute.
    const clvKey = sport ? sport : "";
    const clv = clvFor(clvKey);
    rows.push({
      sport,
      market: null,
      odds_bucket: null,
      sample_size: n,
      predicted_prob_avg: Math.round(predictedAvg * 10000) / 10000,
      actual_hit_rate: Math.round(actualRate * 10000) / 10000,
      calibration_factor: Math.round(factor * 10000) / 10000,
      notes: `parlay-level | ${notes}`,
      avg_clv: clv?.avg ?? null,
      clv_sample: clv?.sample ?? null,
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
    const clv = clvFor(key);
    rows.push({
      sport: sportPart || null,
      market: marketPart || null,
      odds_bucket: bucketPart || null,
      sample_size: n,
      predicted_prob_avg: Math.round(predictedAvg * 10000) / 10000,
      actual_hit_rate: Math.round(actualRate * 10000) / 10000,
      calibration_factor: Math.round(factor * 10000) / 10000,
      notes: `leg-level | ${notes}`,
      avg_clv: clv?.avg ?? null,
      clv_sample: clv?.sample ?? null,
    });
  }

  if (rows.length === 0) {
    return NextResponse.json({
      resolved: allParlays.length,
      legs_graded: legsGraded,
      legs_skipped: legsSkipped,
      clv_legs_window: clvLegsCounted,
      written: 0,
      message: "no buckets met sample threshold",
    });
  }

  // Insert with progressive fallback: drop avg_clv/clv_sample first, then
  // odds_bucket, so older deploys missing those migrations still record the
  // hit-rate calibration they support.
  function stripCols(rs: CalibRow[], drop: Array<keyof CalibRow>) {
    return rs.map((r) => {
      const copy: Partial<CalibRow> = { ...r };
      for (const k of drop) delete copy[k];
      return copy;
    });
  }

  let insertErr: { message: string } | null = null;
  {
    const { error } = await supabase.from("model_calibration").insert(rows);
    insertErr = error;
  }
  if (insertErr && /column .*(avg_clv|clv_sample)/i.test(insertErr.message || "")) {
    const { error } = await supabase
      .from("model_calibration")
      .insert(stripCols(rows, ["avg_clv", "clv_sample"]));
    insertErr = error;
  }
  if (insertErr && /column .*odds_bucket/i.test(insertErr.message || "")) {
    const v1Rows = stripCols(
      rows.filter((r) => r.odds_bucket === null),
      ["odds_bucket", "avg_clv", "clv_sample"],
    );
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
    clv_legs_window: clvLegsCounted,
    written: rows.length,
    rows,
    timestamp: new Date().toISOString(),
  });
}
