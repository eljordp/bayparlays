// ─── Sports Data Helper ─────────────────────────────────────────────────────
// Pulls recent game results for Elo + team-record calculation.
//
// Primary source: ESPN scoreboard (free, unlimited, no key). Covers last
// 21 days for a proper Elo base. Falls back to The Odds API /scores/ only
// if ESPN returns nothing — and even then, capped at daysFrom=3 which is
// the free-tier ceiling (anything higher silently 422s).

import { fetchRecentScoresFromEspn } from "./espn-scores";

const ODDS_API_KEY = process.env.ODDS_API_KEY;
const BASE = "https://api.the-odds-api.com/v4/sports";

export const SPORT_MAP: Record<string, string> = {
  nba: "basketball_nba",
  nfl: "americanfootball_nfl",
  mlb: "baseball_mlb",
  nhl: "icehockey_nhl",
  ncaaf: "americanfootball_ncaaf",
  ncaab: "basketball_ncaab",
  soccer: "soccer_epl",
  ufc: "mma_mixed_martial_arts",
};

export interface GameScore {
  id: string;
  home_team: string;
  away_team: string;
  scores: { name: string; score: string }[] | null;
  completed: boolean;
  commence_time: string;
}

export interface TeamRecord {
  team: string;
  wins: number;
  losses: number;
  winRate: number;
  homeWins: number;
  homeLosses: number;
  awayWins: number;
  awayLosses: number;
  lastFive: ("W" | "L")[];
  streak: { type: "W" | "L"; count: number };
}

// ─── In-Memory Cache ────────────────────────────────────────────────────────
// Caches scores for 1 hour to avoid burning API requests.

const scoresCache: Map<string, { data: GameScore[]; expires: number }> =
  new Map();

const recordsCache: Map<string, { data: Map<string, TeamRecord>; expires: number }> =
  new Map();

// ─── Fetch Recent Scores ────────────────────────────────────────────────────

export async function getRecentScores(
  sportKey: string
): Promise<GameScore[]> {
  const cached = scoresCache.get(sportKey);
  if (cached && cached.expires > Date.now()) return cached.data;

  // ── Primary: ESPN scoreboard ──────────────────────────────────────────
  // Free, unlimited, covers 21 days which is enough for Elo convergence.
  try {
    const espnGames = await fetchRecentScoresFromEspn(sportKey, 21);
    const completed = espnGames.filter((g) => g.completed && g.scores);
    if (completed.length > 0) {
      scoresCache.set(sportKey, {
        data: completed,
        expires: Date.now() + 6 * 3600000, // 6 hours
      });
      return completed;
    }
  } catch (err) {
    console.warn(`ESPN scores failed for ${sportKey}, falling back:`, err);
  }

  // ── Fallback: The Odds API /scores/ ───────────────────────────────────
  // Capped at daysFrom=3 (free-tier ceiling; anything higher returns 422).
  // Burns a few credits per call — only hit this if ESPN is unreachable.
  if (!ODDS_API_KEY) return [];

  try {
    const res = await fetch(
      `${BASE}/${sportKey}/scores/?apiKey=${ODDS_API_KEY}&daysFrom=3`,
      { next: { revalidate: 3600 } } // Next.js fetch cache: 1 hour
    );
    if (!res.ok) return [];

    const data: GameScore[] = await res.json();
    const completed = data.filter((g) => g.completed && g.scores);

    scoresCache.set(sportKey, {
      data: completed,
      expires: Date.now() + 3600000, // 1 hour
    });

    return completed;
  } catch {
    return [];
  }
}

// ─── Build Team Records ─────────────────────────────────────────────────────

export function buildTeamRecords(
  games: GameScore[]
): Map<string, TeamRecord> {
  const records = new Map<string, TeamRecord>();

  function getOrCreate(team: string): TeamRecord {
    if (!records.has(team)) {
      records.set(team, {
        team,
        wins: 0,
        losses: 0,
        winRate: 0,
        homeWins: 0,
        homeLosses: 0,
        awayWins: 0,
        awayLosses: 0,
        lastFive: [],
        streak: { type: "W", count: 0 },
      });
    }
    return records.get(team)!;
  }

  // Sort by date ascending so lastFive / streak are chronological
  const sorted = [...games].sort(
    (a, b) =>
      new Date(a.commence_time).getTime() -
      new Date(b.commence_time).getTime()
  );

  for (const game of sorted) {
    if (!game.scores || game.scores.length < 2) continue;

    const homeScore = parseInt(
      game.scores.find((s) => s.name === game.home_team)?.score || "0"
    );
    const awayScore = parseInt(
      game.scores.find((s) => s.name === game.away_team)?.score || "0"
    );

    const homeWon = homeScore > awayScore;

    const homeRec = getOrCreate(game.home_team);
    const awayRec = getOrCreate(game.away_team);

    if (homeWon) {
      homeRec.wins++;
      homeRec.homeWins++;
      awayRec.losses++;
      awayRec.awayLosses++;
      homeRec.lastFive.push("W");
      awayRec.lastFive.push("L");
    } else {
      homeRec.losses++;
      homeRec.homeLosses++;
      awayRec.wins++;
      awayRec.awayWins++;
      homeRec.lastFive.push("L");
      awayRec.lastFive.push("W");
    }
  }

  // Calculate final stats
  for (const rec of records.values()) {
    const total = rec.wins + rec.losses;
    rec.winRate = total > 0 ? rec.wins / total : 0.5;
    rec.lastFive = rec.lastFive.slice(-5);

    // Calculate streak from most recent game backward
    const streakType: "W" | "L" =
      rec.lastFive[rec.lastFive.length - 1] || "W";
    let streakCount = 0;
    for (let i = rec.lastFive.length - 1; i >= 0; i--) {
      if (rec.lastFive[i] === streakType) streakCount++;
      else break;
    }
    rec.streak = { type: streakType, count: streakCount };
  }

  return records;
}

// ─── Get Cached Team Records ────────────────────────────────────────────────
// Convenience: fetch scores + build records in one call, with caching.

export async function getTeamRecords(
  sportKey: string
): Promise<Map<string, TeamRecord>> {
  const cached = recordsCache.get(sportKey);
  if (cached && cached.expires > Date.now()) return cached.data;

  const scores = await getRecentScores(sportKey);
  const records = buildTeamRecords(scores);

  recordsCache.set(sportKey, {
    data: records,
    expires: Date.now() + 3600000, // 1 hour
  });

  return records;
}

// ─── Normalized Game Rows ───────────────────────────────────────────────────
// Raw shape used by Elo + Situational models. Flattens the Odds API scores
// array into plain numbers so downstream models don't re-parse strings.

export interface NormalizedGame {
  date: string;
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
  completed: boolean;
}

export function normalizeGames(games: GameScore[]): NormalizedGame[] {
  const out: NormalizedGame[] = [];
  for (const g of games) {
    if (!g.completed || !g.scores || g.scores.length < 2) continue;
    const homeScore = parseInt(
      g.scores.find((s) => s.name === g.home_team)?.score || "0",
      10
    );
    const awayScore = parseInt(
      g.scores.find((s) => s.name === g.away_team)?.score || "0",
      10
    );
    out.push({
      date: g.commence_time,
      home: g.home_team,
      away: g.away_team,
      homeScore,
      awayScore,
      completed: g.completed,
    });
  }
  return out;
}

// ─── Team Edge Scoring ──────────────────────────────────────────────────────
// Returns a confidence adjustment (-30 to +30 range) based on team performance.

export function getTeamEdge(
  teamName: string,
  records: Map<string, TeamRecord>,
  isHome: boolean
): number {
  const rec = records.get(teamName);
  if (!rec) return 0;

  let edge = 0;

  // Win rate factor: above .500 = positive, below = negative
  edge += (rec.winRate - 0.5) * 20;

  // Home/away split factor
  if (isHome) {
    const homeTotal = rec.homeWins + rec.homeLosses;
    const homeRate = homeTotal > 0 ? rec.homeWins / homeTotal : 0.5;
    edge += (homeRate - 0.5) * 10;
  } else {
    const awayTotal = rec.awayWins + rec.awayLosses;
    const awayRate = awayTotal > 0 ? rec.awayWins / awayTotal : 0.5;
    edge += (awayRate - 0.5) * 10;
  }

  // Streak factor (capped at +/- 10)
  if (rec.streak.type === "W") {
    edge += Math.min(rec.streak.count * 2, 10);
  } else {
    edge -= Math.min(rec.streak.count * 2, 10);
  }

  // Recent form: last 5 games
  const recentWins = rec.lastFive.filter((r) => r === "W").length;
  edge += (recentWins - 2.5) * 4;

  return edge;
}
