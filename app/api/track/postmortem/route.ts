import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

// Postmortem v2 — owner-first.
//
// Every section here is meant to answer "what should I DO about this?"
// rather than just "here's some numbers." The page that consumes it
// surfaces:
//   - Headline scorecard with 7d-vs-prior-7d trend deltas
//   - Actionable tweak list with concrete dollar impact
//   - Profit attribution (where the actual dollars are going)
//   - Hot / cold streaks (temporal, not all-time)
//   - Wins-vs-Losses pick profile (the structural-bias detector)
//   - Per-sport calibration gauges (model accuracy)

interface ParlayLeg {
  pick?: string;
  market?: string;
  sport?: string;
  game?: string;
  homeTeam?: string;
  awayTeam?: string;
  odds?: number;
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
  clv_percent: number | null;
  archived_at: string | null;
  created_at: string;
}

const UNIT = 10;

function profitOf(p: ParlayRow): number {
  if (p.status === "won") return UNIT * ((p.combined_decimal ?? 1) - 1);
  if (p.status === "lost") return -UNIT;
  return 0;
}

function avg(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

interface Window {
  hitRate: number;
  roi: number;
  profit: number;
  clv: number;
  resolved: number;
}

function summarizeWindow(rows: ParlayRow[]): Window {
  const won = rows.filter((p) => p.status === "won").length;
  const lost = rows.filter((p) => p.status === "lost").length;
  const resolved = won + lost;
  const profit = rows.reduce((s, p) => s + profitOf(p), 0);
  const wagered = resolved * UNIT;
  const roi = wagered > 0 ? (profit / wagered) * 100 : 0;
  const hitRate = resolved > 0 ? (won / resolved) * 100 : 0;
  const clvSamples = rows.filter(
    (p) => p.status !== "pending" && typeof p.clv_percent === "number",
  );
  const clv = clvSamples.length > 0
    ? avg(clvSamples.map((p) => p.clv_percent!))
    : 0;
  return {
    hitRate: Math.round(hitRate * 10) / 10,
    roi: Math.round(roi * 10) / 10,
    profit: Math.round(profit * 100) / 100,
    clv: Math.round(clv * 100) / 100,
    resolved,
  };
}

// Pick subject for team-level rollup.
// "Lakers ML" → "Lakers"
// "Yankees -1.5" → "Yankees"
// "Over 8.5" → "Over (Yankees vs Astros)"
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
          "id, status, legs, combined_decimal, confidence, ev_percent, legs_total, sports, clv_percent, archived_at, created_at",
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

    // ── Trend: 7d window vs prior 7d ────────────────────────────────
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    const cur = rows.filter((p) => now - new Date(p.created_at).getTime() <= 7 * day);
    const prev = rows.filter((p) => {
      const t = now - new Date(p.created_at).getTime();
      return t > 7 * day && t <= 14 * day;
    });
    const trend = {
      current: summarizeWindow(cur),
      previous: summarizeWindow(prev),
    };

    // ── WIN vs LOSS pick profile ────────────────────────────────────
    const winAvg = {
      confidence: Math.round(avg(wins.map((p) => p.confidence ?? 0)) * 10) / 10,
      evPercent: Math.round(avg(wins.map((p) => p.ev_percent ?? 0)) * 10) / 10,
      combinedDecimal: Math.round(avg(wins.map((p) => p.combined_decimal ?? 0)) * 100) / 100,
      legCount: Math.round(avg(wins.map((p) => p.legs_total ?? 0)) * 10) / 10,
    };
    const lossAvg = {
      confidence: Math.round(avg(losses.map((p) => p.confidence ?? 0)) * 10) / 10,
      evPercent: Math.round(avg(losses.map((p) => p.ev_percent ?? 0)) * 10) / 10,
      combinedDecimal: Math.round(avg(losses.map((p) => p.combined_decimal ?? 0)) * 100) / 100,
      legCount: Math.round(avg(losses.map((p) => p.legs_total ?? 0)) * 10) / 10,
    };

    // ── Profit attribution ──────────────────────────────────────────
    function aggregate<K extends string>(
      rs: ParlayRow[],
      keyFn: (p: ParlayRow) => K | null,
    ): Array<{ key: K; wins: number; losses: number; total: number; hitRate: number; roi: number; profit: number }> {
      const map = new Map<K, { wins: number; losses: number; profit: number }>();
      for (const p of rs) {
        const k = keyFn(p);
        if (k === null) continue;
        const e = map.get(k) ?? { wins: 0, losses: 0, profit: 0 };
        if (p.status === "won") e.wins++;
        if (p.status === "lost") e.losses++;
        e.profit += profitOf(p);
        map.set(k, e);
      }
      return Array.from(map.entries())
        .map(([key, v]) => {
          const total = v.wins + v.losses;
          const hitRate = total > 0 ? Math.round((v.wins / total) * 1000) / 10 : 0;
          const roi = total > 0 ? Math.round((v.profit / (total * UNIT)) * 1000) / 10 : 0;
          return {
            key,
            wins: v.wins,
            losses: v.losses,
            total,
            hitRate,
            roi,
            profit: Math.round(v.profit * 100) / 100,
          };
        })
        .sort((a, b) => b.profit - a.profit);
    }

    const bySport = aggregate(rows, (p) =>
      Array.isArray(p.sports) && p.sports[0] ? (p.sports[0] as string).toUpperCase() : null,
    );
    const byLegCount = aggregate(rows, (p) =>
      typeof p.legs_total === "number" ? `${p.legs_total}-leg` : null,
    );
    const byConfidenceBand = aggregate(rows, (p) => {
      const c = p.confidence ?? 0;
      if (c >= 50) return "50%+ (high conf)";
      if (c >= 35) return "35-50% (sweet spot)";
      if (c >= 20) return "20-35% (mid)";
      if (c > 0) return "<20% (longshot)";
      return null;
    });

    // ── Hot / Cold streaks (last 14 days, ordered by created_at) ───
    const last14d = rows
      .filter((p) => now - new Date(p.created_at).getTime() <= 14 * day)
      .sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );

    // For each team subject, build a chronological win/loss list and find
    // the longest current run (most recent consecutive same-status streak).
    const teamLog = new Map<string, Array<{ status: string; at: string }>>();
    for (const p of last14d) {
      for (const l of p.legs ?? []) {
        const subject = pickSubject(l);
        if (!subject) continue;
        const arr = teamLog.get(subject) ?? [];
        arr.push({ status: p.status, at: p.created_at });
        teamLog.set(subject, arr);
      }
    }

    const streaks = Array.from(teamLog.entries())
      .map(([subject, log]) => {
        if (log.length < 2) return null;
        // Trailing streak — count back from the end while status matches
        let streakLen = 1;
        const lastStatus = log[log.length - 1].status;
        for (let i = log.length - 2; i >= 0; i--) {
          if (log[i].status === lastStatus) streakLen++;
          else break;
        }
        return {
          subject,
          status: lastStatus,
          streakLen,
          totalAppearances: log.length,
          lastSeen: log[log.length - 1].at,
        };
      })
      .filter((s): s is NonNullable<typeof s> => s !== null);

    const hotStreaks = streaks
      .filter((s) => s.status === "won" && s.streakLen >= 3)
      .sort((a, b) => b.streakLen - a.streakLen)
      .slice(0, 10);
    const coldStreaks = streaks
      .filter((s) => s.status === "lost" && s.streakLen >= 4)
      .sort((a, b) => b.streakLen - a.streakLen)
      .slice(0, 10);

    // ── Calibration gauges per sport ───────────────────────────────
    const calibration = bySport.map((s) => {
      const filteredRows = rows.filter(
        (p) =>
          Array.isArray(p.sports) &&
          p.sports[0] &&
          (p.sports[0] as string).toUpperCase() === s.key,
      );
      const claimedConf = avg(filteredRows.map((p) => p.confidence ?? 0));
      const actualHit = s.hitRate;
      const gap = Math.round((claimedConf - actualHit) * 10) / 10;
      return {
        sport: s.key,
        samples: s.total,
        claimedConfidence: Math.round(claimedConf * 10) / 10,
        actualHitRate: actualHit,
        gap,
        verdict:
          gap >= 5
            ? "overconfident"
            : gap <= -5
              ? "under-confident"
              : "calibrated",
      };
    });

    // ── Recommendations with concrete $ impact ─────────────────────
    const recommendations: Array<{ kind: string; text: string; impact?: string }> = [];

    // 1. Cautionary sport: if a sport has -10%+ ROI on 50+ samples, calc
    //    what removing it would have done.
    const totalProfit = rows.reduce((s, p) => s + profitOf(p), 0);
    for (const s of bySport) {
      if (s.total >= 50 && s.profit < -50 && s.roi <= -10) {
        const counterfactualProfit = totalProfit - s.profit;
        const delta = counterfactualProfit - totalProfit;
        recommendations.push({
          kind: "exclude-sport",
          text: `${s.key} is hitting ${s.hitRate.toFixed(1)}% on ${s.total} resolved (ROI ${s.roi.toFixed(1)}%). It bled $${Math.abs(s.profit).toFixed(0)}. Excluding ${s.key} from active slates would have improved overall profit by $${Math.abs(delta).toFixed(0)}.`,
          impact: `+$${Math.abs(delta).toFixed(0)}`,
        });
      }
    }

    // 2. Calibration: if any sport is dramatically overconfident
    for (const c of calibration) {
      if (c.samples >= 50 && c.gap >= 8) {
        recommendations.push({
          kind: "recalibrate-sport",
          text: `${c.sport}: model claims ${c.claimedConfidence.toFixed(0)}% avg confidence but hits ${c.actualHitRate.toFixed(0)}% — ${c.gap.toFixed(0)}pp overconfident. Tighten the per-sport scaling factor.`,
        });
      }
    }

    // 3. Cold streak: persistent losers that keep getting picked
    if (coldStreaks.length > 0) {
      const top = coldStreaks.slice(0, 3).map((s) => `${s.subject} (${s.streakLen}L in a row)`).join(", ");
      recommendations.push({
        kind: "cold-streak",
        text: `Active cold streaks worth blocking manually: ${top}. The model keeps generating these picks faster than the calibration loop can correct.`,
      });
    }

    // 4. Big-leg structure flag
    const bigLegRow = byLegCount.find((b) => b.key.startsWith("4")) || byLegCount.find((b) => b.key.startsWith("5")) || byLegCount.find((b) => b.key.startsWith("6"));
    const lostBigLegProfit = byLegCount
      .filter((b) => parseInt(b.key) >= 4)
      .reduce((s, b) => s + b.profit, 0);
    if (bigLegRow && lostBigLegProfit < -100) {
      recommendations.push({
        kind: "trim-bigleg",
        text: `4+ leg parlays bled $${Math.abs(lostBigLegProfit).toFixed(0)} cumulatively. Consider capping the slate to 3-leg max until the longshot calibration improves.`,
        impact: `+$${Math.abs(lostBigLegProfit).toFixed(0)}`,
      });
    }

    return NextResponse.json(
      {
        totalResolved: rows.length,
        totalWins: wins.length,
        totalLosses: losses.length,
        trend,
        winAvg,
        lossAvg,
        attribution: {
          bySport,
          byLegCount,
          byConfidenceBand,
        },
        hotStreaks,
        coldStreaks,
        calibration,
        recommendations,
        unitStake: UNIT,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
