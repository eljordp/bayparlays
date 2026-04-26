import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ─── Resolves pending research_parlays against actual game scores. ──────────
//
// Mirror of /api/sim/resolve but pointed at the research_parlays table — the
// 500-rows-per-scan top-EV combos the brute-force scanner persists 2x/day.
//
// Without this, research_parlays accumulates predictions but nothing ever
// grades them, so the calibration job has nothing to learn from. Each run
// of this endpoint flips status from "pending" → "won"/"lost" + populates
// legs_won, legs_lost, leg_results so v2 calibration can do per-market
// accuracy analysis.
//
// Triggered by .github/workflows/resolve-research.yml every 6 hours.
// Safe to call manually: GET /api/cron/resolve-research (auth: Bearer $CRON_SECRET).

const ODDS_API_KEY = process.env.ODDS_API_KEY;
const SCORES_BASE = "https://api.the-odds-api.com/v4/sports";

const SPORT_MAP: Record<string, string> = {
  NBA: "basketball_nba",
  nba: "basketball_nba",
  NFL: "americanfootball_nfl",
  nfl: "americanfootball_nfl",
  MLB: "baseball_mlb",
  mlb: "baseball_mlb",
  NHL: "icehockey_nhl",
  nhl: "icehockey_nhl",
  NCAAB: "basketball_ncaab",
  ncaab: "basketball_ncaab",
  NCAAF: "americanfootball_ncaaf",
  ncaaf: "americanfootball_ncaaf",
};

interface GameScore {
  id: string;
  home_team: string;
  away_team: string;
  scores: { name: string; score: string }[] | null;
  completed: boolean;
}

const scoresCache = new Map<string, GameScore[]>();

async function fetchScores(sportKey: string): Promise<GameScore[]> {
  if (scoresCache.has(sportKey)) return scoresCache.get(sportKey)!;
  if (!ODDS_API_KEY) return [];
  try {
    const res = await fetch(
      `${SCORES_BASE}/${sportKey}/scores/?apiKey=${ODDS_API_KEY}&daysFrom=3`,
      { next: { revalidate: 3600 } },
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
  leg: { pick: string; sport: string; game?: string },
  game: GameScore,
): boolean | null {
  if (!game.scores || game.scores.length < 2) return null;
  const homeScore = parseInt(
    game.scores.find((s) => s.name === game.home_team)?.score || "0",
  );
  const awayScore = parseInt(
    game.scores.find((s) => s.name === game.away_team)?.score || "0",
  );
  const pick = leg.pick;

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

  const totalMatch = pick.match(/^(Over|Under)\s+(\d+\.?\d*)$/);
  if (totalMatch) {
    const direction = totalMatch[1];
    const line = parseFloat(totalMatch[2]);
    const total = homeScore + awayScore;
    return direction === "Over" ? total > line : total < line;
  }

  return null;
}

interface ResearchParlayRow {
  id: string;
  status: string;
  legs: Array<{ sport: string; pick: string; commenceTime?: string; game?: string; gameId?: string }>;
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

  const { data: pending, error } = await supabase
    .from("research_parlays")
    .select("id, status, legs")
    .eq("status", "pending")
    .limit(2000);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!pending || pending.length === 0) {
    return NextResponse.json({ resolved: 0, message: "no pending research parlays" });
  }

  // Pre-fetch scores once per sport across all parlays (caches in-process).
  const sportKeys = new Set<string>();
  for (const p of pending as ResearchParlayRow[]) {
    for (const leg of p.legs || []) {
      const k = SPORT_MAP[leg.sport];
      if (k) sportKeys.add(k);
    }
  }
  await Promise.all(Array.from(sportKeys).map(fetchScores));

  let resolved = 0;
  let wins = 0;
  let losses = 0;
  let stillPending = 0;

  for (const parlay of pending as ResearchParlayRow[]) {
    const legs = parlay.legs || [];
    let allResolved = true;
    let anyLost = false;
    let allWon = true;
    let legsWon = 0;
    let legsLost = 0;
    const legResults: (boolean | null)[] = [];

    for (const leg of legs) {
      const sportKey = SPORT_MAP[leg.sport];
      // research_parlays don't always store leg.game (the human-readable
      // string used by the resolver). If we don't have it, we can't grade.
      if (!sportKey || !leg.game) {
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

    let newStatus: string | null = null;
    if (anyLost) newStatus = "lost";
    else if (allResolved && allWon) newStatus = "won";

    if (!newStatus) {
      stillPending++;
      continue;
    }

    const { error: flipErr } = await supabase
      .from("research_parlays")
      .update({
        status: newStatus,
        resolved_at: new Date().toISOString(),
        legs_won: legsWon,
        legs_lost: legsLost,
        leg_results: legResults,
      })
      .eq("id", parlay.id)
      .eq("status", "pending");

    if (flipErr) {
      console.error(`research_parlays update error for ${parlay.id}:`, flipErr);
      continue;
    }

    if (newStatus === "won") wins++;
    else losses++;
    resolved++;
  }

  scoresCache.clear();

  return NextResponse.json({
    pendingChecked: pending.length,
    resolved,
    wins,
    losses,
    stillPending,
    timestamp: new Date().toISOString(),
  });
}
