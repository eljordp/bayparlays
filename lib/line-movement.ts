// Line movement detection.
//
// The line_history table snapshots best odds per (game_id, market, team) every
// time /api/parlays runs against a sport. Sharp money typically moves lines
// early (sharps bet within hours of opening); public money moves late. Tracking
// the delta between earliest snapshot and current best odds tells us which
// direction money is flowing.
//
// Convention used here: "favorable movement" = line shortened on our pick.
// Example: Yankees ML opened +130, current is +110 → line shortened by 20pts
// → market is more confident in Yankees → that's a buy signal even though
// our +110 price is now worse than where it opened.
//
// We only treat movement >= 5pts (American odds) as signal. Smaller moves are
// noise from book-to-book variance.

import { createClient } from "@supabase/supabase-js";

export interface LineMovement {
  gameId: string;
  market: string;
  team: string;
  point: number | null;
  openOdds: number;
  currentOdds: number;
  // American-odds delta. Positive = line drifted toward underdog/longshot.
  // Negative = line shortened (more confident).
  deltaAmerican: number;
  // Direction relative to backing this side at *current* price:
  //   "shorten" — market got more confident in this side (buy signal)
  //   "drift" — market got less confident in this side (sell signal)
  //   "noise" — too small to count
  signal: "shorten" | "drift" | "noise";
  // Recommended confidence bias (decimal), capped ±0.025.
  bias: number;
  reason: string | null;
}

const SIGNIFICANCE_THRESHOLD = 5; // American-odds points
const MAX_BIAS = 0.025;

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function gameMarketTeamKey(gameId: string, market: string, team: string, point?: number | null): string {
  const p = point != null ? point.toString() : "_";
  return `${gameId}::${market.toLowerCase()}::${team.toLowerCase()}::${p}`;
}

// Compute how much the line shortened (negative delta = shortened toward
// confidence on this side) or drifted (positive delta = drift toward
// underdog).
function computeMovement(open: number, current: number): number {
  // Both odds are American. Convert to "implied probability points" so
  // we get a unit-comparable signal regardless of whether prices are
  // negative (favorites) or positive (underdogs).
  const impProb = (odds: number) =>
    odds > 0 ? 100 / (odds + 100) : Math.abs(odds) / (Math.abs(odds) + 100);
  // Positive when current implies higher prob than open (line shortened).
  const probDelta = impProb(current) - impProb(open);
  // Convert back to "American odds points" loosely — multiply by 200
  // so a 5pp prob shift ~= 10 odds points.
  return probDelta * 200;
}

export async function fetchLineMovements(gameIds: string[]): Promise<Map<string, LineMovement>> {
  const out = new Map<string, LineMovement>();
  if (gameIds.length === 0) return out;
  const sb = adminClient();
  if (!sb) return out;

  // Pull every line_history row for these games. Could be hundreds of
  // snapshots per game over several days — bounded query window of 5 days
  // keeps the result set sane.
  const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await sb
    .from("line_history")
    .select("game_id, market, team, point, best_odds, captured_at")
    .in("game_id", gameIds)
    .gte("captured_at", fiveDaysAgo)
    .order("captured_at", { ascending: true });
  if (error || !data) return out;

  // Group by (game_id, market, team, point) and find earliest + latest.
  type Row = { best_odds: number; captured_at: string };
  const groups = new Map<string, { first: Row; last: Row; gameId: string; market: string; team: string; point: number | null }>();
  for (const r of data) {
    const key = gameMarketTeamKey(r.game_id, r.market, r.team, r.point);
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, {
        first: { best_odds: r.best_odds, captured_at: r.captured_at },
        last: { best_odds: r.best_odds, captured_at: r.captured_at },
        gameId: r.game_id,
        market: r.market,
        team: r.team,
        point: r.point,
      });
    } else {
      existing.last = { best_odds: r.best_odds, captured_at: r.captured_at };
    }
  }

  for (const [key, g] of groups.entries()) {
    const open = g.first.best_odds;
    const current = g.last.best_odds;
    if (open === current) continue; // no movement at all

    const deltaAmerican = Math.round(computeMovement(open, current) * 10) / 10;
    let signal: LineMovement["signal"];
    let bias = 0;
    let reason: string | null = null;

    if (Math.abs(deltaAmerican) < SIGNIFICANCE_THRESHOLD / 10) {
      signal = "noise";
    } else if (deltaAmerican > 0) {
      // Line shortened on this side — market got more confident in it
      signal = "shorten";
      bias = Math.min(MAX_BIAS, deltaAmerican * 0.001);
      reason = `Line shortened ${open}→${current} (sharp +${deltaAmerican.toFixed(1)}bp)`;
    } else {
      // Line drifted away from this side
      signal = "drift";
      bias = Math.max(-MAX_BIAS, deltaAmerican * 0.001);
      reason = `Line drifted ${open}→${current} (drop ${deltaAmerican.toFixed(1)}bp)`;
    }

    out.set(key, {
      gameId: g.gameId,
      market: g.market,
      team: g.team,
      point: g.point,
      openOdds: open,
      currentOdds: current,
      deltaAmerican,
      signal,
      bias,
      reason,
    });
  }

  return out;
}

export function findLineMovement(
  movements: Map<string, LineMovement>,
  gameId: string,
  market: string,
  team: string,
  point?: number | null,
): LineMovement | null {
  return movements.get(gameMarketTeamKey(gameId, market, team, point)) ?? null;
}
