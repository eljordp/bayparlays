import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { applyDiversityFilter } from "@/lib/diversity";
import { activeVerifier, type VerifierParlay, type VerifierLeg } from "@/lib/llm-verifier";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

// ─── Daily Slate generator ─────────────────────────────────────────────────
//
// Triggered 4x/day by .github/workflows/slate.yml. Each run:
//   1. Builds a slate_id like "2026-04-26-evening"
//   2. Hits /api/parlays internally to generate the candidate parlays
//   3. Picks 12 across categories (5 Confidence, 4 EV, 3 Payout) — the mix
//      that matches what users actually engage with on /parlays
//   4. Stamps slate_id onto those parlays in the parlays table
//
// /api/parlays?mode=slate reads the latest slate_id and returns only those
// parlays, so users see a stable set until the next slate drops.

interface InternalParlayResp {
  parlays: Array<{
    id: string;
    legs: unknown[];
    combinedDecimal: number;
    combinedOdds: string;
    ev: number;
    evPercent: number;
    confidence: number;
    payout: number;
    sports?: string[];
    category?: string;
  }>;
}

function currentSlateLabel(now: Date): string {
  const h = now.getUTCHours();
  // Bucket by which window we're CURRENTLY in (latest slate that has dropped).
  // Aligned to the new 15/19/23/02 UTC cron schedule (8am/12pm/4pm/7pm PT).
  if (h >= 15 && h < 19) return "morning";   // 8am-noon PT
  if (h >= 19 && h < 23) return "midday";    // noon-4pm PT
  if (h >= 23 || h < 2)  return "primetime"; // 4pm-7pm PT
  return "late";                              // 7pm PT through next morning's cron
}

function todaySlateId(label: string, now: Date): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}-${label}`;
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

  const now = new Date();
  const label = currentSlateLabel(now);
  const slateId = todaySlateId(label, now);

  // If a slate with this ID already exists, do nothing — idempotent so
  // GH Actions retries don't double-stamp. Returns the existing slate's count.
  const { count: existing } = await supabase
    .from("parlays")
    .select("id", { count: "exact", head: true })
    .eq("slate_id", slateId);

  if (existing && existing > 0) {
    return NextResponse.json({
      slateId,
      label,
      message: "slate already exists",
      existingCount: existing,
    });
  }

  // Generate parlays via internal call to /api/parlays. Three sort modes,
  // small counts each — total 12 picks per slate.
  // Hardcoded to the production alias — Vercel's per-deployment URLs
  // (process.env.VERCEL_URL) are protected by deployment-level auth on the
  // Hobby tier, so internal fetches against them get 401d. The production
  // alias is always public.
  const baseUrl = "https://bayparlays.vercel.app";

  type Combo = { sort: "confidence" | "ev" | "payout"; count: number; legs: number };
  // Counts oversampled ~3x so the slate-level diversity filter has room to
  // drop near-duplicates AND still leave 25-30+ surviving picks. The first
  // run of the filter (2026-04-27 morning) collected 14 candidates and
  // dropped 5 → only 9 published, starving VIP (15) and Admin (30) tiers.
  // New targets: collect ~36 raw, expect ~36% drop, net ~22-25 published.
  // If the drop rate trends differently after a few cycles, dial accordingly.
  const combos: Combo[] = [
    // Counts bumped 2026-04-30 — JP wants more picks per slate. Total
    // candidate ask is now ~52 across modes; with the loosened diversity
    // filter (maxPerLeg=2, maxPerGame=3), expected published is ~25-30.
    { sort: "confidence", count: 12, legs: 2 }, // safe favorites
    { sort: "confidence", count: 8,  legs: 3 },
    { sort: "ev",         count: 10, legs: 2 }, // best math
    { sort: "ev",         count: 6,  legs: 3 },
    { sort: "payout",     count: 8,  legs: 3 }, // longshots
    { sort: "payout",     count: 6,  legs: 4 },
    // 5/6 leg picks are inherently low-confidence (cumulative prob drops
    // hard each leg) so they live in the payout sort — degens-only lottery
    // tickets. Without these the /parlays "Legs: 5" / "Legs: 6" filters
    // return empty, which reads as broken.
    { sort: "payout",     count: 1, legs: 5 },
    { sort: "payout",     count: 1, legs: 6 },
  ];

  // Phase 1: collect candidate parlays across all combos. We don't insert
  // yet — same parlay can rank highly in two sort modes (e.g. confidence and
  // EV both surface the same low-juice favorite stack), and we want a slate
  // diversity pass to dedupe across modes before any DB write happens.
  type Candidate = {
    parlayId: string;
    legs: Array<{ gameId?: string; pick: string; sport?: string }>;
    row: Record<string, unknown>;
  };
  const candidates: Candidate[] = [];
  const debug: Array<Record<string, unknown>> = [];

  for (const combo of combos) {
    const dbg: Record<string, unknown> = { sort: combo.sort, legs: combo.legs, count: combo.count };
    try {
      // maxHours=36 keeps every leg in tonight's-or-tomorrow's games. Without
      // it, multi-leg parlays could chain a leg from 3 days out, leaving the
      // whole parlay pending until that distant game finishes.
      // Sport list trimmed 2026-05-02: NBA + UFC excluded (model can't
      // price them — see /api/parlays sport-level block). NCAAB/NCAAF/MLS
      // dropped because they're out of season; fetching them just burns
      // Odds API credits for empty payloads. Re-add when in-season.
      const u = `${baseUrl}/api/parlays?sports=mlb,nhl&legs=${combo.legs}&count=${combo.count}&sort=${combo.sort}&tier=admin&maxHours=36`;
      dbg.url = u;
      const res = await fetch(u, { cache: "no-store" });
      dbg.status = res.status;
      if (!res.ok) {
        debug.push(dbg);
        continue;
      }
      const data = (await res.json()) as InternalParlayResp;
      const parlays = data.parlays || [];
      dbg.parlaysReturned = parlays.length;

      for (const p of parlays) {
        const legs = p.legs as Array<{ gameId?: string; pick: string; sport?: string }>;
        const legSports = Array.from(
          new Set(legs.map((l) => l?.sport).filter((s): s is string => !!s)),
        );
        candidates.push({
          parlayId: p.id,
          legs,
          row: {
            legs: p.legs,
            combined_odds: p.combinedOdds,
            combined_decimal: p.combinedDecimal,
            ev: p.ev,
            ev_percent: p.evPercent,
            confidence: p.confidence,
            payout: p.payout,
            stake: 100,
            legs_total: p.legs.length,
            sports: legSports.length > 0 ? legSports : ["MLB"],
            status: "pending",
            category: p.category || combo.sort,
            slate_id: slateId,
          },
        });
      }
      debug.push(dbg);
    } catch (e) {
      dbg.exception = String(e);
      debug.push(dbg);
    }
  }

  // Phase 2: slate-level diversity filter. /api/parlays already filters
  // within a single sort mode, but each combo above is an independent call
  // — duplicates and near-duplicates can sneak in across modes. Order
  // matters: combos[] is listed confidence-first, so confidence picks win
  // ties against EV/payout picks. That mirrors the existing slate mix
  // (5 confidence / 4 EV / 3 payout).
  // Health check: if the upstream API is exhausted (Odds API quota burned)
  // or ESPN scoring failed, candidates come back either empty OR with stripped
  // legs (no gameId, ev_percent ≈ 0, ourProb missing). Publishing those rows
  // pollutes /parlays with junk cards. Skip the insert entirely — slate_runs
  // gets a row showing why so the dashboard reflects the outage instead of
  // pretending the slate ran fine.
  // EV floor — published picks must have at least 2% claimed edge AFTER
  // calibration. Pre-2026-05-04 the gate was `Math.abs(ev) < 1`, which
  // accepted -50% EV picks if they happened to come through. Calibration
  // v2 multiplies ourProb by per-bucket factors that compound across
  // legs, often pushing parlay EV deeply negative. Honest answer: don't
  // publish a slate that the model itself thinks has no edge.
  const MIN_PUBLISH_EV = 2;
  const goodCandidates = candidates.filter((c) => {
    const ev = c.row.ev_percent as number | undefined;
    if (ev === undefined || ev < MIN_PUBLISH_EV) return false;
    const firstLeg = c.legs?.[0] as { gameId?: string } | undefined;
    if (!firstLeg?.gameId) return false;
    return true;
  });

  if (goodCandidates.length === 0) {
    const negativeEvCount = candidates.filter((c) => {
      const ev = c.row.ev_percent as number | undefined;
      return ev !== undefined && ev < MIN_PUBLISH_EV;
    }).length;
    await supabase.from("slate_runs").insert({
      slate_id: slateId,
      label,
      candidates_before_filter: candidates.length,
      dropped_to_diversity: 0,
      persisted: 0,
      last_insert_error:
        candidates.length === 0
          ? "upstream returned 0 candidates (likely Odds API quota exhausted)"
          : `all ${candidates.length} candidates below ${MIN_PUBLISH_EV}% EV after calibration (${negativeEvCount} negative). No edge today.`,
    });
    return NextResponse.json({
      slateId,
      label,
      persisted: 0,
      candidatesBeforeFilter: candidates.length,
      candidatesAfterHealthCheck: 0,
      message:
        candidates.length === 0
          ? "Aborted — upstream data unhealthy. Check Odds API quota."
          : `No edge today: all ${candidates.length} candidates below ${MIN_PUBLISH_EV}% EV after calibration.`,
      debug,
      timestamp: now.toISOString(),
    });
  }

  const beforeFilter = goodCandidates.length;
  // Loosened 2026-04-30 — earlier maxPerLeg=1 / maxPerGame=2 was killing
  // 80% of candidates and leaving slates with only 7 picks. The variety
  // payoff wasn't worth that few options. Defaults (maxPerLeg=2,
  // maxPerGame=3) keep the structurally-different-bet guarantee while
  // letting ~25-30 picks through per slate.
  const diverse = applyDiversityFilter(goodCandidates, {
    maxPerLeg: 2,
    maxPerGame: 3,
  });
  const droppedToDiversity = beforeFilter - diverse.length;

  // Phase 3: rank the diverse candidates by confidence DESC and stamp
  // slate_rank (1 = highest confidence) before insert. This is the spine
  // of the new "Top N" filter on /parlays and the tier breakout on
  // /results — without persisted rank, historical hit rate by tier
  // can't be computed retroactively.
  //
  // Confidence is the right ranking signal because that's the default
  // user sort and the metric subscribers care about ("will this hit?").
  // EV is intentionally NOT the rank signal — high-EV / low-confidence
  // longshots would crowd Top 3 and tank apparent hit rate.
  diverse.sort((a, b) => {
    const ac = (a.row.confidence as number) ?? 0;
    const bc = (b.row.confidence as number) ?? 0;
    return bc - ac;
  });

  // Phase 3.5: LLM verification (added 2026-05-02). Each candidate is
  // scored by Gemini for sharp-eye reasoning on top of the statistical
  // model. Returns "keep" / "soft" / "skip" verdicts. We drop "skip"
  // entirely and keep the rest. Soft picks still publish but get a
  // lower slate_rank.
  const verifier = activeVerifier();
  const verifierParlays: VerifierParlay[] = diverse.map((c, i) => {
    const legs = (c.legs ?? []) as VerifierLeg[];
    return {
      id: c.parlayId ?? `idx_${i}`,
      legs,
      combinedOdds: (c.row.combined_odds as string) ?? "",
      combinedDecimal: (c.row.combined_decimal as number) ?? 1,
      confidence: (c.row.confidence as number) ?? 0,
      evPercent: (c.row.ev_percent as number) ?? 0,
    };
  });

  let verdicts: Awaited<ReturnType<typeof verifier.scoreSlate>> = [];
  let verifierError: string | undefined;
  try {
    verdicts = await verifier.scoreSlate(verifierParlays);
  } catch (e) {
    verifierError = String(e);
    console.error("LLM verifier failed (non-fatal):", e);
  }
  const verdictById = new Map(verdicts.map((v) => [v.parlayId, v]));

  // Drop hard-skip picks. Keep "keep" + "soft". Soft picks publish but
  // get pushed to the bottom of the rank.
  const surviving = diverse.filter((c, i) => {
    const v = verdictById.get(c.parlayId ?? `idx_${i}`);
    return !v || v.verdict !== "skip";
  });
  const llmRejected = diverse.length - surviving.length;

  // Sort: keep verdicts first (by confidence), then soft (by confidence).
  surviving.sort((a, b) => {
    const va = verdictById.get(a.parlayId ?? "");
    const vb = verdictById.get(b.parlayId ?? "");
    const aRank = va?.verdict === "keep" ? 0 : 1;
    const bRank = vb?.verdict === "keep" ? 0 : 1;
    if (aRank !== bRank) return aRank - bRank;
    const ac = (a.row.confidence as number) ?? 0;
    const bc = (b.row.confidence as number) ?? 0;
    return bc - ac;
  });

  const persisted: string[] = [];
  let lastInsertError: string | undefined;
  for (let i = 0; i < surviving.length; i++) {
    const c = surviving[i];
    const v = verdictById.get(c.parlayId ?? `idx_${i}`);
    const rowWithRank = {
      ...c.row,
      slate_rank: i + 1,
      llm_verdict: v?.verdict ?? null,
      llm_confidence: v?.llmConfidence ?? null,
      llm_reason: v?.reason ?? null,
    };
    const { error } = await supabase.from("parlays").insert(rowWithRank).select("id").single();
    if (error) {
      // Schema may not yet have the llm_* columns. Retry without them.
      if (/llm_verdict|llm_confidence|llm_reason/.test(error.message)) {
        const { llm_verdict: _v, llm_confidence: _c, llm_reason: _r, ...bareRow } = rowWithRank;
        void _v; void _c; void _r;
        const { error: retryErr } = await supabase.from("parlays").insert(bareRow).select("id").single();
        if (retryErr) lastInsertError = retryErr.message;
        else persisted.push(c.parlayId);
      } else {
        lastInsertError = error.message;
      }
    } else {
      persisted.push(c.parlayId);
    }
  }

  await supabase.from("slate_runs").insert({
    slate_id: slateId,
    label,
    candidates_before_filter: beforeFilter,
    dropped_to_diversity: droppedToDiversity,
    persisted: persisted.length,
    last_insert_error: verifierError ?? lastInsertError,
  });

  return NextResponse.json({
    slateId,
    label,
    persisted: persisted.length,
    candidatesBeforeFilter: beforeFilter,
    droppedToDiversity,
    llmRejected,
    verifier: verifier.name,
    verifierError,
    lastInsertError,
    debug,
    timestamp: now.toISOString(),
  });
}
