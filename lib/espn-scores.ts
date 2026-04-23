// ─── ESPN Scoreboard Ingest ───────────────────────────────────────────────
// Free, unlimited, no API key. Fetches completed game scores per sport over
// a rolling window for Elo + team-record calculation.
//
// Used as a drop-in replacement for The Odds API /scores/ endpoint, which
// costs credits AND silently rejected daysFrom > 3 with HTTP 422 — every
// call returned empty, so the model's Elo/team-records/situational paths
// were all running on zero data until this shipped.

import type { GameScore } from "./sports-data";

// ESPN uses league paths under a sport root. Map our sport keys accordingly.
const ESPN_SPORT_PATH: Record<string, string> = {
  basketball_nba: "basketball/nba",
  americanfootball_nfl: "football/nfl",
  baseball_mlb: "baseball/mlb",
  icehockey_nhl: "hockey/nhl",
  americanfootball_ncaaf: "football/college-football",
  basketball_ncaab: "basketball/mens-college-basketball",
};

interface EspnCompetitor {
  homeAway?: "home" | "away";
  team?: { displayName?: string };
  score?: string;
}

interface EspnEvent {
  id?: string;
  date?: string;
  status?: { type?: { completed?: boolean } };
  competitions?: Array<{ competitors?: EspnCompetitor[] }>;
}

interface EspnScoreboardResponse {
  events?: EspnEvent[];
}

function yyyymmdd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

/**
 * Fetch ESPN scoreboard for one day. ESPN scoreboard defaults to today's
 * games when called with no date param; passing a date returns only games
 * on that date. Rolling window queries need per-day calls.
 */
async function fetchDay(
  sportPath: string,
  date: Date,
): Promise<EspnEvent[]> {
  const url =
    `https://site.api.espn.com/apis/site/v2/sports/${sportPath}/scoreboard` +
    `?dates=${yyyymmdd(date)}&limit=200`;
  try {
    // Next.js fetch cache: 6 hours. Scores don't change after finalization
    // so aggressive caching is safe and keeps us fast.
    const res = await fetch(url, { next: { revalidate: 21600 } });
    if (!res.ok) return [];
    const data: EspnScoreboardResponse = await res.json();
    return data.events ?? [];
  } catch {
    return [];
  }
}

/**
 * Pull the last `days` days of completed games for a sport and return them
 * in the GameScore shape sports-data.ts expects.
 *
 * Runs the per-day fetches in parallel. ESPN doesn't rate-limit us; only
 * concern is keeping the caller fast.
 */
export async function fetchRecentScoresFromEspn(
  oddsApiSportKey: string,
  days = 21,
): Promise<GameScore[]> {
  const sportPath = ESPN_SPORT_PATH[oddsApiSportKey];
  if (!sportPath) return [];

  const today = new Date();
  const dates: Date[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setUTCDate(today.getUTCDate() - i);
    dates.push(d);
  }

  const dayEventsArr = await Promise.all(dates.map((d) => fetchDay(sportPath, d)));
  const allEvents = dayEventsArr.flat();

  const games: GameScore[] = [];
  for (const ev of allEvents) {
    if (!ev.id || !ev.date) continue;
    const completed = ev.status?.type?.completed === true;
    const comp = ev.competitions?.[0];
    const competitors = comp?.competitors ?? [];
    const home = competitors.find((c) => c.homeAway === "home");
    const away = competitors.find((c) => c.homeAway === "away");
    if (!home?.team?.displayName || !away?.team?.displayName) continue;

    const scores =
      completed && home.score !== undefined && away.score !== undefined
        ? [
            { name: home.team.displayName, score: home.score },
            { name: away.team.displayName, score: away.score },
          ]
        : null;

    games.push({
      id: ev.id,
      home_team: home.team.displayName,
      away_team: away.team.displayName,
      scores,
      completed,
      commence_time: ev.date,
    });
  }

  return games;
}
