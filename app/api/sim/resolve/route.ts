import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const ODDS_API_KEY = process.env.ODDS_API_KEY;
const SCORES_BASE = "https://api.the-odds-api.com/v4/sports";

const SPORT_MAP: Record<string, string> = {
  NBA: "basketball_nba",
  NFL: "americanfootball_nfl",
  MLB: "baseball_mlb",
  NHL: "icehockey_nhl",
  UFC: "mma_mixed_martial_arts",
};

interface GameScore {
  id: string;
  home_team: string;
  away_team: string;
  scores: { name: string; score: string }[] | null;
  completed: boolean;
}

// Cache scores per sport to avoid duplicate API calls
const scoresCache = new Map<string, GameScore[]>();

async function fetchScores(sportKey: string): Promise<GameScore[]> {
  if (scoresCache.has(sportKey)) return scoresCache.get(sportKey)!;
  if (!ODDS_API_KEY) return [];

  try {
    const res = await fetch(
      `${SCORES_BASE}/${sportKey}/scores/?apiKey=${ODDS_API_KEY}&daysFrom=3`,
      { next: { revalidate: 3600 } }
    );
    if (!res.ok) return [];
    const data: GameScore[] = await res.json();
    const completed = data.filter((g) => g.completed && g.scores);
    scoresCache.set(sportKey, completed);
    return completed;
  } catch {
    return [];
  }
}

function normalizeTeam(name: string): string {
  return name.toLowerCase().replace(/[^a-z]/g, "");
}

function findGame(scores: GameScore[], gameStr: string): GameScore | null {
  // gameStr is like "Portland Trail Blazers vs San Antonio Spurs"
  const parts = gameStr.split(" vs ");
  if (parts.length < 2) return null;

  const team1 = normalizeTeam(parts[0]);
  const team2 = normalizeTeam(parts[1]);

  return (
    scores.find((g) => {
      const home = normalizeTeam(g.home_team);
      const away = normalizeTeam(g.away_team);
      return (
        (home.includes(team1) || team1.includes(home) || away.includes(team1) || team1.includes(away)) &&
        (home.includes(team2) || team2.includes(home) || away.includes(team2) || team2.includes(away))
      );
    }) || null
  );
}

function checkLegResult(
  leg: { pick: string; odds: number; sport: string; game: string },
  game: GameScore
): boolean | null {
  if (!game.scores || game.scores.length < 2) return null;

  const homeScore = parseInt(game.scores.find((s) => s.name === game.home_team)?.score || "0");
  const awayScore = parseInt(game.scores.find((s) => s.name === game.away_team)?.score || "0");

  const pick = leg.pick;

  // Moneyline: "Team ML"
  if (pick.endsWith(" ML")) {
    const teamName = pick.replace(" ML", "");
    const teamNorm = normalizeTeam(teamName);
    const homeNorm = normalizeTeam(game.home_team);
    const awayNorm = normalizeTeam(game.away_team);

    const isHome = homeNorm.includes(teamNorm) || teamNorm.includes(homeNorm);
    const isAway = awayNorm.includes(teamNorm) || teamNorm.includes(awayNorm);

    if (isHome) return homeScore > awayScore;
    if (isAway) return awayScore > homeScore;
    return null;
  }

  // Spread: "Team -3.5" or "Team +3.5"
  const spreadMatch = pick.match(/^(.+?)\s+([+-]?\d+\.?\d*)$/);
  if (spreadMatch) {
    const teamName = spreadMatch[1].trim();
    const spread = parseFloat(spreadMatch[2]);
    const teamNorm = normalizeTeam(teamName);
    const homeNorm = normalizeTeam(game.home_team);

    const isHome = homeNorm.includes(teamNorm) || teamNorm.includes(homeNorm);
    const teamScore = isHome ? homeScore : awayScore;
    const oppScore = isHome ? awayScore : homeScore;

    return teamScore + spread > oppScore;
  }

  // Totals: "Over 210.5" or "Under 210.5"
  const totalMatch = pick.match(/^(Over|Under)\s+(\d+\.?\d*)$/);
  if (totalMatch) {
    const direction = totalMatch[1];
    const line = parseFloat(totalMatch[2]);
    const total = homeScore + awayScore;

    return direction === "Over" ? total > line : total < line;
  }

  return null;
}

export async function GET() {
  try {
    // Fetch all pending sim parlays (no 24h cutoff — resolve as soon as games finish)
    const { data: pending, error } = await supabase
      .from("sim_parlays")
      .select("*")
      .eq("status", "pending");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!pending || pending.length === 0) {
      return NextResponse.json({ resolved: 0, message: "No pending sim parlays" });
    }

    // Collect all sports we need scores for
    const sportKeys = new Set<string>();
    for (const parlay of pending) {
      for (const leg of parlay.legs || []) {
        const key = SPORT_MAP[leg.sport?.toUpperCase()];
        if (key) sportKeys.add(key);
      }
    }

    // Fetch scores for all sports
    await Promise.all(Array.from(sportKeys).map(fetchScores));

    let resolved = 0;
    let wins = 0;
    let losses = 0;
    let stillPending = 0;

    // Collect bankroll deltas per user across ALL parlays in this batch, then
    // apply ONE bankroll update per user at the end. The previous pattern
    // read-modify-write'd the bankroll row inside the per-parlay loop, which
    // races badly when the resolver is invoked concurrently (Vercel
    // serverless can spawn multiple instances). Losing an update silently
    // means the UI shows stale wins/losses/balance forever.
    type Delta = { balance: number; total_won: number; total_lost: number; wins: number; losses: number };
    const userDeltas = new Map<string, Delta>();
    const getDelta = (uid: string): Delta => {
      let d = userDeltas.get(uid);
      if (!d) {
        d = { balance: 0, total_won: 0, total_lost: 0, wins: 0, losses: 0 };
        userDeltas.set(uid, d);
      }
      return d;
    };

    for (const parlay of pending) {
      const legs = parlay.legs || [];
      let allResolved = true;
      let anyLost = false;
      let allWon = true;
      // Track per-leg outcomes so /my-stats can compute per-leg hit rate
      // (decoupled from parlay-level hit rate — a 30% parlay record with
      // 65% per-leg hit rate tells the user "your picks are mostly right,
      // the parlay format is what's eating you").
      let legsWon = 0;
      let legsLost = 0;
      // Per-leg outcome array (true=won, false=lost, null=ungraded). Stored
      // alongside the aggregate counts so the calibration job can do
      // per-market accuracy analysis instead of just parlay-level.
      const legResults: (boolean | null)[] = [];

      for (const leg of legs) {
        const sportKey = SPORT_MAP[leg.sport?.toUpperCase()];
        if (!sportKey) {
          allResolved = false;
          legResults.push(null);
          continue;
        }

        const scores = scoresCache.get(sportKey) || [];
        const game = findGame(scores, leg.game);

        if (!game) {
          allResolved = false;
          allWon = false;
          legResults.push(null);
          continue;
        }

        const result = checkLegResult(leg, game);
        if (result === null) {
          allResolved = false;
          allWon = false;
          legResults.push(null);
        } else if (!result) {
          anyLost = true;
          allWon = false;
          legsLost++;
          legResults.push(false);
        } else {
          legsWon++;
          legResults.push(true);
        }
      }

      // Determine outcome
      let newStatus: string | null = null;
      if (anyLost) {
        newStatus = "lost"; // Any leg lost = parlay lost
      } else if (allResolved && allWon) {
        newStatus = "won"; // All legs resolved and won
      }
      // else: still pending (not all games finished yet)

      if (!newStatus) {
        stillPending++;
        continue;
      }

      const profit = newStatus === "won" ? parlay.payout - parlay.stake : -parlay.stake;

      // CONDITIONAL UPDATE — only flip to won/lost if the row is still
      // pending. If a concurrent invocation of the resolver got here first,
      // the row will no longer match `status=pending` and Supabase returns
      // zero rows, so we skip the bankroll delta entirely. This is the
      // guardrail that prevents double-counting: a parlay's bankroll delta
      // is applied exactly once, by whichever resolver won the race.
      const { data: flipped, error: flipErr } = await supabase
        .from("sim_parlays")
        .update({
          status: newStatus,
          profit,
          resolved_at: new Date().toISOString(),
          legs_won: legsWon,
          legs_lost: legsLost,
          legs_total: legs.length,
          leg_results: legResults,
        })
        .eq("id", parlay.id)
        .eq("status", "pending")
        .select("id");

      if (flipErr) {
        console.error(`sim_parlays update error for ${parlay.id}:`, flipErr);
        continue;
      }
      if (!flipped || flipped.length === 0) {
        // Another resolver instance already resolved this parlay. Don't
        // double-count against the bankroll.
        continue;
      }

      // Accumulate bankroll delta for this user.
      const d = getDelta(parlay.user_id);
      if (newStatus === "won") {
        d.balance += parlay.payout;
        d.total_won += parlay.payout;
        d.wins += 1;
        wins++;
      } else {
        // Balance was already debited on bet placement; no balance change on loss.
        d.total_lost += parlay.stake;
        d.losses += 1;
        losses++;
      }

      resolved++;
    }

    // Apply deltas — one read + one update per user instead of per-parlay.
    // Still a theoretical race vs a concurrent resolver, but we collapse the
    // window dramatically, and the backfill-from-sim_parlays script can
    // reconcile if needed.
    for (const [userId, delta] of userDeltas) {
      const { data: bankroll } = await supabase
        .from("sim_bankroll")
        .select("*")
        .eq("user_id", userId)
        .single();
      if (!bankroll) continue;
      const { error: updErr } = await supabase
        .from("sim_bankroll")
        .update({
          balance: bankroll.balance + delta.balance,
          total_won: bankroll.total_won + delta.total_won,
          total_lost: bankroll.total_lost + delta.total_lost,
          wins: bankroll.wins + delta.wins,
          losses: bankroll.losses + delta.losses,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);
      if (updErr) {
        console.error(`Failed to update sim_bankroll for ${userId}:`, updErr);
      }
    }

    scoresCache.clear();

    return NextResponse.json({
      resolved,
      wins,
      losses,
      stillPending,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    scoresCache.clear();
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
