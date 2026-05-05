// Action Network public scoreboard scraper.
//
// AN exposes a free public REST API at api.actionnetwork.com that returns
// per-sport scoreboards with multi-book consensus odds AND public/money
// betting percentages. The percentages are the gold here — when the public
// is heavily on one side but the actual money is on the other, that's the
// classic sharp-vs-square divergence. Paid tier services charge $30+/mo
// for this signal.
//
// We pull this hourly (during active hours), persist to betting_signals,
// and either join into /api/parlays leg construction or serve as model
// features (public_pct, money_pct, divergence) at training time.

export interface ActionNetworkSignal {
  source: "actionnetwork";
  sport: string;
  ext_game_id: string;
  home_team: string;
  away_team: string;
  commence_time: string | null;

  // Best-book lines (AN aggregates across 8 books — we take the median or
  // the consensus row from their response).
  ml_home: number | null;
  ml_away: number | null;
  spread_home_line: number | null;
  spread_away_line: number | null;
  spread_home_price: number | null;
  spread_away_price: number | null;
  total_line: number | null;
  total_over_price: number | null;
  total_under_price: number | null;

  // The signal columns — public bet count % and money $ %.
  public_pct_home: number | null;
  public_pct_away: number | null;
  money_pct_home: number | null;
  money_pct_away: number | null;
  public_pct_over: number | null;
  public_pct_under: number | null;
  money_pct_over: number | null;
  money_pct_under: number | null;

  raw: unknown;
}

// AN league code → our internal sport label. AN uses lowercase short names
// in the URL path; we standardize on uppercase at the storage layer to
// match how /api/parlays SPORT_MAP is keyed.
const AN_LEAGUE_TO_SPORT: Record<string, string> = {
  mlb: "MLB",
  nba: "NBA",
  nhl: "NHL",
  nfl: "NFL",
  ncaab: "NCAAB",
  ncaaf: "NCAAF",
};

// Our default book IDs for AN's bookIds query — these represent the major
// US sportsbooks. AN's scoreboard returns one row per (game, book) so we
// get the same game multiple times with different prices. We pick the
// "consensus" book (book_id 15 = DraftKings as the de facto reference)
// for the ml/spread/total snapshot, then aggregate public/money pcts
// across the response.
const AN_BOOKS = "15,30,75,123,69,68,71,79"; // DK, FD, BetMGM, Caesars, etc.

interface ANTeam {
  id: number;
  full_name: string;
  abbr?: string;
}

interface ANOdds {
  book_id?: number;
  ml_home?: number | null;
  ml_away?: number | null;
  spread_home?: number | null;
  spread_away?: number | null;
  spread_home_line?: number | null;
  spread_away_line?: number | null;
  total?: number | null;
  over?: number | null;
  under?: number | null;
  ml_home_public?: number | null;
  ml_away_public?: number | null;
  ml_home_money?: number | null;
  ml_away_money?: number | null;
  spread_home_public?: number | null;
  spread_away_public?: number | null;
  spread_home_money?: number | null;
  spread_away_money?: number | null;
  total_over_public?: number | null;
  total_under_public?: number | null;
  total_over_money?: number | null;
  total_under_money?: number | null;
}

interface ANGame {
  id: number;
  status: string;
  start_time: string | null;
  away_team_id: number;
  home_team_id: number;
  teams: ANTeam[];
  odds: ANOdds[];
}

interface ANScoreboardResponse {
  games?: ANGame[];
}

const REFERENCE_BOOK_ID = 15; // DraftKings — used as the canonical line snapshot

function parseGame(game: ANGame, sport: string): ActionNetworkSignal | null {
  const teams = new Map(game.teams.map((t) => [t.id, t]));
  const home = teams.get(game.home_team_id);
  const away = teams.get(game.away_team_id);
  if (!home || !away) return null;

  // Pull the consensus snapshot from the reference book if available;
  // fall back to the first odds entry so we never end up with all nulls
  // when DraftKings happens to be missing for a game.
  const refOdds =
    game.odds.find((o) => o.book_id === REFERENCE_BOOK_ID) ??
    game.odds[0] ??
    null;

  // Average public/money pcts across all books that reported them. AN
  // sometimes only reports these on the consensus row, in which case
  // we'll get a single-value average. For games without any reporting
  // (very early in the day) all pct fields stay null.
  function avgField(field: keyof ANOdds): number | null {
    const values = game.odds
      .map((o) => o[field])
      .filter((v): v is number => typeof v === "number");
    if (values.length === 0) return null;
    return Math.round(
      (values.reduce((s, v) => s + v, 0) / values.length) * 10,
    ) / 10;
  }

  return {
    source: "actionnetwork",
    sport,
    ext_game_id: String(game.id),
    home_team: home.full_name,
    away_team: away.full_name,
    commence_time: game.start_time,

    ml_home: refOdds?.ml_home ?? null,
    ml_away: refOdds?.ml_away ?? null,
    spread_home_line: refOdds?.spread_home ?? refOdds?.spread_home_line ?? null,
    spread_away_line: refOdds?.spread_away ?? refOdds?.spread_away_line ?? null,
    spread_home_price: refOdds?.spread_home_line ?? null,
    spread_away_price: refOdds?.spread_away_line ?? null,
    total_line: refOdds?.total ?? null,
    total_over_price: refOdds?.over ?? null,
    total_under_price: refOdds?.under ?? null,

    public_pct_home: avgField("ml_home_public"),
    public_pct_away: avgField("ml_away_public"),
    money_pct_home: avgField("ml_home_money"),
    money_pct_away: avgField("ml_away_money"),
    public_pct_over: avgField("total_over_public"),
    public_pct_under: avgField("total_under_public"),
    money_pct_over: avgField("total_over_money"),
    money_pct_under: avgField("total_under_money"),

    raw: { game_id: game.id, ref_book: REFERENCE_BOOK_ID, status: game.status },
  };
}

// Format YYYYMMDD for AN's date query parameter. AN expects ET-based dates
// for US sports — we use the day boundary in America/New_York.
function dateForET(d: Date): string {
  // crude ET conversion: subtract 5h (ignoring DST drift). Good enough for
  // a daily query bucket — at worst we'll fetch the wrong day's slate
  // during the 1-hour DST boundary window.
  const et = new Date(d.getTime() - 5 * 60 * 60 * 1000);
  const y = et.getUTCFullYear();
  const m = String(et.getUTCMonth() + 1).padStart(2, "0");
  const day = String(et.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

export async function fetchActionNetworkScoreboard(
  league: string,
  date: Date = new Date(),
): Promise<ActionNetworkSignal[]> {
  const sport = AN_LEAGUE_TO_SPORT[league.toLowerCase()];
  if (!sport) {
    throw new Error(`Unsupported AN league: ${league}`);
  }
  const dateStr = dateForET(date);
  const url =
    `https://api.actionnetwork.com/web/v1/scoreboard/${league.toLowerCase()}` +
    `?bookIds=${AN_BOOKS}&date=${dateStr}`;

  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      Accept: "application/json",
    },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`AN scoreboard ${league} HTTP ${res.status}`);
  }
  const json = (await res.json()) as ANScoreboardResponse;
  const games = json.games ?? [];

  const signals: ActionNetworkSignal[] = [];
  for (const game of games) {
    const sig = parseGame(game, sport);
    if (sig) signals.push(sig);
  }
  return signals;
}
