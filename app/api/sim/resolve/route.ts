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

    for (const parlay of pending) {
      const legs = parlay.legs || [];
      let allResolved = true;
      let anyLost = false;
      let allWon = true;

      for (const leg of legs) {
        const sportKey = SPORT_MAP[leg.sport?.toUpperCase()];
        if (!sportKey) { allResolved = false; continue; }

        const scores = scoresCache.get(sportKey) || [];
        const game = findGame(scores, leg.game);

        if (!game) {
          allResolved = false;
          allWon = false;
          continue;
        }

        const result = checkLegResult(leg, game);
        if (result === null) {
          allResolved = false;
          allWon = false;
        } else if (!result) {
          anyLost = true;
          allWon = false;
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

      // Update sim parlay
      await supabase
        .from("sim_parlays")
        .update({
          status: newStatus,
          profit,
          resolved_at: new Date().toISOString(),
        })
        .eq("id", parlay.id);

      // Update bankroll
      const { data: bankroll } = await supabase
        .from("sim_bankroll")
        .select("*")
        .eq("user_id", parlay.user_id)
        .single();

      if (bankroll) {
        if (newStatus === "won") {
          await supabase
            .from("sim_bankroll")
            .update({
              balance: bankroll.balance + parlay.payout,
              total_won: bankroll.total_won + parlay.payout,
              wins: bankroll.wins + 1,
              updated_at: new Date().toISOString(),
            })
            .eq("user_id", parlay.user_id);
          wins++;
        } else {
          await supabase
            .from("sim_bankroll")
            .update({
              total_lost: bankroll.total_lost + parlay.stake,
              losses: bankroll.losses + 1,
              updated_at: new Date().toISOString(),
            })
            .eq("user_id", parlay.user_id);
          losses++;
        }
      }

      resolved++;
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
