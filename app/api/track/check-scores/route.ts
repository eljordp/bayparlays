import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

const ODDS_API_KEY = process.env.ODDS_API_KEY;
const SCORES_BASE = "https://api.the-odds-api.com/v4/sports";

const SPORT_MAP: Record<string, string> = {
  NBA: "basketball_nba",
  NFL: "americanfootball_nfl",
  MLB: "baseball_mlb",
  UFC: "mma_mixed_martial_arts",
  NHL: "icehockey_nhl",
};

interface ScoreGame {
  id: string;
  sport_key: string;
  home_team: string;
  away_team: string;
  completed: boolean;
  scores:
    | { name: string; score: string }[]
    | null;
}

interface ParlayLeg {
  sport: string;
  game: string;
  pick: string;
  market: string;
  odds: number;
  book: string;
  impliedProb: number;
  edgeScore: number;
}

interface ParlayRow {
  id: string;
  created_at: string;
  legs: ParlayLeg[];
  payout: number;
  stake: number;
  sports: string[];
  status: string;
}

// Cache fetched scores per sport key to avoid duplicate API calls
const scoresCache = new Map<string, ScoreGame[]>();

async function fetchScores(sportKey: string): Promise<ScoreGame[]> {
  if (scoresCache.has(sportKey)) {
    return scoresCache.get(sportKey)!;
  }

  const url = `${SCORES_BASE}/${sportKey}/scores/?apiKey=${ODDS_API_KEY}&daysFrom=2`;
  const res = await fetch(url);

  if (!res.ok) {
    console.error(`Scores API error for ${sportKey}: ${res.status}`);
    scoresCache.set(sportKey, []);
    return [];
  }

  const data: ScoreGame[] = await res.json();
  scoresCache.set(sportKey, data);
  return data;
}

function normalizeTeam(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function findGame(scores: ScoreGame[], gameLabel: string): ScoreGame | null {
  // gameLabel is "Away Team vs Home Team"
  const parts = gameLabel.split(" vs ");
  if (parts.length < 2) return null;

  const awayNorm = normalizeTeam(parts[0]);
  const homeNorm = normalizeTeam(parts[1]);

  return (
    scores.find((g) => {
      const gHome = normalizeTeam(g.home_team);
      const gAway = normalizeTeam(g.away_team);
      // Match if team names are contained in either direction
      return (
        (gHome.includes(homeNorm) || homeNorm.includes(gHome)) &&
        (gAway.includes(awayNorm) || awayNorm.includes(gAway))
      );
    }) ?? null
  );
}

function getScores(game: ScoreGame): { home: number; away: number } | null {
  if (!game.scores || game.scores.length < 2) return null;

  const homeScore = game.scores.find(
    (s) => normalizeTeam(s.name) === normalizeTeam(game.home_team)
  );
  const awayScore = game.scores.find(
    (s) => normalizeTeam(s.name) === normalizeTeam(game.away_team)
  );

  if (!homeScore || !awayScore) return null;

  return {
    home: parseFloat(homeScore.score),
    away: parseFloat(awayScore.score),
  };
}

function didLegWin(
  leg: ParlayLeg,
  game: ScoreGame
): boolean | null {
  const scores = getScores(game);
  if (!scores) return null;

  const pick = leg.pick;

  if (leg.market === "moneyline") {
    // Pick format: "Team Name ML"
    const pickedTeam = pick.replace(/\s*ML$/i, "").trim();
    const pickedNorm = normalizeTeam(pickedTeam);
    const homeNorm = normalizeTeam(game.home_team);
    const awayNorm = normalizeTeam(game.away_team);

    const pickedHome =
      homeNorm.includes(pickedNorm) || pickedNorm.includes(homeNorm);
    const pickedAway =
      awayNorm.includes(pickedNorm) || pickedNorm.includes(awayNorm);

    if (pickedHome) return scores.home > scores.away;
    if (pickedAway) return scores.away > scores.home;
    return null;
  }

  if (leg.market === "spread") {
    // Pick format: "Team Name +/-X.X"
    const spreadMatch = pick.match(/^(.+?)\s+([+-]?\d+\.?\d*)$/);
    if (!spreadMatch) return null;

    const pickedTeam = spreadMatch[1].trim();
    const spread = parseFloat(spreadMatch[2]);
    const pickedNorm = normalizeTeam(pickedTeam);
    const homeNorm = normalizeTeam(game.home_team);

    const pickedHome =
      homeNorm.includes(pickedNorm) || pickedNorm.includes(homeNorm);

    let teamScore: number;
    let opponentScore: number;

    if (pickedHome) {
      teamScore = scores.home;
      opponentScore = scores.away;
    } else {
      teamScore = scores.away;
      opponentScore = scores.home;
    }

    return teamScore + spread > opponentScore;
  }

  if (leg.market === "total") {
    // Pick format: "Over X.X" or "Under X.X"
    const totalMatch = pick.match(/^(Over|Under)\s+(\d+\.?\d*)$/i);
    if (!totalMatch) return null;

    const direction = totalMatch[1].toLowerCase();
    const line = parseFloat(totalMatch[2]);
    const actualTotal = scores.home + scores.away;

    if (direction === "over") return actualTotal > line;
    return actualTotal < line;
  }

  return null;
}

export async function POST() {
  try {
    if (!ODDS_API_KEY) {
      return NextResponse.json(
        { error: "ODDS_API_KEY not configured" },
        { status: 500 }
      );
    }

    // Fetch pending parlays from last 48 hours
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - 48);

    const { data: pendingParlays, error } = await supabase
      .from("parlays")
      .select("*")
      .eq("status", "pending")
      .gte("created_at", cutoff.toISOString())
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Supabase query error:", error);
      return NextResponse.json(
        { error: "Failed to fetch pending parlays", details: error.message },
        { status: 500 }
      );
    }

    const rows = (pendingParlays ?? []) as ParlayRow[];

    if (rows.length === 0) {
      return NextResponse.json({
        message: "No pending parlays to check",
        updated: 0,
      });
    }

    // Collect all unique sport keys we need scores for
    const sportKeys = new Set<string>();
    for (const parlay of rows) {
      for (const sport of parlay.sports ?? []) {
        const key = SPORT_MAP[sport.toUpperCase()];
        if (key) sportKeys.add(key);
      }
    }

    // Fetch scores for all sports in parallel
    await Promise.all(
      Array.from(sportKeys).map((key) => fetchScores(key))
    );

    // Process each pending parlay
    const updates: { id: string; status: string; profit: number }[] = [];

    for (const parlay of rows) {
      const legs = parlay.legs;
      let allResolved = true;
      let anyLost = false;

      for (const leg of legs) {
        const sportKey = SPORT_MAP[leg.sport?.toUpperCase()];
        if (!sportKey) {
          allResolved = false;
          continue;
        }

        const scores = scoresCache.get(sportKey) ?? [];
        const game = findGame(scores, leg.game);

        if (!game || !game.completed) {
          allResolved = false;
          continue;
        }

        const result = didLegWin(leg, game);
        if (result === null) {
          allResolved = false;
          continue;
        }

        if (!result) {
          anyLost = true;
        }
      }

      if (!allResolved && !anyLost) continue;

      // If any leg lost, the whole parlay is lost (even if some legs unresolved)
      // If all resolved and none lost, it's a win
      const newStatus = anyLost ? "lost" : allResolved ? "won" : null;
      if (!newStatus) continue;

      const stake = parlay.stake ?? 100;
      const profit = newStatus === "won" ? parlay.payout - stake : -stake;

      const { error: updateError } = await supabase
        .from("parlays")
        .update({ status: newStatus, profit })
        .eq("id", parlay.id);

      if (updateError) {
        console.error(`Failed to update parlay ${parlay.id}:`, updateError);
        continue;
      }

      updates.push({ id: parlay.id, status: newStatus, profit });
    }

    // Clear the cache after processing
    scoresCache.clear();

    return NextResponse.json({
      message: `Checked ${rows.length} pending parlays`,
      updated: updates.length,
      results: updates,
    });
  } catch (error) {
    console.error("Check scores error:", error);
    scoresCache.clear();
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
