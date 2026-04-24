// ─── Live Game Status ─────────────────────────────────────────────────────
// Pulls today's scoreboard for a sport and returns each game's live state:
// upcoming (commence time), in-progress (period + clock + score), or final.
//
// Uses the same ESPN scoreboard endpoint as lib/espn-scores.ts, but returns
// richer status info (not just completed flag). No API key. Free, unlimited.

const SPORT_PATH: Record<string, string> = {
  NBA: "basketball/nba",
  WNBA: "basketball/wnba",
  NFL: "football/nfl",
  MLB: "baseball/mlb",
  NHL: "hockey/nhl",
  NCAAB: "basketball/mens-college-basketball",
  NCAAF: "football/college-football",
  MLS: "soccer/usa.1",
  EPL: "soccer/eng.1",
};

export interface GameStatus {
  // Normalized key for lookup: teams joined lowercase a-z0-9 only
  key: string;
  homeTeam: string;
  awayTeam: string;
  state: "pre" | "in" | "post";       // pre = not started, in = live, post = final
  statusDetail: string;               // "Final", "Top 7th", "Q3 5:42", "Scheduled"
  startsAt: string | null;            // ISO timestamp (pre)
  homeScore: number | null;
  awayScore: number | null;
  period: number | null;              // inning / quarter / period number
  displayClock: string | null;        // "5:42" (NBA) or null (MLB doesn't have clocks)
}

interface EspnCompetitor {
  homeAway?: "home" | "away";
  team?: { displayName?: string };
  score?: string | number;
}

interface EspnStatusType {
  state?: string;                  // "pre" | "in" | "post"
  completed?: boolean;
  detail?: string;                 // "Final", "Top 7th", etc.
  shortDetail?: string;
}

interface EspnStatus {
  type?: EspnStatusType;
  period?: number;
  displayClock?: string;
}

interface EspnEvent {
  id?: string;
  date?: string;
  name?: string;
  status?: EspnStatus;
  competitions?: Array<{ competitors?: EspnCompetitor[]; status?: EspnStatus }>;
}

interface EspnResponse {
  events?: EspnEvent[];
}

function yyyymmdd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

/** Normalize team pair to a lookup key. Matches sim leg `game` strings
 *  like "Boston Celtics vs Philadelphia 76ers". Order-insensitive. */
export function normalizeGameKey(teamA: string, teamB: string): string {
  const norm = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const [a, b] = [norm(teamA), norm(teamB)].sort();
  return `${a}__${b}`;
}

/**
 * Parse a "Home vs Away" or "Home @ Away" string into a normalized key
 * that matches what normalizeGameKey() produces.
 */
export function gameStringKey(game: string): string | null {
  const m = game.match(/^(.+?)\s+(?:vs|@|at)\s+(.+)$/i);
  if (!m) return null;
  return normalizeGameKey(m[1], m[2]);
}

async function fetchScoreboard(
  sport: string,
  date: Date,
): Promise<EspnEvent[]> {
  const path = SPORT_PATH[sport];
  if (!path) return [];
  const url =
    `https://site.api.espn.com/apis/site/v2/sports/${path}/scoreboard` +
    `?dates=${yyyymmdd(date)}&limit=200`;
  try {
    const res = await fetch(url, {
      // 60s cache — live games change every minute, but this keeps load sane
      next: { revalidate: 60 },
    });
    if (!res.ok) return [];
    const data: EspnResponse = await res.json();
    return data.events ?? [];
  } catch {
    return [];
  }
}

function parseEvent(ev: EspnEvent): GameStatus | null {
  const comp = ev.competitions?.[0];
  const competitors = comp?.competitors ?? [];
  const home = competitors.find((c) => c.homeAway === "home");
  const away = competitors.find((c) => c.homeAway === "away");
  if (!home?.team?.displayName || !away?.team?.displayName) return null;

  const status = comp?.status ?? ev.status;
  const stateRaw = status?.type?.state;
  const state: "pre" | "in" | "post" =
    stateRaw === "in" ? "in" : stateRaw === "post" ? "post" : "pre";

  const toNum = (v: string | number | undefined): number | null => {
    if (v === undefined || v === null) return null;
    const n = typeof v === "number" ? v : parseInt(v, 10);
    return Number.isFinite(n) ? n : null;
  };

  return {
    key: normalizeGameKey(home.team.displayName, away.team.displayName),
    homeTeam: home.team.displayName,
    awayTeam: away.team.displayName,
    state,
    statusDetail:
      status?.type?.detail ?? status?.type?.shortDetail ?? "Scheduled",
    startsAt: ev.date ?? null,
    homeScore: toNum(home.score),
    awayScore: toNum(away.score),
    period: status?.period ?? null,
    displayClock: status?.displayClock ?? null,
  };
}

/**
 * Fetch live status for every game happening today (and yesterday, to catch
 * late games that started yesterday ET but finish today UTC) across the
 * requested sports. Returns a Map keyed by normalizeGameKey for fast lookup.
 */
export async function getLiveGameStatuses(
  sports: string[],
): Promise<Map<string, GameStatus>> {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setUTCDate(today.getUTCDate() - 1);

  const all = await Promise.all(
    sports.flatMap((s) => [fetchScoreboard(s, today), fetchScoreboard(s, yesterday)]),
  );

  const map = new Map<string, GameStatus>();
  for (const events of all) {
    for (const ev of events) {
      const parsed = parseEvent(ev);
      if (!parsed) continue;
      // If a game appears twice (yesterday + today span) prefer "post" status
      const existing = map.get(parsed.key);
      if (!existing || existing.state !== "post") {
        map.set(parsed.key, parsed);
      }
    }
  }
  return map;
}
