// ─── ESPN Soccer Stats Helper ────────────────────────────────────────────────
// Pulls MLS and EPL player season stats from ESPN's public core API.
//
// NOTE: Unlike NBA/MLB/NHL/NFL, the `site.web.api.espn.com/.../byathlete`
// endpoint does NOT return soccer data (it only returns the `currentSeason`
// envelope with no athletes). Instead we use the core-API `leaders` endpoint
// which returns per-category top-N players, then fetch each unique athlete's
// aggregated stats once. This costs more HTTP calls than the byathlete route
// but is still cheap: ~25–40 unique athletes × 2 fetches (athlete + stats)
// with concurrency, cached 6h. ESPN's core API is free + unlimited.
//
// Season labels (as ESPN uses them):
//   - MLS (soccer/usa.1): single-year labels tied to calendar year. 2026 is
//     the current season as of Apr 2026.
//   - EPL (soccer/eng.1): season spans Aug–May but ESPN labels it by the
//     STARTING year. So "2025" on the core API = the 2025-26 season, which
//     is what's live in April 2026.
// Both use seasontype=1 for regular season.

export interface SoccerPlayerStats {
  name: string;
  team: string;
  games: number;
  goals: number;
  assists: number;
  shots: number;
  shotsOnTarget: number;
  goalsPerGame: number;
  assistsPerGame: number;
  shotsPerGame: number;
  shotsOnTargetPerGame: number;
}

type LeagueKey = "mls" | "epl";

const LEAGUE_PATHS: Record<LeagueKey, string> = {
  mls: "usa.1",
  epl: "eng.1",
};

const statsCache = new Map<
  string,
  { data: SoccerPlayerStats[]; expires: number }
>();

// ─── Core API shapes we read ─────────────────────────────────────────────────

interface CoreRef {
  $ref: string;
}

interface CoreLeadersCategory {
  name: string;
  leaders?: {
    value?: number;
    athlete?: CoreRef;
    team?: CoreRef;
    statistics?: CoreRef;
  }[];
}

interface CoreLeadersResponse {
  categories?: CoreLeadersCategory[];
}

interface CoreAthleteResponse {
  id?: string | number;
  displayName?: string;
  fullName?: string;
  shortName?: string;
  team?: CoreRef;
}

interface CoreStatLeaf {
  name: string;
  value?: number;
  displayValue?: string;
}

interface CoreStatCategory {
  name: string;
  stats?: CoreStatLeaf[];
}

interface CoreStatsResponse {
  splits?: { categories?: CoreStatCategory[] };
}

interface CoreTeamResponse {
  abbreviation?: string;
  shortDisplayName?: string;
  displayName?: string;
}

// ─── Season helpers ──────────────────────────────────────────────────────────

function currentSeasonYear(league: LeagueKey): number {
  const now = new Date();
  if (league === "mls") {
    // MLS calendar-year label. During preseason (Jan–Feb) last year still has
    // the more complete stats, but the 2026 season already has early data by
    // the time this file runs (Apr), so use the current year and let the
    // prior-year fallback catch edge cases.
    return now.getUTCFullYear();
  }
  // EPL: season labeled by starting year. Aug–Dec = current calendar year is
  // the label; Jan–May = prior calendar year is the label; Jun–Jul offseason
  // gap. Concretely: Apr 2026 belongs to the 2025-26 season (label "2025").
  if (now.getUTCMonth() >= 7) {
    return now.getUTCFullYear(); // Aug–Dec: current year
  }
  return now.getUTCFullYear() - 1; // Jan–Jul: prior year
}

function cacheKey(league: LeagueKey): string {
  return `soccer_${league}`;
}

// ─── Fetch helpers ───────────────────────────────────────────────────────────

// Normalize ref URLs ESPN sometimes returns as http:// — upgrade to https.
function normalizeRef(url: string): string {
  return url.startsWith("http://") ? "https://" + url.slice(7) : url;
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(normalizeRef(url), {
      next: { revalidate: 21600 },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function fetchLeaders(
  league: LeagueKey,
  season: number,
): Promise<CoreLeadersResponse | null> {
  const url = `https://sports.core.api.espn.com/v2/sports/soccer/leagues/${LEAGUE_PATHS[league]}/seasons/${season}/types/1/leaders?limit=50`;
  return fetchJson<CoreLeadersResponse>(url);
}

// Run an async mapper with bounded concurrency so we don't hammer ESPN.
async function mapLimit<T, U>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<U>,
): Promise<U[]> {
  const out: U[] = new Array(items.length);
  let i = 0;
  async function worker() {
    while (true) {
      const idx = i++;
      if (idx >= items.length) return;
      out[idx] = await fn(items[idx]);
    }
  }
  const workers = Array.from(
    { length: Math.min(limit, Math.max(1, items.length)) },
    () => worker(),
  );
  await Promise.all(workers);
  return out;
}

// Pull a stat value out of a categories-of-stats structure. Returns 0 when
// missing so downstream math stays safe.
function readStat(
  stats: CoreStatsResponse | null,
  catName: string,
  statName: string,
): number {
  const cat = stats?.splits?.categories?.find((c) => c.name === catName);
  const leaf = cat?.stats?.find((s) => s.name === statName);
  const v = leaf?.value;
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

// ─── Core fetcher ────────────────────────────────────────────────────────────

async function getSoccerPlayerStats(
  league: LeagueKey,
): Promise<SoccerPlayerStats[]> {
  const cached = statsCache.get(cacheKey(league));
  if (cached && cached.expires > Date.now()) return cached.data;

  const seasons = [currentSeasonYear(league), currentSeasonYear(league) - 1];

  for (const season of seasons) {
    const leaders = await fetchLeaders(league, season);
    if (!leaders?.categories?.length) continue;

    // Collect the union of athletes appearing in the categories that matter
    // for props: goals/assists/shots. This keeps the fetch count modest
    // while still covering every player we'd ever want to surface.
    const PROP_CATEGORIES = [
      "goalsLeaders",
      "assistsLeaders",
      "shotsOnTarget",
      "totalShots",
    ];

    // athleteId -> { athleteRef, teamRef, statsRef }
    const athleteMap = new Map<
      string,
      { athleteRef: string; teamRef: string; statsRef: string }
    >();

    for (const cat of leaders.categories) {
      if (!PROP_CATEGORIES.includes(cat.name)) continue;
      for (const leader of cat.leaders || []) {
        const aRef = leader.athlete?.$ref;
        const sRef = leader.statistics?.$ref;
        const tRef = leader.team?.$ref;
        if (!aRef || !sRef) continue;
        const idMatch = aRef.match(/athletes\/(\d+)/);
        const id = idMatch?.[1];
        if (!id) continue;
        if (!athleteMap.has(id)) {
          athleteMap.set(id, {
            athleteRef: aRef,
            teamRef: tRef || "",
            statsRef: sRef,
          });
        }
      }
    }

    if (athleteMap.size === 0) continue;

    // Fetch athlete (for name) + stats (for counts) in parallel, concurrency 8.
    const entries = Array.from(athleteMap.entries());
    const enriched = await mapLimit(entries, 8, async ([id, refs]) => {
      const [athleteRes, statsRes, teamRes] = await Promise.all([
        fetchJson<CoreAthleteResponse>(refs.athleteRef),
        fetchJson<CoreStatsResponse>(refs.statsRef),
        refs.teamRef
          ? fetchJson<CoreTeamResponse>(refs.teamRef)
          : Promise.resolve(null),
      ]);

      const name =
        athleteRes?.displayName ||
        athleteRes?.fullName ||
        athleteRes?.shortName ||
        "";
      const team =
        teamRes?.abbreviation ||
        teamRes?.shortDisplayName ||
        teamRes?.displayName ||
        "";

      // Games = general.appearances (matches started + subbed on is the one
      // soccer uses as "games"). Fall back to starts when appearances missing.
      const games =
        readStat(statsRes, "general", "appearances") ||
        readStat(statsRes, "general", "starts") ||
        0;
      const goals = readStat(statsRes, "offensive", "totalGoals");
      const assists = readStat(statsRes, "offensive", "goalAssists");
      const shots = readStat(statsRes, "offensive", "totalShots");
      const shotsOnTarget = readStat(statsRes, "offensive", "shotsOnTarget");

      const safeGames = games > 0 ? games : 0;
      const player: SoccerPlayerStats = {
        name,
        team,
        games: safeGames,
        goals,
        assists,
        shots,
        shotsOnTarget,
        goalsPerGame: safeGames > 0 ? goals / safeGames : 0,
        assistsPerGame: safeGames > 0 ? assists / safeGames : 0,
        shotsPerGame: safeGames > 0 ? shots / safeGames : 0,
        shotsOnTargetPerGame: safeGames > 0 ? shotsOnTarget / safeGames : 0,
      };
      void id;
      return player;
    });

    const players = enriched.filter(
      (p): p is SoccerPlayerStats =>
        !!p && !!p.name && p.games >= 1 && (p.goals + p.assists + p.shots > 0),
    );

    if (players.length === 0) continue;

    statsCache.set(cacheKey(league), {
      data: players,
      expires: Date.now() + 6 * 60 * 60 * 1000,
    });
    return players;
  }

  return [];
}

export async function getMLSPlayerStats(): Promise<SoccerPlayerStats[]> {
  return getSoccerPlayerStats("mls");
}

export async function getEPLPlayerStats(): Promise<SoccerPlayerStats[]> {
  return getSoccerPlayerStats("epl");
}
