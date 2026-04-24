// ─── ESPN Rest Days (free) ─────────────────────────────────────────────────
// Pulls ESPN's scoreboard for the trailing 7 days and indexes each team's
// most recent completed game. Callers compute days-of-rest at lookup time
// against the upcoming game's commence_time.
//
// Why it matters (NBA/NHL playoffs especially): a team on a back-to-back
// facing a team with 3 days of rest is a measurable disadvantage. This is
// the data layer; the confidence-bias pipeline consumes it.

export type LastGameMap = Map<string, string>; // teamDisplayName -> ISO date of last completed game

const PATHS: Record<string, string> = {
  nba: "basketball/nba",
  nhl: "hockey/nhl",
};

const TTL_MS = 60 * 60 * 1000; // 1 hour — completed games don't change
const cache = new Map<string, { map: LastGameMap; fetchedAt: number }>();

type RawCompetitor = { team?: { displayName?: string } };
type RawCompetition = {
  status?: { type?: { name?: string } };
  competitors?: RawCompetitor[];
};
type RawEvent = { date?: string; competitions?: RawCompetition[] };
type RawResponse = { events?: RawEvent[] };

function fmtDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

export async function fetchLastGames(sport: string): Promise<LastGameMap> {
  const sportKey = sport.toLowerCase();
  const path = PATHS[sportKey];
  if (!path) return new Map();

  const cached = cache.get(sportKey);
  if (cached && Date.now() - cached.fetchedAt < TTL_MS) {
    return cached.map;
  }

  const now = new Date();
  const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const end = new Date(now.getTime() + 24 * 60 * 60 * 1000); // include live/starting-today games
  const url = `https://site.api.espn.com/apis/site/v2/sports/${path}/scoreboard?dates=${fmtDate(start)}-${fmtDate(end)}`;

  const map: LastGameMap = new Map();

  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return cached?.map || map;
    const data = (await res.json()) as RawResponse;

    for (const ev of data.events || []) {
      const dateIso = ev.date;
      if (!dateIso) continue;
      const comp = ev.competitions?.[0];
      if (!comp) continue;
      // Only count completed games as "last played"
      const statusName = comp.status?.type?.name || "";
      const isCompleted =
        statusName === "STATUS_FINAL" || statusName === "STATUS_FULL_TIME";
      if (!isCompleted) continue;

      for (const c of comp.competitors || []) {
        const team = c.team?.displayName;
        if (!team) continue;
        const existing = map.get(team);
        if (!existing || new Date(dateIso).getTime() > new Date(existing).getTime()) {
          map.set(team, dateIso);
        }
      }
    }

    cache.set(sportKey, { map, fetchedAt: Date.now() });
    return map;
  } catch {
    return cached?.map || map;
  }
}

export interface RestInfo {
  daysSinceLastGame: number;  // whole days between last game date and current game date (UTC)
  b2b: boolean;               // 0 or 1 calendar days = B2B
  lastGameDate: string | null;
}

export function computeRest(
  lastGameIso: string | null | undefined,
  upcomingGameIso: string,
): RestInfo {
  if (!lastGameIso) return { daysSinceLastGame: -1, b2b: false, lastGameDate: null };
  const last = new Date(lastGameIso);
  const upcoming = new Date(upcomingGameIso);
  if (!Number.isFinite(last.getTime()) || !Number.isFinite(upcoming.getTime())) {
    return { daysSinceLastGame: -1, b2b: false, lastGameDate: null };
  }
  // UTC-calendar-day diff — treats any two games on different UTC dates as
  // at least 1 day apart. Good enough for rest-day semantics across leagues.
  const lastDay = Date.UTC(last.getUTCFullYear(), last.getUTCMonth(), last.getUTCDate());
  const upDay = Date.UTC(
    upcoming.getUTCFullYear(),
    upcoming.getUTCMonth(),
    upcoming.getUTCDate(),
  );
  const days = Math.round((upDay - lastDay) / (24 * 60 * 60 * 1000));
  return {
    daysSinceLastGame: days,
    b2b: days <= 1,
    lastGameDate: lastGameIso,
  };
}

// Fuzzy team-name lookup — Odds API names don't always match ESPN exactly.
// Normalizes accents (é→e) and strips non-letters so "Montréal Canadiens"
// matches "Montreal Canadiens" across feeds.
function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

export function lookupLastGame(
  oddsTeamName: string,
  map: LastGameMap,
): string | null {
  if (!oddsTeamName) return null;
  const exact = map.get(oddsTeamName);
  if (exact) return exact;
  const norm = normalize(oddsTeamName);
  for (const [key, val] of map) {
    const keyNorm = normalize(key);
    if (keyNorm === norm) return val;
    if (keyNorm.endsWith(norm) || norm.endsWith(keyNorm)) return val;
  }
  return null;
}

// Format a compact note describing both teams' rest. Returns null if neither
// team has a meaningful difference (both normal rest).
export function formatRestNote(
  homeTeam: string,
  awayTeam: string,
  map: LastGameMap,
  commenceTimeIso: string,
): string | null {
  const homeRest = computeRest(lookupLastGame(homeTeam, map), commenceTimeIso);
  const awayRest = computeRest(lookupLastGame(awayTeam, map), commenceTimeIso);

  // Skip if we have no data for either team
  if (homeRest.daysSinceLastGame < 0 && awayRest.daysSinceLastGame < 0) return null;

  const label = (t: string, r: RestInfo) => {
    if (r.daysSinceLastGame < 0) return `${t}: rest unknown`;
    if (r.b2b) return `${t}: B2B (${r.daysSinceLastGame}d rest)`;
    return `${t}: ${r.daysSinceLastGame}d rest`;
  };

  // Only surface if there's a notable rest disparity or at least one B2B.
  const notable =
    homeRest.b2b ||
    awayRest.b2b ||
    Math.abs(homeRest.daysSinceLastGame - awayRest.daysSinceLastGame) >= 2;
  if (!notable) return null;

  return `${label(awayTeam, awayRest)} · ${label(homeTeam, homeRest)}`;
}
