// ─── Underdog Fantasy Props Feed ──────────────────────────────────────────
// Underdog's public over-under endpoint returns every active player prop
// with a real line value, over/under prices, and player+stat tagging.
// This is what we overlay onto /props so the "typical line" stops being a
// heuristic and becomes a real market line.
//
// Endpoint: https://api.underdogfantasy.com/beta/v5/over_under_lines
// Auth: none required — their public feed. No API key.
// Geo: accessible from US. No captcha (unlike PrizePicks).
//
// The response is a denormalized bundle of ~7,000 lines per fetch. We
// flatten it into a simple lookup map: (sport, player_name_key, stat_key)
// → { lineValue, overOdds, underOdds }.

export interface UnderdogLine {
  playerName: string;      // "Jayson Tatum"
  playerKey: string;       // "jaysontatum" — normalized for lookup
  team: string | null;     // e.g. "BOS"
  sport: string;           // "NBA" | "MLB" | "NHL" | "NFL" | "WNBA" | ...
  stat: string;            // raw Underdog stat name, e.g. "points"
  statKey: string;         // our normalized stat key, e.g. "points"
  lineValue: number;       // e.g. 22.5
  overOdds: number | null; // American odds for higher/over
  underOdds: number | null;// American odds for lower/under
  startsAt: string | null; // ISO
  gameTitle: string | null;// e.g. "BOS @ PHI"
}

interface RawFeedPlayer {
  id: string;
  first_name?: string;
  last_name?: string;
  sport_id?: string;
  team_id?: string;
}

interface RawFeedAppearance {
  id: string;
  player_id?: string;
  match_id?: number | string;
}

interface RawFeedGame {
  id: number;
  abbreviated_title?: string;
  scheduled_at?: string;
}

interface RawFeedOption {
  american_price?: string;
  choice?: string;
  status?: string;
}

interface RawFeedLine {
  id: string;
  stat_value?: number;
  options?: RawFeedOption[];
  over_under?: {
    appearance_stat?: {
      appearance_id?: string;
      stat?: string;
    };
    category?: string;
  };
}

interface RawFeedTeam {
  id: string;
  abbreviation?: string;
  abbr?: string;
}

interface RawFeed {
  over_under_lines: RawFeedLine[];
  players: RawFeedPlayer[];
  appearances: RawFeedAppearance[];
  games: RawFeedGame[];
  teams?: RawFeedTeam[];
}

// ─── Normalization helpers ────────────────────────────────────────────────

/** Strip accents/punctuation, lowercase. "J.J. McCarthy" → "jjmccarthy" */
export function normalizePlayerKey(name: string): string {
  return (name || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Map Underdog's stat names to the normalized keys our /api/props route uses.
 * Some sports share stat names (points), others differ (passing_yards vs yards).
 * Falling back to the raw stat key is safe — we just won't match anything.
 */
const STAT_KEY_MAP: Record<string, string> = {
  // NBA / WNBA
  points: "points",
  rebounds: "rebounds",
  assists: "assists",
  three_point_field_goals_made: "threes",
  three_pointers_made: "threes",
  threes_made: "threes",
  steals: "steals",
  blocks: "blocks",

  // NFL
  passing_yards: "passing_yards",
  pass_yards: "passing_yards",
  passing_touchdowns: "passing_tds",
  passing_tds: "passing_tds",
  rushing_yards: "rushing_yards",
  rush_yards: "rushing_yards",
  rushing_touchdowns: "rushing_tds",
  receiving_yards: "receiving_yards",
  rec_yards: "receiving_yards",
  receptions: "receptions",
  receiving_touchdowns: "receiving_tds",

  // MLB
  strikeouts: "strikeouts",
  pitcher_strikeouts: "strikeouts",
  hits: "hits",
  total_bases: "total_bases",
  home_runs: "home_runs",
  hrs: "home_runs",
  rbis: "rbis",
  rbi: "rbis",
  stolen_bases: "stolen_bases",
  runs: "runs",
  runs_scored: "runs",

  // NHL
  goals: "goals",
  shots_on_goal: "shots",
  shots: "shots",
  hockey_assists: "assists",
  blocked_shots: "blocked_shots",
};

function normalizeStat(raw: string): string {
  const k = (raw || "").toLowerCase().trim();
  return STAT_KEY_MAP[k] ?? k;
}

// Option.choice values are "higher" / "lower" on Underdog
function parseAmerican(v: string | undefined): number | null {
  if (!v) return null;
  const n = parseInt(v.replace(/[^\d-]/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}

// ─── Fetching + caching ───────────────────────────────────────────────────

let cache: { lines: UnderdogLine[]; expires: number } | null = null;
const CACHE_TTL_MS = 20 * 60 * 1000; // 20 minutes

/**
 * Fetch + flatten Underdog's public over/under feed. Cached 20min.
 * Never throws — on error returns last cached data (or empty array).
 */
export async function fetchUnderdogLines(): Promise<UnderdogLine[]> {
  if (cache && cache.expires > Date.now()) return cache.lines;

  try {
    const res = await fetch(
      "https://api.underdogfantasy.com/beta/v5/over_under_lines",
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; BayParlays/1.0)",
          Accept: "application/json",
        },
        // Next.js fetch cache as a secondary layer (15min)
        next: { revalidate: 900 },
      },
    );
    if (!res.ok) {
      if (cache) return cache.lines;
      return [];
    }
    const data: RawFeed = await res.json();

    const players = new Map<string, RawFeedPlayer>();
    for (const p of data.players || []) players.set(p.id, p);

    const apps = new Map<string, RawFeedAppearance>();
    for (const a of data.appearances || []) apps.set(a.id, a);

    const games = new Map<string, RawFeedGame>();
    for (const g of data.games || []) games.set(String(g.id), g);

    const lines: UnderdogLine[] = [];

    for (const line of data.over_under_lines || []) {
      const statRaw = line.over_under?.appearance_stat?.stat;
      const appId = line.over_under?.appearance_stat?.appearance_id;
      const lineValue = line.stat_value;
      if (!statRaw || !appId || typeof lineValue !== "number") continue;
      // Only real player props; skip combos, prediction markets, etc.
      if (line.over_under?.category !== "player_prop") continue;

      const app = apps.get(appId);
      if (!app?.player_id) continue;
      const player = players.get(app.player_id);
      if (!player?.first_name || !player?.last_name || !player?.sport_id) continue;

      const game = app.match_id ? games.get(String(app.match_id)) : null;

      // Extract over/under prices from options[]
      let overOdds: number | null = null;
      let underOdds: number | null = null;
      for (const opt of line.options || []) {
        if (opt.status !== "active") continue;
        const price = parseAmerican(opt.american_price);
        if (opt.choice === "higher") overOdds = price;
        else if (opt.choice === "lower") underOdds = price;
      }

      const playerName = `${player.first_name} ${player.last_name}`.trim();

      lines.push({
        playerName,
        playerKey: normalizePlayerKey(playerName),
        team: null, // team tags use UUIDs in Underdog's feed; ESPN-side match is name-first so we skip
        sport: player.sport_id,
        stat: statRaw,
        statKey: normalizeStat(statRaw),
        lineValue,
        overOdds,
        underOdds,
        startsAt: game?.scheduled_at ?? null,
        gameTitle: game?.abbreviated_title ?? null,
      });
    }

    cache = { lines, expires: Date.now() + CACHE_TTL_MS };
    return lines;
  } catch {
    if (cache) return cache.lines;
    return [];
  }
}

// ─── Lookup index ────────────────────────────────────────────────────────

export interface UnderdogIndex {
  // key: `${sport}|${playerKey}|${statKey}` → line
  byPlayerStat: Map<string, UnderdogLine>;
  sportAvailable: Set<string>;
}

export function buildUnderdogIndex(lines: UnderdogLine[]): UnderdogIndex {
  const byPlayerStat = new Map<string, UnderdogLine>();
  const sportAvailable = new Set<string>();
  for (const l of lines) {
    sportAvailable.add(l.sport);
    const key = `${l.sport}|${l.playerKey}|${l.statKey}`;
    // If duplicate lines exist (Underdog sometimes publishes alternates),
    // prefer the one whose line_value ends in .5 (standard, not alt)
    const existing = byPlayerStat.get(key);
    if (!existing) {
      byPlayerStat.set(key, l);
    } else {
      const existingAlt = existing.lineValue % 1 !== 0.5;
      const newStandard = l.lineValue % 1 === 0.5;
      if (existingAlt && newStandard) byPlayerStat.set(key, l);
    }
  }
  return { byPlayerStat, sportAvailable };
}

/**
 * Look up a prop line by (sport, player, stat). Returns null on no match.
 * Player name matching is case/punctuation-insensitive via normalizePlayerKey.
 */
export function findUnderdogLine(
  index: UnderdogIndex,
  sport: string,
  playerName: string,
  statKey: string,
): UnderdogLine | null {
  const key = `${sport}|${normalizePlayerKey(playerName)}|${statKey}`;
  return index.byPlayerStat.get(key) ?? null;
}
