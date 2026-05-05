// Pinnacle public guest API.
//
// Pinnacle is the sharpest book in the market — their lines are widely
// considered closer to "true" probability than any other book. Their
// guest API exposes leagues + matchups + straight markets without auth
// (just a static API key shared by their public web client).
//
// We use Pinnacle as a benchmark, NOT a live odds source for parlays:
//   - For each game in our slate, compare our model's projected line
//     to Pinnacle's. Sharp agreement = high confidence; sharp
//     disagreement = likely model error.
//   - Use their max bet limits as a confidence signal — Pinnacle's
//     willingness to risk money on a market is itself information.
//
// Their lines are usually slightly worse for the player than US books
// because they don't shave juice as aggressively, but they're stable
// and accurate. We don't bet AT Pinnacle, we bet against them in spirit.

export interface PinnacleSignal {
  source: "pinnacle";
  sport: string;
  ext_game_id: string;
  home_team: string;
  away_team: string;
  commence_time: string | null;

  ml_home: number | null;
  ml_away: number | null;
  spread_home_line: number | null;
  spread_away_line: number | null;
  spread_home_price: number | null;
  spread_away_price: number | null;
  total_line: number | null;
  total_over_price: number | null;
  total_under_price: number | null;

  pinnacle_max_stake: number | null;

  raw: unknown;
}

// League ID → our internal sport label. Probed via the /sports and
// /leagues endpoints — verified IDs as of 2026-05-04.
const PINNACLE_LEAGUES: Record<string, string> = {
  "246": "MLB",
  "487": "NBA",
  "1456": "NHL",
};

// Pinnacle's market `key` schema:
//   s;P;m            → moneyline, period P (0 = full game)
//   s;P;ou           → totals, period P (main line)
//   s;P;ou;LINE      → totals at specific alternate line
//   s;P;s            → spread, period P (main line)
//   s;P;s;LINE       → spread at specific alternate line
// We only consume full-game (P=0) main lines; isAlternate=false filters
// out alt lines and keeps the canonical price.

const API_KEY = "CmX2KcMrXuFmNg6YFbmTxE0y9CIrOi0R"; // public guest key

interface PinnacleMatchup {
  id: number;
  startTime?: string;
  type?: string;
  parent?: unknown;
  league?: { id?: number; name?: string };
  participants?: Array<{
    id?: number;
    alignment?: "home" | "away" | "neutral";
    name?: string;
    rotation?: number | null;
  }>;
}

interface PinnacleMarketPrice {
  designation?: "home" | "away" | "over" | "under";
  price?: number;
  points?: number;
}

interface PinnacleMarket {
  matchupId: number;
  key: string;
  type: string;
  period?: number;
  isAlternate?: boolean;
  limits?: Array<{ amount: number; type: string }>;
  prices: PinnacleMarketPrice[];
  status?: string;
  cutoffAt?: string;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      "X-API-Key": API_KEY,
      Accept: "application/json",
    },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Pinnacle ${url} HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

// Pull all team matchups (excluding totals/spreads-as-matchups which
// represent pseudo-matchups for over/under participants — Pinnacle's
// schema is weird that way). We keep only matchups where participants
// are actually home/away teams.
async function fetchTeamMatchups(leagueId: string): Promise<PinnacleMatchup[]> {
  const all = await fetchJson<PinnacleMatchup[]>(
    `https://guest.api.arcadia.pinnacle.com/0.1/leagues/${leagueId}/matchups`,
  );
  return all.filter((m) => {
    if (m.parent) return false; // child matchups (alt lines) skip
    const ps = m.participants ?? [];
    if (ps.length !== 2) return false;
    return ps.every((p) => p.alignment === "home" || p.alignment === "away");
  });
}

async function fetchStraightMarkets(leagueId: string): Promise<PinnacleMarket[]> {
  return fetchJson<PinnacleMarket[]>(
    `https://guest.api.arcadia.pinnacle.com/0.1/leagues/${leagueId}/markets/straight`,
  );
}

export async function fetchPinnacleLeague(
  leagueId: string,
): Promise<PinnacleSignal[]> {
  const sport = PINNACLE_LEAGUES[leagueId];
  if (!sport) throw new Error(`Unsupported Pinnacle league: ${leagueId}`);

  const [matchups, markets] = await Promise.all([
    fetchTeamMatchups(leagueId),
    fetchStraightMarkets(leagueId),
  ]);

  // Index markets by matchupId for fast lookup. Filter to full-game
  // (period 0), main-line (isAlternate=false) markets only.
  const byMatchup = new Map<number, PinnacleMarket[]>();
  for (const m of markets) {
    if (m.period !== 0) continue;
    if (m.isAlternate) continue;
    if (m.status !== "open") continue;
    const list = byMatchup.get(m.matchupId) ?? [];
    list.push(m);
    byMatchup.set(m.matchupId, list);
  }

  const signals: PinnacleSignal[] = [];
  for (const matchup of matchups) {
    const ps = matchup.participants ?? [];
    const home = ps.find((p) => p.alignment === "home");
    const away = ps.find((p) => p.alignment === "away");
    if (!home?.name || !away?.name) continue;

    const matchupMarkets = byMatchup.get(matchup.id) ?? [];
    if (matchupMarkets.length === 0) continue;

    // Extract per-market prices. Pinnacle uses "designation" home/away
    // for moneyline + spread, over/under for totals.
    const ml = matchupMarkets.find((m) => m.type === "moneyline");
    const spread = matchupMarkets.find((m) => m.type === "spread");
    const total = matchupMarkets.find((m) => m.type === "total");

    function priceFor(
      m: PinnacleMarket | undefined,
      designation: PinnacleMarketPrice["designation"],
    ): number | null {
      if (!m) return null;
      const p = m.prices.find((x) => x.designation === designation);
      return p?.price ?? null;
    }
    function pointsFor(
      m: PinnacleMarket | undefined,
      designation: PinnacleMarketPrice["designation"],
    ): number | null {
      if (!m) return null;
      const p = m.prices.find((x) => x.designation === designation);
      return p?.points ?? null;
    }

    // Pinnacle quotes a single max-risk-stake limit per matchup; we take
    // the highest across the three markets we sampled (moneyline tends
    // to have the highest limits).
    const maxStake = Math.max(
      0,
      ...matchupMarkets
        .flatMap((m) => m.limits ?? [])
        .filter((l) => l.type === "maxRiskStake")
        .map((l) => l.amount ?? 0),
    );

    signals.push({
      source: "pinnacle",
      sport,
      ext_game_id: String(matchup.id),
      home_team: home.name,
      away_team: away.name,
      commence_time: matchup.startTime ?? null,

      ml_home: priceFor(ml, "home"),
      ml_away: priceFor(ml, "away"),
      spread_home_line: pointsFor(spread, "home"),
      spread_away_line: pointsFor(spread, "away"),
      spread_home_price: priceFor(spread, "home"),
      spread_away_price: priceFor(spread, "away"),
      total_line: pointsFor(total, "over") ?? pointsFor(total, "under"),
      total_over_price: priceFor(total, "over"),
      total_under_price: priceFor(total, "under"),

      pinnacle_max_stake: maxStake > 0 ? maxStake : null,

      raw: { matchupId: matchup.id, leagueId, marketCount: matchupMarkets.length },
    });
  }

  return signals;
}

// Convenience wrapper — fetches all configured leagues in parallel.
export async function fetchAllPinnacleSignals(): Promise<PinnacleSignal[]> {
  const ids = Object.keys(PINNACLE_LEAGUES);
  const results = await Promise.allSettled(ids.map((id) => fetchPinnacleLeague(id)));
  const signals: PinnacleSignal[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") signals.push(...r.value);
    else console.error("[pinnacle] league fetch failed:", r.reason);
  }
  return signals;
}
