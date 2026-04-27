import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// ─── Backtest endpoint ──────────────────────────────────────────────────────
//
// Takes filter params (EV threshold, confidence threshold, sports, leg counts)
// and returns hypothetical ROI as if you'd bet $10 on every parlay matching
// those filters. Uses real resolved-bet history, no simulation.
//
// The "golden zone" finder. Drag sliders, see what would have made money,
// pick the parameters that win on real data.
//
// Query params:
//   minEv        — min ev_percent (default 0)
//   maxEv        — max ev_percent (default Infinity)
//   minConf      — min confidence (default 0)
//   maxConf      — max confidence (default 100)
//   sports       — comma-separated (default all)
//   legs         — comma-separated leg counts e.g. "2,3" (default all)
//   stake        — unit stake for ROI math (default 10)

interface ParlayRow {
  status: "won" | "lost";
  combined_decimal: number;
  ev_percent: number | null;
  confidence: number | null;
  sports: string[] | null;
  legs: unknown[];
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const minEv = parseFloat(sp.get("minEv") ?? "0");
  const maxEv = parseFloat(sp.get("maxEv") ?? "Infinity");
  const minConf = parseFloat(sp.get("minConf") ?? "0");
  const maxConf = parseFloat(sp.get("maxConf") ?? "100");
  const sportsFilter = (sp.get("sports") ?? "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
  const legsFilter = (sp.get("legs") ?? "").split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n));
  const stake = parseFloat(sp.get("stake") ?? "10");

  // Pull all resolved parlays
  const rows: ParlayRow[] = [];
  const PAGE = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("parlays")
      .select("status, combined_decimal, ev_percent, confidence, sports, legs")
      .neq("status", "pending")
      .range(from, from + PAGE - 1);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data || data.length === 0) break;
    rows.push(...(data as ParlayRow[]));
    if (data.length < PAGE) break;
    from += PAGE;
  }

  // Apply filters
  const filtered = rows.filter((p) => {
    const ev = p.ev_percent ?? 0;
    if (ev < minEv || ev > maxEv) return false;
    const conf = p.confidence ?? 0;
    if (conf < minConf || conf > maxConf) return false;
    if (sportsFilter.length > 0) {
      const ps = (p.sports ?? []).map((s) => s.toUpperCase());
      if (!ps.some((s) => sportsFilter.includes(s))) return false;
    }
    if (legsFilter.length > 0) {
      const n = (p.legs ?? []).length;
      if (!legsFilter.includes(n)) return false;
    }
    return true;
  });

  // Compute hypothetical ROI at provided unit stake
  const won = filtered.filter((p) => p.status === "won");
  const lost = filtered.filter((p) => p.status === "lost");
  const profit = won.reduce(
    (sum, p) => sum + stake * ((p.combined_decimal ?? 1) - 1),
    0,
  ) - lost.length * stake;
  const totalStaked = filtered.length * stake;
  const roi = totalStaked > 0 ? (profit / totalStaked) * 100 : 0;
  const winRate = filtered.length > 0 ? (won.length / filtered.length) * 100 : 0;

  // Per-sport breakdown for the active filter
  const sportMap = new Map<string, { won: number; lost: number; profit: number }>();
  for (const p of filtered) {
    const sport = (p.sports?.[0] ?? "?").toUpperCase();
    const e = sportMap.get(sport) ?? { won: 0, lost: 0, profit: 0 };
    if (p.status === "won") {
      e.won++;
      e.profit += stake * ((p.combined_decimal ?? 1) - 1);
    } else {
      e.lost++;
      e.profit -= stake;
    }
    sportMap.set(sport, e);
  }
  const bySport = Array.from(sportMap.entries())
    .map(([sport, d]) => ({
      sport,
      won: d.won,
      lost: d.lost,
      total: d.won + d.lost,
      profit: Math.round(d.profit * 100) / 100,
      winRate: d.won + d.lost > 0
        ? Math.round((d.won / (d.won + d.lost)) * 10000) / 100
        : 0,
    }))
    .sort((a, b) => b.profit - a.profit);

  // Per-leg-count breakdown
  const legMap = new Map<number, { won: number; lost: number; profit: number }>();
  for (const p of filtered) {
    const n = (p.legs ?? []).length;
    const e = legMap.get(n) ?? { won: 0, lost: 0, profit: 0 };
    if (p.status === "won") {
      e.won++;
      e.profit += stake * ((p.combined_decimal ?? 1) - 1);
    } else {
      e.lost++;
      e.profit -= stake;
    }
    legMap.set(n, e);
  }
  const byLegs = Array.from(legMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([n, d]) => ({
      legs: n,
      label: `${n}L`,
      won: d.won,
      lost: d.lost,
      total: d.won + d.lost,
      profit: Math.round(d.profit * 100) / 100,
      winRate: d.won + d.lost > 0
        ? Math.round((d.won / (d.won + d.lost)) * 10000) / 100
        : 0,
    }));

  return NextResponse.json({
    filters: { minEv, maxEv, minConf, maxConf, sports: sportsFilter, legs: legsFilter, stake },
    sample: {
      pulled: rows.length,
      matched: filtered.length,
    },
    summary: {
      won: won.length,
      lost: lost.length,
      winRate: Math.round(winRate * 100) / 100,
      totalStaked: Math.round(totalStaked * 100) / 100,
      profit: Math.round(profit * 100) / 100,
      roi: Math.round(roi * 100) / 100,
    },
    bySport,
    byLegs,
    timestamp: new Date().toISOString(),
  });
}
