// ─── Brute-force Research Scanner ─────────────────────────────────────────
//
// Enumerates EVERY valid 2/3/4-leg parlay from the day's edge-positive leg
// pool and persists the top-N to research_parlays. Greedy buildParlays() in
// /api/parlays only sees ~30 candidates per call — this scanner sees 370k+.
//
// Why this exists:
//   - Research data: study where the AI finds edge across the full slate
//   - Subscriber value: a /research page can show "we scanned 370k parlays
//     today, here are the 100 highest-EV ones — every leg is showing its
//     work, no cherry-picking"
//   - Calibration training data: every scanned parlay gets a row, every
//     resolved row teaches the model whether its EV estimates are accurate
//
// Storage budget: top 500 per scan × 2 scans/day × 800 bytes ≈ 800 KB/day.
// Auto-deleted after 60 days; steady-state ≈ 50 MB.
//
// Run locally:  npx tsx scripts/research-scan.ts
// Run via GHA:  see .github/workflows/research-scan.yml

import { createClient } from "@supabase/supabase-js";

// ─── Config ────────────────────────────────────────────────────────────────

const BASE_URL =
  process.env.BAYPARLAYS_BASE_URL || "https://bayparlays.vercel.app";

// Sports list — only currently-in-season + year-round sports. NCAAB / NCAAF
// dropped 2026-05-04 (off-season, was burning ~2 credits/scan returning
// empty). UFC + soccer (EPL) added: UFC runs year-round, soccer covers
// May tail of EPL season.
const SPORTS = "nba,mlb,nhl,ufc,soccer";
const LEG_FETCH_COUNT = 200;       // x4 inside /api/parlays = up to 800 legs
const MAX_LEG_COUNT_FOR_4LEG = 60; // was 30→50→60; C(60,4)=487k still tractable
const TOP_K_TO_PERSIST = 3000;     // was 500→2000→3000 — JP's 500-credit/day
                                   // budget unblocks the previous storage cap
const SHARP_EV_THRESHOLD = 5;      // ev_percent >= 5 counts as "sharp"

// ─── Types ─────────────────────────────────────────────────────────────────

interface ResearchLeg {
  sport: string;
  game: string;
  gameId: string;
  commenceTime?: string;
  pick: string;
  market: string;
  odds: number;
  book: string;
  bookCount: number;
  impliedProb: number;
  ourProb: number;
  trueEdge: number;
  scored: boolean;
  fairProb?: number;
  sharpEdge?: boolean;
  evVsFair?: number;
  // Action Network sharp/square money divergence — positive = sharp money
  // is on this leg's pick side. Used in compositeScore() to bias toward
  // legs the smart money agrees with, not just legs with high raw EV.
  sharpLeanForPick?: number | null;
}

interface ResearchParlay {
  legs: ResearchLeg[];
  combinedDecimal: number;
  combinedProb: number;
  evPercent: number;
  sharpLegsCount: number;
  // Composite "sharpness" score combining sharpEdge flags + AN sharp lean
  // averaged across legs. Used as the persistence-ranking signal so we
  // store fewer noisy +EV-only longshots and more sharp-aligned combos.
  sharpnessScore: number;
  sports: string[];
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function americanToDecimal(odds: number): number {
  if (odds > 0) return odds / 100 + 1;
  return 100 / Math.abs(odds) + 1;
}

// Build a parlay from a set of legs. ourProb compounds (assumes leg
// independence — same as /api/parlays). evPercent uses combinedProb × payout.
function buildParlay(legs: ResearchLeg[]): ResearchParlay | null {
  // Guard: no two legs from the same game.
  const games = new Set<string>();
  for (const l of legs) {
    if (games.has(l.gameId)) return null;
    games.add(l.gameId);
  }
  let combinedDecimal = 1;
  let combinedProb = 1;
  let sharpLegsCount = 0;
  let sharpLeanSum = 0;
  let sharpLeanCount = 0;
  const sportSet = new Set<string>();
  for (const l of legs) {
    combinedDecimal *= americanToDecimal(l.odds);
    combinedProb *= l.ourProb;
    if (l.sharpEdge) sharpLegsCount++;
    if (typeof l.sharpLeanForPick === "number") {
      sharpLeanSum += l.sharpLeanForPick;
      sharpLeanCount++;
    }
    sportSet.add(l.sport);
  }
  const evPercent = (combinedProb * combinedDecimal - 1) * 100;
  // Composite sharpness — sum of:
  //  - 5 points per sharp-edge leg (Pinnacle-style book disagreement)
  //  - 1 point per percentage point of average sharp lean (AN money/public)
  // Range typically -30 to +30 for a 3-leg parlay; scale lets it weight
  // alongside evPercent in the persistence ranking without dominating.
  const meanSharpLean = sharpLeanCount > 0 ? sharpLeanSum / sharpLeanCount : 0;
  const sharpnessScore = sharpLegsCount * 5 + meanSharpLean;
  return {
    legs,
    combinedDecimal,
    combinedProb,
    evPercent,
    sharpLegsCount,
    sharpnessScore: Math.round(sharpnessScore * 10) / 10,
    sports: Array.from(sportSet),
  };
}

// Yield every k-combination of `arr` without allocating the full Cartesian
// product up front. Important for memory at C(50, 4) = 230k combos.
function* combinations<T>(arr: T[], k: number): Generator<T[]> {
  const n = arr.length;
  if (k > n || k <= 0) return;
  const indices = Array.from({ length: k }, (_, i) => i);
  while (true) {
    yield indices.map((i) => arr[i]);
    let i = k - 1;
    while (i >= 0 && indices[i] === n - k + i) i--;
    if (i < 0) return;
    indices[i]++;
    for (let j = i + 1; j < k; j++) indices[j] = indices[j - 1] + 1;
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  const startTime = Date.now();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing Supabase env vars (NEXT_PUBLIC_SUPABASE_URL + key)");
  }
  const supabase = createClient(supabaseUrl, supabaseKey);

  // 1. Fetch the scored leg pool from the live engine. lowEv=true loosens
  // the strict /edges filter (EV>=0.5%, bookCount>=3) to capture every leg
  // the model has a prediction for — what we want for calibration training
  // data, even if some legs aren't EV+ enough to publish to users.
  const url = `${BASE_URL}/api/parlays?sports=${SPORTS}&format=legs&count=${LEG_FETCH_COUNT}&tier=admin&lowEv=true`;
  console.log(`[research] fetching legs: ${url}`);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch legs: HTTP ${res.status}`);
  }
  const data = (await res.json()) as { legs?: ResearchLeg[] };
  const legs = data.legs || [];
  console.log(`[research] received ${legs.length} edge-positive legs`);

  if (legs.length < 2) {
    console.log("[research] not enough legs to enumerate parlays — exiting clean");
    return;
  }

  // 2. Sort by EV per leg so the 4-leg pool can be capped to the top-N
  // (otherwise C(N,4) blows up — 50 legs => 230k combos, 80 legs => 1.6M).
  const legsByEv = [...legs].sort(
    (a, b) =>
      (b.evVsFair ?? b.trueEdge ?? 0) - (a.evVsFair ?? a.trueEdge ?? 0),
  );
  const top30 = legsByEv.slice(0, MAX_LEG_COUNT_FOR_4LEG);

  // 3. Enumerate all valid combos.
  const candidates: ResearchParlay[] = [];
  for (const k of [2, 3]) {
    for (const combo of combinations(legs, k)) {
      const parlay = buildParlay(combo);
      if (parlay) candidates.push(parlay);
    }
  }
  for (const combo of combinations(top30, 4)) {
    const parlay = buildParlay(combo);
    if (parlay) candidates.push(parlay);
  }
  console.log(`[research] enumerated ${candidates.length} valid parlays`);

  // 4. Stats for the scan summary row.
  const positiveEvCount = candidates.filter((p) => p.evPercent > 0).length;
  const sharpEvCount = candidates.filter((p) => p.evPercent >= SHARP_EV_THRESHOLD).length;
  // Composite ranking — used to be evPercent only, which loaded the
  // training pool with high-EV longshots that hit at near-zero rates
  // (the calibration data showed bucket=moon and longshot-heavy parlays
  // were the worst performers). Now we blend evPercent with the
  // sharpness score (sharp-edge flags + AN money/public divergence).
  // Both signals are normalized so neither dominates.
  candidates.sort((a, b) => {
    const aScore = a.evPercent + a.sharpnessScore * 0.5;
    const bScore = b.evPercent + b.sharpnessScore * 0.5;
    return bScore - aScore;
  });
  const topEvPercent = candidates[0]?.evPercent ?? 0;
  const evValues = candidates.map((p) => p.evPercent).sort((a, b) => a - b);
  const medianEvPercent =
    evValues.length > 0
      ? evValues.length % 2 === 0
        ? (evValues[evValues.length / 2 - 1] + evValues[evValues.length / 2]) / 2
        : evValues[Math.floor(evValues.length / 2)]
      : 0;

  // 5. Insert scan summary row and get its id.
  const { data: scanRow, error: scanErr } = await supabase
    .from("research_scans")
    .insert({
      sports: SPORTS.split(","),
      legs_in_pool: legs.length,
      candidates_scanned: candidates.length,
      positive_ev_count: positiveEvCount,
      sharp_ev_count: sharpEvCount,
      top_ev_percent: Math.round(topEvPercent * 100) / 100,
      median_ev_percent: Math.round(medianEvPercent * 100) / 100,
      duration_ms: Date.now() - startTime,
    })
    .select()
    .single();
  if (scanErr || !scanRow) {
    throw new Error(`research_scans insert failed: ${scanErr?.message}`);
  }
  const scanId = (scanRow as { id: string }).id;

  // 6. Persist top-K parlays. Store compact leg objects + the human-readable
  // game string (needed by /api/cron/resolve-research to match against game
  // scores — gameId alone isn't enough since the scores feed keys by team
  // name pattern, not Odds API gameId).
  const topK = candidates.slice(0, TOP_K_TO_PERSIST);
  const rows = topK.map((p) => ({
    scan_id: scanId,
    legs: p.legs.map((l) => ({
      gameId: l.gameId,
      game: l.game,
      sport: l.sport,
      market: l.market,
      pick: l.pick,
      odds: l.odds,
      ourProb: Math.round(l.ourProb * 10000) / 10000,
      sharpEdge: l.sharpEdge ?? false,
      commenceTime: l.commenceTime,
    })),
    leg_count: p.legs.length,
    combined_decimal: Math.round(p.combinedDecimal * 100) / 100,
    combined_prob: Math.round(p.combinedProb * 10000) / 10000,
    ev_percent: Math.round(p.evPercent * 100) / 100,
    sharp_legs_count: p.sharpLegsCount,
    sports: p.sports,
  }));

  // Insert in batches of 100 to keep rows under Supabase request size limits.
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100);
    const { error: parlayErr } = await supabase
      .from("research_parlays")
      .insert(batch);
    if (parlayErr) {
      console.error(
        `research_parlays batch ${i}-${i + batch.length} failed:`,
        parlayErr.message,
      );
    }
  }

  // 7. Auto-cleanup — delete rows older than 60 days. Keeps storage bounded.
  // Free-tier doesn't expose pg_cron so we do it inline; cheap query.
  const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
  await supabase.from("research_parlays").delete().lt("scanned_at", sixtyDaysAgo);
  await supabase.from("research_scans").delete().lt("scanned_at", sixtyDaysAgo);

  console.log(`[research] scan ${scanId} done in ${Date.now() - startTime}ms`);
  console.log(`[research]   pool=${legs.length} candidates=${candidates.length}`);
  console.log(`[research]   +EV=${positiveEvCount} sharp(>=5%)=${sharpEvCount}`);
  console.log(
    `[research]   top=${topEvPercent.toFixed(2)}% median=${medianEvPercent.toFixed(2)}%`,
  );
  console.log(`[research]   persisted top ${rows.length} to research_parlays`);
}

main().catch((err) => {
  console.error("[research] fatal:", err);
  process.exit(1);
});
