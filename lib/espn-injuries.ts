// ─── ESPN Injuries (free) ──────────────────────────────────────────────────
// Pulls /injuries endpoint per sport, filters to recent gameday-relevant
// entries, returns a team-name-keyed map for the parlay engine to consume.
//
// Known limitation: ESPN lists every injured athlete on the roster including
// two-way contracts and G-league call-ups — most aren't rotation players.
// Recency filter (last RECENT_HOURS) cuts most of that noise because rosters
// only update recent statuses for players who were actually expected to play.
//
// For real starter-impact weighting we'd need Rotowire ($30-50/mo) — see
// project_bayparlays_edge_queue.md. This is the free MVP.

export interface InjuryEntry {
  name: string;
  status: string;       // "Out" | "Doubtful" | "Day-To-Day" | "Questionable"
  position?: string;    // "G" | "F" | "C" | "QB" | "RB" | etc.
  date: string;         // ISO
  detail?: string;
}

export type InjuryMap = Map<string, InjuryEntry[]>;

const RECENT_HOURS = 72;
const ACTIONABLE_STATUSES = new Set([
  "Out",
  "Doubtful",
  "Day-To-Day",
  "Questionable",
]);

const SPORT_PATHS: Record<string, string> = {
  nba: "basketball/nba",
  nfl: "football/nfl",
  nhl: "hockey/nhl",
  mlb: "baseball/mlb",
};

// In-memory cache. TTL 60 min — ESPN updates injury statuses throughout the
// day; staler than 60 min and we risk missing a late scratch.
const TTL_MS = 60 * 60 * 1000;
const cache = new Map<string, { map: InjuryMap; fetchedAt: number }>();

type RawAthlete = {
  displayName?: string;
  position?: { abbreviation?: string };
};
type RawInjury = {
  status?: string;
  date?: string;
  shortComment?: string;
  athlete?: RawAthlete;
};
type RawTeam = { displayName?: string; injuries?: RawInjury[] };
type RawResponse = { injuries?: RawTeam[] };

export async function fetchInjuries(sport: string): Promise<InjuryMap> {
  const sportKey = sport.toLowerCase();
  const path = SPORT_PATHS[sportKey];
  if (!path) return new Map();

  const cached = cache.get(sportKey);
  if (cached && Date.now() - cached.fetchedAt < TTL_MS) {
    return cached.map;
  }

  const url = `https://site.api.espn.com/apis/site/v2/sports/${path}/injuries`;
  const map: InjuryMap = new Map();

  try {
    // MLB's injury response is ~4MB which exceeds Next.js's 2MB data cache
    // limit, so we skip Next's cache entirely and rely on the in-memory
    // TTL above. Cold serverless starts will re-fetch — acceptable cost.
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      // Serve stale cache if we have any — ESPN blips shouldn't nuke context.
      return cached?.map || map;
    }
    const data = (await res.json()) as RawResponse;
    const cutoff = Date.now() - RECENT_HOURS * 60 * 60 * 1000;

    for (const team of data.injuries || []) {
      const teamName = team.displayName?.trim();
      if (!teamName) continue;
      const rows: InjuryEntry[] = [];
      for (const inj of team.injuries || []) {
        if (!inj.status || !ACTIONABLE_STATUSES.has(inj.status)) continue;
        if (!inj.date) continue;
        const ts = new Date(inj.date).getTime();
        if (!Number.isFinite(ts) || ts < cutoff) continue;
        const athleteName = inj.athlete?.displayName;
        if (!athleteName) continue;
        rows.push({
          name: athleteName,
          status: inj.status,
          position: inj.athlete?.position?.abbreviation,
          date: inj.date,
          detail: inj.shortComment,
        });
      }
      if (rows.length > 0) map.set(teamName, rows);
    }

    cache.set(sportKey, { map, fetchedAt: Date.now() });
    return map;
  } catch {
    return cached?.map || map;
  }
}

// Return a short reason string for a team's injuries, or null if none.
// "2 out: Kevin Durant, Austin Reaves" — capped at 2 names to keep reasons tight.
export function formatInjuryReason(
  teamName: string,
  map: InjuryMap,
): string | null {
  const rows = map.get(teamName);
  if (!rows || rows.length === 0) return null;

  // Prioritize Out > Doubtful > Day-To-Day > Questionable when truncating.
  const priority: Record<string, number> = {
    Out: 0,
    Doubtful: 1,
    "Day-To-Day": 2,
    Questionable: 3,
  };
  const sorted = [...rows].sort(
    (a, b) => (priority[a.status] ?? 9) - (priority[b.status] ?? 9),
  );

  const shown = sorted.slice(0, 2).map((r) => r.name);
  const extra = sorted.length > shown.length ? ` +${sorted.length - shown.length}` : "";
  const statusTag = sorted[0].status === "Out" ? "out" : "affected";
  return `${teamName}: ${shown.join(", ")}${extra} ${statusTag}`;
}

// Lookup with fuzzy matching — Odds API team names don't always match ESPN
// exactly ("LA Lakers" vs "Los Angeles Lakers", "NY Yankees" vs "New York
// Yankees", "Montréal" vs "Montreal"). NFD + diacritic strip handles accents.
function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

export function lookupTeam(
  oddsName: string,
  map: InjuryMap,
): InjuryEntry[] | null {
  if (!oddsName) return null;
  const exact = map.get(oddsName);
  if (exact) return exact;
  const norm = normalize(oddsName);
  for (const [key, rows] of map) {
    const keyNorm = normalize(key);
    if (keyNorm === norm) return rows;
    // Substring match — "Yankees" matches "New York Yankees"
    if (keyNorm.endsWith(norm) || norm.endsWith(keyNorm)) return rows;
  }
  return null;
}
