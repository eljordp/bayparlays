import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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
  // Bucket by which window we're CURRENTLY in (latest slate that has dropped)
  if (h >= 12 && h < 18) return "morning";
  if (h >= 18 && h < 24) return "midday";
  if (h >= 0 && h < 4)   return "evening";
  return "late"; // 4-12 UTC
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
  const baseUrl =
    process.env.NEXT_PUBLIC_BASE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://bayparlays.vercel.app");

  type Combo = { sort: "confidence" | "ev" | "payout"; count: number; legs: number };
  const combos: Combo[] = [
    { sort: "confidence", count: 3, legs: 2 },  // safe favorites, sweet-spot leg count
    { sort: "confidence", count: 2, legs: 3 },
    { sort: "ev",         count: 3, legs: 2 },  // best math
    { sort: "ev",         count: 1, legs: 3 },
    { sort: "payout",     count: 2, legs: 3 },  // longshots
    { sort: "payout",     count: 1, legs: 4 },
  ];

  const persisted: string[] = [];
  for (const combo of combos) {
    try {
      const u = `${baseUrl}/api/parlays?sports=nba,mlb,nhl,ncaab,ncaaf&legs=${combo.legs}&count=${combo.count}&sort=${combo.sort}&tier=admin`;
      const res = await fetch(u, { cache: "no-store" });
      if (!res.ok) continue;
      const data = (await res.json()) as InternalParlayResp;
      const parlays = data.parlays || [];

      // /api/parlays does its own write to the parlays table via /api/track,
      // but those rows land WITHOUT a slate_id. We tag them retroactively
      // by matching combined_odds + most recent insert. Faster: re-insert
      // here as a slate-stamped row.
      for (const p of parlays) {
        // Derive sports from legs since /api/parlays returns sports nested
        // inside each leg, not at the top level. parlays.sports is NOT NULL.
        const legSports = Array.from(
          new Set(
            (p.legs as Array<{ sport?: string }>)
              .map((l) => l?.sport)
              .filter((s): s is string => !!s),
          ),
        );
        const row = {
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
        };
        const { error } = await supabase.from("parlays").insert(row).select("id").single();
        if (error) {
          console.error(`slate insert failed (${combo.sort}/${combo.legs}):`, error.message);
        } else {
          persisted.push(p.id);
        }
      }
    } catch (e) {
      console.error(`Combo ${combo.sort}/${combo.legs}:`, e);
    }
  }

  return NextResponse.json({
    slateId,
    label,
    persisted: persisted.length,
    timestamp: now.toISOString(),
  });
}
