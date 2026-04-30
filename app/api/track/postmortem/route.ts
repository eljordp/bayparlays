import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

// Postmortem endpoint.
//
// Cross-cutting "what's actually working vs what's broken" analysis over
// the resolved parlays table. Surfaces patterns that the strategy
// comparison can't:
//   - WIN vs LOSS averages (confidence, EV, odds, leg count)
//   - Per-team win/loss leaderboard (which picks keep landing/missing)
//   - Per-market hit rates with expected-vs-actual gap (calibration health)
//   - Per-sport hit rates same
//   - Recent winning legs grouped by team to spot hot players/teams
//
// Used by /postmortem page so JP (and future analysts) can spot bias and
// concrete tweaks before the calibration job converges on them.

interface ParlayLeg {
  pick?: string;
  market?: string;
  sport?: string;
  game?: string;
  homeTeam?: string;
  awayTeam?: string;
  odds?: number;
  trueEdge?: number;
  ourProb?: number;
}

interface ParlayRow {
  id: string;
  status: string;
  legs: ParlayLeg[];
  combined_decimal: number | null;
  confidence: number | null;
  ev_percent: number | null;
  legs_total: number | null;
  sports: string[] | null;
  archived_at: string | null;
  created_at: string;
}

const UNIT = 10;

function avg(rows: ParlayRow[], pluck: (p: ParlayRow) => number | null | undefined): number {
  const values = rows.map(pluck).filter((v): v is number => typeof v === "number");
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

// Extract a "pick subject" from a leg for team-level rollup.
// "Lakers ML" → "Lakers"
// "Yankees -1.5" → "Yankees"
// "Over 8.5" → "Over (Yankees vs Astros)" — keeps totals identifiable
function pickSubject(leg: ParlayLeg): string {
  const pick = leg.pick ?? "";
  const ml = pick.match(/^(.+?)\s+ML\s*$/i);
  if (ml) return ml[1].trim();
  const spread = pick.match(/^(.+?)\s+[+-]\d+(\.\d+)?$/);
  if (spread) return spread[1].trim();
  const total = pick.match(/^(Over|Under)\s+\d+(\.\d+)?$/i);
  if (total) {
    const direction = total[1];
    return `${direction} (${leg.game ?? "—"})`;
  }
  return pick.trim();
}

export async function GET() {
  try {
    const allRows: ParlayRow[] = [];
    const PAGE_SIZE = 1000;
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from("parlays")
        .select(
          "id, status, legs, combined_decimal, confidence, ev_percent, legs_total, sports, archived_at, created_at",
        )
        .neq("status", "pending")
        .order("created_at", { ascending: false })
        .range(from, from + PAGE_SIZE - 1);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      if (!data || data.length === 0) break;
      allRows.push(...(data as ParlayRow[]));
      if (data.length < PAGE_SIZE) break;
    }

    const rows = allRows.filter((p) => !p.archived_at);
    const wins = rows.filter((p) => p.status === "won");
    const losses = rows.filter((p) => p.status === "lost");

    // ── WIN vs LOSS averages ───────────────────────────────────────────
    const winAvg = {
      confidence: Math.round(avg(wins, (p) => p.confidence) * 10) / 10,
      evPercent: Math.round(avg(wins, (p) => p.ev_percent) * 10) / 10,
      combinedDecimal: Math.round(avg(wins, (p) => p.combined_decimal) * 100) / 100,
      legCount: Math.round(avg(wins, (p) => p.legs_total) * 10) / 10,
    };
    const lossAvg = {
      confidence: Math.round(avg(losses, (p) => p.confidence) * 10) / 10,
      evPercent: Math.round(avg(losses, (p) => p.ev_percent) * 10) / 10,
      combinedDecimal: Math.round(avg(losses, (p) => p.combined_decimal) * 100) / 100,
      legCount: Math.round(avg(losses, (p) => p.legs_total) * 10) / 10,
    };

    // ── Per-market hit rate (using leg-level aggregation) ──────────────
    // For each leg in a parlay, we know what market it was. Determining
    // whether THE LEG won (vs. the parlay) requires real game-result
    // data we don't have here for old rows; instead, attribute the
    // parlay's outcome to each of its legs as a proxy. Imperfect but
    // surfaces the dominant patterns.
    const marketStats = new Map<string, { wins: number; losses: number }>();
    for (const p of rows) {
      const status = p.status;
      for (const l of p.legs ?? []) {
        const m = (l.market ?? "unknown").toLowerCase();
        const entry = marketStats.get(m) ?? { wins: 0, losses: 0 };
        if (status === "won") entry.wins++;
        else if (status === "lost") entry.losses++;
        marketStats.set(m, entry);
      }
    }
    const byMarket = Array.from(marketStats.entries())
      .map(([market, v]) => {
        const total = v.wins + v.losses;
        const hitRate = total > 0 ? Math.round((v.wins / total) * 1000) / 10 : 0;
        return { market, wins: v.wins, losses: v.losses, total, hitRate };
      })
      .sort((a, b) => b.total - a.total);

    // ── Per-sport hit rate (parlay-level, using primary sport tag) ─────
    const sportStats = new Map<string, { wins: number; losses: number; profit: number }>();
    for (const p of rows) {
      const sports = p.sports ?? [];
      const primary = (sports[0] ?? "—").toUpperCase();
      const entry = sportStats.get(primary) ?? { wins: 0, losses: 0, profit: 0 };
      if (p.status === "won") {
        entry.wins++;
        entry.profit += UNIT * ((p.combined_decimal ?? 1) - 1);
      } else if (p.status === "lost") {
        entry.losses++;
        entry.profit -= UNIT;
      }
      sportStats.set(primary, entry);
    }
    const bySport = Array.from(sportStats.entries())
      .map(([sport, v]) => {
        const total = v.wins + v.losses;
        const hitRate = total > 0 ? Math.round((v.wins / total) * 1000) / 10 : 0;
        const roi = total > 0 ? Math.round((v.profit / (total * UNIT)) * 1000) / 10 : 0;
        return {
          sport,
          wins: v.wins,
          losses: v.losses,
          total,
          hitRate,
          roi,
          profit: Math.round(v.profit * 100) / 100,
        };
      })
      .sort((a, b) => b.total - a.total);

    // ── Team leaderboard ──────────────────────────────────────────────
    // Aggregate every leg's pick subject across resolved parlays.
    const teamStats = new Map<string, { wins: number; losses: number }>();
    for (const p of rows) {
      const status = p.status;
      for (const l of p.legs ?? []) {
        const subject = pickSubject(l);
        if (!subject) continue;
        const entry = teamStats.get(subject) ?? { wins: 0, losses: 0 };
        if (status === "won") entry.wins++;
        else if (status === "lost") entry.losses++;
        teamStats.set(subject, entry);
      }
    }
    const teamRows = Array.from(teamStats.entries())
      .map(([subject, v]) => {
        const total = v.wins + v.losses;
        const hitRate = total > 0 ? Math.round((v.wins / total) * 1000) / 10 : 0;
        return { subject, wins: v.wins, losses: v.losses, total, hitRate };
      })
      .filter((r) => r.total >= 5);

    const topWinners = [...teamRows].sort((a, b) => b.hitRate - a.hitRate || b.wins - a.wins).slice(0, 15);
    const topLosers = [...teamRows].sort((a, b) => a.hitRate - b.hitRate || b.losses - a.losses).slice(0, 15);
    const mostFrequent = [...teamRows].sort((a, b) => b.total - a.total).slice(0, 15);

    // ── Recent winning legs (top examples, last 14 days) ──────────────
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const recentWins = wins
      .filter((p) => p.created_at >= fourteenDaysAgo)
      .slice(0, 8)
      .map((p) => ({
        id: p.id,
        createdAt: p.created_at,
        legs: p.legs,
        combinedDecimal: p.combined_decimal,
        confidence: p.confidence,
        evPercent: p.ev_percent,
        profitAtUnit: Math.round(UNIT * ((p.combined_decimal ?? 1) - 1) * 100) / 100,
      }));
    const recentLosses = losses
      .filter((p) => p.created_at >= fourteenDaysAgo)
      .slice(0, 8)
      .map((p) => ({
        id: p.id,
        createdAt: p.created_at,
        legs: p.legs,
        combinedDecimal: p.combined_decimal,
        confidence: p.confidence,
        evPercent: p.ev_percent,
        profitAtUnit: -UNIT,
      }));

    // ── Tweak recommendations (rule-based, simple) ─────────────────────
    const recommendations: string[] = [];

    // 1. Confidence calibration health: if model is dramatically over/under
    //    confident (claimed avg conf >> actual hit rate), flag it.
    const overallHitRate =
      wins.length + losses.length > 0
        ? (wins.length / (wins.length + losses.length)) * 100
        : 0;
    const claimedConf = avg(rows, (p) => p.confidence);
    const calibrationGap = claimedConf - overallHitRate;
    if (Math.abs(calibrationGap) >= 5 && rows.length >= 100) {
      recommendations.push(
        calibrationGap > 0
          ? `Model is ~${calibrationGap.toFixed(0)}pp OVERCONFIDENT (claims ${claimedConf.toFixed(0)}% avg, hits ${overallHitRate.toFixed(0)}%). Consider tightening confidence floor or adding a calibration scaler.`
          : `Model is ~${Math.abs(calibrationGap).toFixed(0)}pp UNDER-confident (claims ${claimedConf.toFixed(0)}% avg, hits ${overallHitRate.toFixed(0)}%). Picks are getting through that should rank higher.`,
      );
    }

    // 2. Sport-level: any sport hitting <15% with 50+ samples = liability
    for (const s of bySport) {
      if (s.total >= 50 && s.hitRate < 15 && s.roi < -30) {
        recommendations.push(
          `${s.sport} is hitting ${s.hitRate}% on ${s.total} resolved (ROI ${s.roi}%). Consider excluding from active slates until model improves on this sport.`,
        );
      }
    }

    // 3. Most-frequent losers: teams appearing 8+ times with hit rate <20%
    const persistentLosers = topLosers.filter((t) => t.total >= 8 && t.hitRate < 20);
    if (persistentLosers.length > 0) {
      const examples = persistentLosers.slice(0, 3).map((t) => `"${t.subject}" (${t.wins}W/${t.losses}L)`).join(", ");
      recommendations.push(
        `Persistent loser picks the model keeps generating: ${examples}. Worth adding a manual block until the team's situation changes.`,
      );
    }

    // 4. Leg-count: pick the bucket with worst ROI
    const legCountStats = new Map<number, { wins: number; losses: number; profit: number }>();
    for (const p of rows) {
      const n = p.legs_total ?? 0;
      const entry = legCountStats.get(n) ?? { wins: 0, losses: 0, profit: 0 };
      if (p.status === "won") {
        entry.wins++;
        entry.profit += UNIT * ((p.combined_decimal ?? 1) - 1);
      } else if (p.status === "lost") {
        entry.losses++;
        entry.profit -= UNIT;
      }
      legCountStats.set(n, entry);
    }
    const byLegCount = Array.from(legCountStats.entries())
      .map(([legs, v]) => {
        const total = v.wins + v.losses;
        const hitRate = total > 0 ? Math.round((v.wins / total) * 1000) / 10 : 0;
        const roi = total > 0 ? Math.round((v.profit / (total * UNIT)) * 1000) / 10 : 0;
        return { legs, wins: v.wins, losses: v.losses, total, hitRate, roi, profit: Math.round(v.profit * 100) / 100 };
      })
      .sort((a, b) => a.legs - b.legs);

    return NextResponse.json(
      {
        totalResolved: wins.length + losses.length,
        totalWins: wins.length,
        totalLosses: losses.length,
        overallHitRate: Math.round(overallHitRate * 10) / 10,
        winAvg,
        lossAvg,
        byMarket,
        bySport,
        byLegCount,
        topWinners,
        topLosers,
        mostFrequent,
        recentWins,
        recentLosses,
        recommendations,
        unitStake: UNIT,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
