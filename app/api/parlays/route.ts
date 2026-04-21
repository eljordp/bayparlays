import { NextRequest, NextResponse } from "next/server";
import {
  getTeamRecords,
  getTeamEdge,
  type TeamRecord,
} from "@/lib/sports-data";

// ─── Config ──────────────────────────────────────────────────────────────────

const ODDS_API_KEY = process.env.ODDS_API_KEY;
const BASE_URL = "https://api.the-odds-api.com/v4";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const SPORT_MAP: Record<string, string> = {
  nba: "basketball_nba",
  nfl: "americanfootball_nfl",
  mlb: "baseball_mlb",
  ufc: "mma_mixed_martial_arts",
  nhl: "icehockey_nhl",
  ncaaf: "americanfootball_ncaaf",
  ncaab: "basketball_ncaab",
  soccer: "soccer_epl",
};

// ─── Types ───────────────────────────────────────────────────────────────────

interface OddsOutcome {
  name: string;
  price: number;
  point?: number;
}

interface OddsMarket {
  key: string;
  outcomes: OddsOutcome[];
}

interface OddsBookmaker {
  key: string;
  title: string;
  markets: OddsMarket[];
}

interface OddsGame {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: OddsBookmaker[];
}

interface TeamRecordInfo {
  wins: number;
  losses: number;
  winRate: number;
  streak: { type: "W" | "L"; count: number };
  lastFive: ("W" | "L")[];
}

interface ScoredLeg {
  sport: string;
  sportKey: string;
  gameId: string;
  game: string;
  pick: string;
  market: string;
  odds: number;
  decimalOdds: number;
  book: string;
  impliedProb: number;
  edgeScore: number;
  homeTeam: string;
  awayTeam: string;
  teamRecord?: TeamRecordInfo;
}

interface ParlayLeg {
  sport: string;
  game: string;
  pick: string;
  market: string;
  odds: number;
  book: string;
  impliedProb: number;
  edgeScore: number;
  teamRecord?: TeamRecordInfo;
}

interface Parlay {
  id: string;
  legs: ParlayLeg[];
  combinedOdds: string;
  combinedDecimal: number;
  ev: number;
  evPercent: number;
  confidence: number;
  payout: number;
  timestamp: string;
  recommendedBook?: string;
}

interface ParlayResponse {
  parlays: Parlay[];
  meta: {
    sportsScanned: string[];
    gamesAnalyzed: number;
    legsEvaluated: number;
    generatedAt: string;
  };
}

// ─── Cache ───────────────────────────────────────────────────────────────────

let cache: { data: ParlayResponse; timestamp: number; key: string } | null =
  null;

function getCacheKey(sports: string[], legs: number, count: number, sort: string = "ev"): string {
  return `${sports.sort().join(",")}_${legs}_${count}_${sort}`;
}

function getCachedResponse(
  sports: string[],
  legs: number,
  count: number,
  sort: string = "ev"
): ParlayResponse | null {
  if (!cache) return null;
  const key = getCacheKey(sports, legs, count, sort);
  if (cache.key !== key) return null;
  if (Date.now() - cache.timestamp > CACHE_TTL_MS) {
    cache = null;
    return null;
  }
  return cache.data;
}

function setCachedResponse(
  data: ParlayResponse,
  sports: string[],
  legs: number,
  count: number,
  sort: string = "ev"
): void {
  cache = {
    data,
    timestamp: Date.now(),
    key: getCacheKey(sports, legs, count, sort),
  };
}

// ─── Math Functions ──────────────────────────────────────────────────────────

function americanToDecimal(odds: number): number {
  if (odds > 0) {
    return odds / 100 + 1;
  }
  return 100 / Math.abs(odds) + 1;
}

function americanToImpliedProb(odds: number): number {
  if (odds > 0) {
    return 100 / (odds + 100);
  }
  return Math.abs(odds) / (Math.abs(odds) + 100);
}

function decimalToAmerican(decimal: number): number {
  if (decimal >= 2) {
    return Math.round((decimal - 1) * 100);
  }
  return Math.round(-100 / (decimal - 1));
}

function formatAmericanOdds(odds: number): string {
  return odds > 0 ? `+${odds}` : `${odds}`;
}

function calculateParlayOdds(legs: { decimalOdds: number }[]): number {
  return legs.reduce((acc, leg) => acc * leg.decimalOdds, 1);
}

function calculateEV(
  parlayDecimalOdds: number,
  combinedProbability: number,
  stake: number
): number {
  return parlayDecimalOdds * combinedProbability * stake - stake;
}

// ─── Odds Analysis ───────────────────────────────────────────────────────────

interface BestOddsResult {
  bestOdds: number;
  bestBook: string;
  averageOdds: number;
  allOdds: { book: string; odds: number }[];
}

function findBestOdds(
  bookmakers: OddsBookmaker[],
  marketKey: string,
  outcomeName: string,
  outcomePoint?: number
): BestOddsResult | null {
  const allOdds: { book: string; odds: number }[] = [];

  for (const bookmaker of bookmakers) {
    const market = bookmaker.markets.find((m) => m.key === marketKey);
    if (!market) continue;

    const outcome = market.outcomes.find((o) => {
      const nameMatch = o.name === outcomeName;
      if (outcomePoint !== undefined && o.point !== undefined) {
        return nameMatch && o.point === outcomePoint;
      }
      return nameMatch;
    });

    if (outcome) {
      allOdds.push({ book: bookmaker.title, odds: outcome.price });
    }
  }

  if (allOdds.length === 0) return null;

  // Sort descending — highest odds = best for the bettor
  allOdds.sort((a, b) => {
    // For positive odds, higher is better. For negative, closer to 0 is better.
    // Decimal comparison handles both correctly.
    return americanToDecimal(b.odds) - americanToDecimal(a.odds);
  });

  const avgDecimal =
    allOdds.reduce((sum, o) => sum + americanToDecimal(o.odds), 0) /
    allOdds.length;

  return {
    bestOdds: allOdds[0].odds,
    bestBook: allOdds[0].book,
    averageOdds: decimalToAmerican(avgDecimal),
    allOdds,
  };
}

/**
 * Score a leg based on how much edge the best odds offer vs the market average.
 * A higher edge score means the best book is offering significantly better odds
 * than the consensus — this is where sharp money finds value.
 */
function calculateEdgeScore(
  bestDecimal: number,
  avgDecimal: number,
  bookCount: number
): number {
  // Edge = percentage the best odds exceed the average
  const rawEdge = ((bestDecimal - avgDecimal) / avgDecimal) * 100;

  // Book divergence bonus: more books disagreeing = more opportunity
  const divergenceBonus = Math.min(bookCount * 2, 10);

  // Normalize to 0-100 scale
  // An edge of 5%+ across multiple books is elite. 1-2% is decent.
  const score = Math.min(100, rawEdge * 15 + divergenceBonus);

  return Math.max(0, Math.round(score * 100) / 100);
}

// ─── Leg Extraction ──────────────────────────────────────────────────────────

function extractLegsFromGame(
  game: OddsGame,
  sportLabel: string,
  teamRecords?: Map<string, TeamRecord>
): ScoredLeg[] {
  const legs: ScoredLeg[] = [];
  const gameLabel = `${game.away_team} vs ${game.home_team}`;
  const markets = ["h2h", "spreads", "totals"];

  for (const marketKey of markets) {
    // Collect all unique outcomes for this market across all bookmakers
    const outcomeSet = new Map<
      string,
      { name: string; point?: number }
    >();

    for (const bookmaker of game.bookmakers) {
      const market = bookmaker.markets.find((m) => m.key === marketKey);
      if (!market) continue;
      for (const outcome of market.outcomes) {
        const key =
          outcome.point !== undefined
            ? `${outcome.name}|${outcome.point}`
            : outcome.name;
        if (!outcomeSet.has(key)) {
          outcomeSet.set(key, { name: outcome.name, point: outcome.point });
        }
      }
    }

    // Score each unique outcome
    for (const [, outcomeInfo] of Array.from(outcomeSet)) {
      const best = findBestOdds(
        game.bookmakers,
        marketKey,
        outcomeInfo.name,
        outcomeInfo.point
      );
      if (!best || best.allOdds.length < 2) continue; // Need 2+ books to compare

      const bestDecimal = americanToDecimal(best.bestOdds);
      const avgDecimal = americanToDecimal(best.averageOdds);
      const impliedProb = americanToImpliedProb(best.bestOdds);

      let edgeScore = calculateEdgeScore(
        bestDecimal,
        avgDecimal,
        best.allOdds.length
      );

      // Build the pick label
      let pick: string;
      let marketLabel: string;
      if (marketKey === "h2h") {
        pick = `${outcomeInfo.name} ML`;
        marketLabel = "moneyline";
      } else if (marketKey === "spreads") {
        const pointStr =
          outcomeInfo.point !== undefined
            ? outcomeInfo.point > 0
              ? `+${outcomeInfo.point}`
              : `${outcomeInfo.point}`
            : "";
        pick = `${outcomeInfo.name} ${pointStr}`;
        marketLabel = "spread";
      } else {
        // totals
        const pointStr =
          outcomeInfo.point !== undefined ? ` ${outcomeInfo.point}` : "";
        pick = `${outcomeInfo.name}${pointStr}`;
        marketLabel = "total";
      }

      // ── Team Performance Edge ───────────────────────────────────
      // Add team record data to boost/penalize legs based on actual results.
      let teamRecordInfo: TeamRecordInfo | undefined;

      if (teamRecords && marketKey !== "totals") {
        // For h2h and spreads, the outcome name is a team name
        const isHome = outcomeInfo.name === game.home_team;
        const teamEdge = getTeamEdge(outcomeInfo.name, teamRecords, isHome);
        edgeScore += teamEdge;

        // Attach record info for the picked team
        const rec = teamRecords.get(outcomeInfo.name);
        if (rec) {
          teamRecordInfo = {
            wins: rec.wins,
            losses: rec.losses,
            winRate: rec.winRate,
            streak: rec.streak,
            lastFive: rec.lastFive,
          };
        }
      }

      // ── Filter out bad picks ──────────────────────────────────
      // Don't pick heavy underdogs on moneyline (over +200 = long shot)
      if (marketKey === "h2h" && best.bestOdds > 200) {
        edgeScore = Math.max(0, edgeScore - 30); // heavy penalty
      }

      // Penalize teams with losing records
      if (teamRecordInfo && teamRecordInfo.winRate < 0.4) {
        edgeScore = Math.max(0, edgeScore - 20);
      }

      // Boost favorites and teams on win streaks
      if (teamRecordInfo && teamRecordInfo.winRate > 0.55) {
        edgeScore += 10;
      }
      if (teamRecordInfo?.streak.type === "W" && teamRecordInfo.streak.count >= 3) {
        edgeScore += 8;
      }

      // Penalize teams on losing streaks
      if (teamRecordInfo?.streak.type === "L" && teamRecordInfo.streak.count >= 3) {
        edgeScore = Math.max(0, edgeScore - 15);
      }

      // Clamp to 0-100
      edgeScore = Math.max(0, Math.min(100, edgeScore));

      legs.push({
        sport: sportLabel,
        sportKey: game.sport_key,
        gameId: game.id,
        game: gameLabel,
        pick,
        market: marketLabel,
        odds: best.bestOdds,
        decimalOdds: bestDecimal,
        book: best.bestBook,
        impliedProb: Math.round(impliedProb * 10000) / 10000,
        edgeScore,
        homeTeam: game.home_team,
        awayTeam: game.away_team,
        teamRecord: teamRecordInfo,
      });
    }
  }

  return legs;
}

// ─── Parlay Builder ──────────────────────────────────────────────────────────

function buildParlays(
  allLegs: ScoredLeg[],
  numLegs: number,
  count: number,
  sortMode: "ev" | "payout" | "confidence" = "ev"
): Parlay[] {
  let sorted: ScoredLeg[];
  let viable: ScoredLeg[];

  if (sortMode === "confidence") {
    // MOST CONFIDENT: only favorites (negative odds on ML), winning teams, high edge
    sorted = [...allLegs]
      .filter((leg) => {
        // For moneyline, only pick favorites (negative odds)
        if (leg.market === "moneyline" && leg.odds > 0) return false;
        // Only pick teams with winning records
        if (leg.teamRecord && leg.teamRecord.winRate < 0.5) return false;
        return true;
      })
      .sort((a, b) => {
        // Sort by implied probability (higher = safer) then edge
        const probDiff = b.impliedProb - a.impliedProb;
        if (Math.abs(probDiff) > 0.05) return probDiff;
        return b.edgeScore - a.edgeScore;
      });
    viable = sorted.filter((leg) => leg.edgeScore > 5);
  } else if (sortMode === "payout") {
    // HIGHEST PAYOUT: underdogs welcome, longer odds preferred
    sorted = [...allLegs].sort((a, b) => {
      // Prefer higher decimal odds (bigger payout)
      return b.decimalOdds - a.decimalOdds;
    });
    // Lower threshold — let underdogs through for payout mode
    viable = sorted.filter((leg) => leg.edgeScore > 2);
  } else {
    // BEST EV: mathematical edge (default)
    sorted = [...allLegs].sort((a, b) => b.edgeScore - a.edgeScore);
    viable = sorted.filter((leg) => leg.edgeScore > 10);
  }

  if (viable.length < numLegs) {
    // If not enough high-edge legs, fall back to best available
    while (viable.length < numLegs && viable.length < sorted.length) {
      viable.push(sorted[viable.length]);
    }
  }

  const parlays: Parlay[] = [];
  const usedCombinations = new Set<string>();

  // Greedy parlay construction:
  // Start from top-edge legs and build outward, ensuring no same-game parlays
  for (let attempt = 0; attempt < count * 20 && parlays.length < count; attempt++) {
    const selected: ScoredLeg[] = [];
    const usedGames = new Set<string>();

    // Shuffle the top legs slightly for variety on subsequent attempts
    const pool = [...viable];
    if (attempt > 0) {
      // Fisher-Yates partial shuffle of top candidates for variety
      for (let i = Math.min(pool.length - 1, numLegs * 4); i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      // Re-sort by edge but with some randomness
      pool.sort(
        (a, b) =>
          b.edgeScore -
          a.edgeScore +
          (Math.random() - 0.5) * (attempt * 2)
      );
    }

    for (const leg of pool) {
      if (selected.length >= numLegs) break;
      // No same-game parlays
      if (usedGames.has(leg.gameId)) continue;
      selected.push(leg);
      usedGames.add(leg.gameId);
    }

    if (selected.length < numLegs) continue;

    // Dedupe: check if this exact combo of picks was already used
    const comboKey = selected
      .map((l) => `${l.gameId}:${l.pick}`)
      .sort()
      .join("|");
    if (usedCombinations.has(comboKey)) continue;
    usedCombinations.add(comboKey);

    // Calculate parlay math
    const combinedDecimal = calculateParlayOdds(
      selected.map((l) => ({ decimalOdds: l.decimalOdds }))
    );

    // Use adjusted probability — boost implied prob based on edge score
    // Edge score > 20 means we think the real probability is higher than the book's implied prob
    const adjustedProbs = selected.map((leg) => {
      const edgeBoost = leg.edgeScore / 200; // edge of 40 = 20% boost to probability
      const adjusted = Math.min(0.95, leg.impliedProb * (1 + edgeBoost));
      return adjusted;
    });
    const combinedProb = adjustedProbs.reduce((acc, p) => acc * p, 1);

    const stake = 100;
    const ev = calculateEV(combinedDecimal, combinedProb, stake);
    const evPercent = (ev / stake) * 100;
    const payout = Math.round(combinedDecimal * stake * 100) / 100;
    const combinedAmerican = decimalToAmerican(combinedDecimal);

    // Confidence: average edge score of the legs, weighted by implied prob
    const avgEdge =
      selected.reduce((sum, l) => sum + l.edgeScore, 0) / selected.length;
    // Scale: avg edge of 20+ is high confidence, 5 is moderate
    const confidence = Math.min(100, Math.round(avgEdge * 3));

    // Find the most common book across legs — recommend placing full parlay there
    const bookCounts = new Map<string, number>();
    for (const l of selected) {
      bookCounts.set(l.book, (bookCounts.get(l.book) || 0) + 1);
    }
    const recommendedBook = [...bookCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || selected[0]?.book || "DraftKings";

    const parlay: Parlay = {
      id: `parlay_${Date.now()}_${parlays.length}`,
      legs: selected.map((l) => ({
        sport: l.sport,
        game: l.game,
        pick: l.pick,
        market: l.market,
        odds: l.odds,
        book: l.book,
        impliedProb: l.impliedProb,
        edgeScore: l.edgeScore,
        ...(l.teamRecord ? { teamRecord: l.teamRecord } : {}),
      })),
      combinedOdds: formatAmericanOdds(combinedAmerican),
      combinedDecimal: Math.round(combinedDecimal * 100) / 100,
      ev: Math.round(ev * 100) / 100,
      evPercent: Math.round(evPercent * 100) / 100,
      confidence,
      payout,
      timestamp: new Date().toISOString(),
      recommendedBook,
    };

    parlays.push(parlay);
  }

  // Sort based on mode
  if (sortMode === "payout") {
    parlays.sort((a, b) => b.payout - a.payout);
  } else if (sortMode === "confidence") {
    parlays.sort((a, b) => b.confidence - a.confidence);
  } else {
    parlays.sort((a, b) => b.ev - a.ev);
  }

  return parlays.slice(0, count);
}

// ─── API Data Fetching ───────────────────────────────────────────────────────

async function fetchOddsForSport(sportKey: string): Promise<OddsGame[]> {
  const url = `${BASE_URL}/sports/${sportKey}/odds/?apiKey=${ODDS_API_KEY}&regions=us&markets=h2h,spreads,totals&oddsFormat=american`;

  const res = await fetch(url, { next: { revalidate: 1800 } });

  if (!res.ok) {
    console.error(
      `Odds API error for ${sportKey}: ${res.status} ${res.statusText}`
    );
    return [];
  }

  const data: OddsGame[] = await res.json();
  return data;
}

// ─── Mock Data ───────────────────────────────────────────────────────────────

function generateMockParlays(
  sports: string[],
  numLegs: number,
  count: number
): ParlayResponse {
  const mockGames: Record<
    string,
    { away: string; home: string; sport: string }[]
  > = {
    nba: [
      { away: "Lakers", home: "Warriors", sport: "NBA" },
      { away: "Celtics", home: "76ers", sport: "NBA" },
      { away: "Nuggets", home: "Suns", sport: "NBA" },
      { away: "Bucks", home: "Heat", sport: "NBA" },
      { away: "Mavericks", home: "Thunder", sport: "NBA" },
    ],
    nfl: [
      { away: "Chiefs", home: "Bills", sport: "NFL" },
      { away: "49ers", home: "Eagles", sport: "NFL" },
      { away: "Cowboys", home: "Lions", sport: "NFL" },
      { away: "Ravens", home: "Bengals", sport: "NFL" },
    ],
    mlb: [
      { away: "Yankees", home: "Red Sox", sport: "MLB" },
      { away: "Dodgers", home: "Padres", sport: "MLB" },
      { away: "Braves", home: "Phillies", sport: "MLB" },
      { away: "Astros", home: "Rangers", sport: "MLB" },
    ],
    nhl: [
      { away: "Oilers", home: "Maple Leafs", sport: "NHL" },
      { away: "Panthers", home: "Rangers", sport: "NHL" },
      { away: "Avalanche", home: "Stars", sport: "NHL" },
    ],
    ufc: [
      { away: "Fighter A", home: "Fighter B", sport: "UFC" },
      { away: "Fighter C", home: "Fighter D", sport: "UFC" },
    ],
    ncaaf: [
      { away: "Alabama", home: "Georgia", sport: "NCAAF" },
      { away: "Ohio State", home: "Michigan", sport: "NCAAF" },
    ],
    ncaab: [
      { away: "Duke", home: "UNC", sport: "NCAAB" },
      { away: "Kansas", home: "Kentucky", sport: "NCAAB" },
    ],
    soccer: [
      { away: "Arsenal", home: "Liverpool", sport: "EPL" },
      { away: "Man City", home: "Chelsea", sport: "EPL" },
    ],
  };

  const mockMarkets = [
    { market: "moneyline", suffix: "ML" },
    { market: "spread", suffix: "" },
    { market: "total", suffix: "" },
  ];

  const books = [
    "DraftKings",
    "FanDuel",
    "BetMGM",
    "Caesars",
    "PointsBet",
  ];

  // Build a pool of mock legs from requested sports
  const allGames: { away: string; home: string; sport: string }[] = [];
  for (const sport of sports) {
    const games = mockGames[sport] || mockGames["nba"];
    allGames.push(...games);
  }

  const parlays: Parlay[] = [];

  for (let p = 0; p < count; p++) {
    const shuffled = [...allGames].sort(() => Math.random() - 0.5);
    const legs: ParlayLeg[] = [];

    for (let l = 0; l < numLegs && l < shuffled.length; l++) {
      const game = shuffled[l];
      const marketChoice =
        mockMarkets[Math.floor(Math.random() * mockMarkets.length)];
      const isHome = Math.random() > 0.5;
      const team = isHome ? game.home : game.away;

      let pick: string;
      let odds: number;

      if (marketChoice.market === "moneyline") {
        odds = isHome
          ? [-150, -130, -110, +120, +140][
              Math.floor(Math.random() * 5)
            ]
          : [+150, +130, +110, -120, -140][
              Math.floor(Math.random() * 5)
            ];
        pick = `${team} ML`;
      } else if (marketChoice.market === "spread") {
        const spread =
          (isHome ? -1 : 1) *
          [1.5, 2.5, 3.5, 4.5, 6.5][Math.floor(Math.random() * 5)];
        odds = [-110, -105, -115, +100, -120][
          Math.floor(Math.random() * 5)
        ];
        pick = `${team} ${spread > 0 ? "+" : ""}${spread}`;
      } else {
        const total = [200.5, 210.5, 215.5, 220.5, 225.5][
          Math.floor(Math.random() * 5)
        ];
        const overUnder = Math.random() > 0.5 ? "Over" : "Under";
        odds = [-110, -105, -115, +100, -108][
          Math.floor(Math.random() * 5)
        ];
        pick = `${overUnder} ${total}`;
      }

      const impliedProb = americanToImpliedProb(odds);

      legs.push({
        sport: game.sport,
        game: `${game.away} vs ${game.home}`,
        pick,
        market: marketChoice.market,
        odds,
        book: books[Math.floor(Math.random() * books.length)],
        impliedProb: Math.round(impliedProb * 10000) / 10000,
        edgeScore: Math.round((5 + Math.random() * 25) * 100) / 100,
      });
    }

    const combinedDecimal = legs.reduce(
      (acc, leg) => acc * americanToDecimal(leg.odds),
      1
    );
    const combinedProb = legs.reduce(
      (acc, leg) => acc * leg.impliedProb,
      1
    );
    const stake = 100;
    const ev = calculateEV(combinedDecimal, combinedProb, stake);
    const payout = Math.round(combinedDecimal * stake * 100) / 100;
    const combinedAmerican = decimalToAmerican(combinedDecimal);
    const avgEdge =
      legs.reduce((sum, l) => sum + l.edgeScore, 0) / legs.length;

    parlays.push({
      id: `parlay_mock_${Date.now()}_${p}`,
      legs,
      combinedOdds: formatAmericanOdds(combinedAmerican),
      combinedDecimal: Math.round(combinedDecimal * 100) / 100,
      ev: Math.round(ev * 100) / 100,
      evPercent: Math.round((ev / stake) * 10000) / 100,
      confidence: Math.min(100, Math.round(avgEdge * 3)),
      payout,
      timestamp: new Date().toISOString(),
    });
  }

  parlays.sort((a, b) => b.ev - a.ev);

  return {
    parlays,
    meta: {
      sportsScanned: sports,
      gamesAnalyzed: allGames.length,
      legsEvaluated: allGames.length * 6,
      generatedAt: new Date().toISOString(),
    },
  };
}

// ─── GET Handler ─────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Parse query params
    const sportsParam = searchParams.get("sports") || "nba,nfl,mlb";
    const sports = sportsParam
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s in SPORT_MAP);

    if (sports.length === 0) {
      return NextResponse.json(
        {
          error: "No valid sports provided",
          validSports: Object.keys(SPORT_MAP),
        },
        { status: 400 }
      );
    }

    const numLegs = Math.min(6, Math.max(2, parseInt(searchParams.get("legs") || "3", 10)));
    const count = Math.min(20, Math.max(1, parseInt(searchParams.get("count") || "5", 10)));
    const sortMode = (searchParams.get("sort") || "ev") as "ev" | "payout" | "confidence";

    // Check cache
    const cached = getCachedResponse(sports, numLegs, count, sortMode);
    if (cached) {
      return NextResponse.json(cached, {
        headers: {
          "X-Cache": "HIT",
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60",
        },
      });
    }

    // If no API key, return mock data
    if (!ODDS_API_KEY) {
      console.warn("ODDS_API_KEY not set — returning mock parlay data");
      const mockData = generateMockParlays(sports, numLegs, count);
      return NextResponse.json(mockData, {
        headers: {
          "X-Data-Source": "mock",
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60",
        },
      });
    }

    // Fetch odds AND team records for all requested sports in parallel
    const sportFetches = sports.map((sport) => {
      const sportKey = SPORT_MAP[sport];
      return Promise.all([
        fetchOddsForSport(sportKey).then((games) => ({ sport, games })),
        getTeamRecords(sportKey),
      ]);
    });

    const results = await Promise.allSettled(sportFetches);

    // Collect all games and extract scored legs
    const allLegs: ScoredLeg[] = [];
    let totalGames = 0;

    for (const result of results) {
      if (result.status !== "fulfilled") continue;
      const [{ sport, games }, teamRecords] = result.value;

      totalGames += games.length;

      for (const game of games) {
        const gameLegs = extractLegsFromGame(
          game,
          sport.toUpperCase(),
          teamRecords
        );
        allLegs.push(...gameLegs);
      }
    }

    // If no live data came back, fall back to mock
    if (allLegs.length === 0) {
      console.warn(
        "No odds data returned from API — falling back to mock data"
      );
      const mockData = generateMockParlays(sports, numLegs, count);
      return NextResponse.json(mockData, {
        headers: {
          "X-Data-Source": "mock-fallback",
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60",
        },
      });
    }

    // Build optimized parlays
    const parlays = buildParlays(allLegs, numLegs, count, sortMode);

    const response: ParlayResponse = {
      parlays,
      meta: {
        sportsScanned: sports.map((s) => s.toUpperCase()),
        gamesAnalyzed: totalGames,
        legsEvaluated: allLegs.length,
        generatedAt: new Date().toISOString(),
      },
    };

    // Cache the response
    setCachedResponse(response, sports, numLegs, count, sortMode);

    // Save parlays to tracking database (fire and forget, skip if recent insert)
    try {
      const { supabase } = await import("@/lib/supabase");

      // Check if we inserted parlays in the last 5 minutes to avoid duplicates
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const { count } = await supabase
        .from("parlays")
        .select("*", { count: "exact", head: true })
        .gte("created_at", fiveMinAgo);

      if (!count || count === 0) {
        const rows = parlays.map((p) => ({
          legs: p.legs,
          combined_odds: p.combinedOdds,
          combined_decimal: p.combinedDecimal,
          ev: p.ev,
          ev_percent: p.evPercent,
          confidence: p.confidence,
          payout: p.payout,
          legs_total: p.legs.length,
          sports: [...new Set(p.legs.map((l) => l.sport))],
        }));
        await supabase.from("parlays").insert(rows);
      }
    } catch (e) {
      console.error("Failed to track parlays:", e);
    }

    return NextResponse.json(response, {
      headers: {
        "X-Cache": "MISS",
        "X-Data-Source": "live",
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60",
      },
    });
  } catch (error) {
    console.error("Parlay engine error:", error);

    // On any error, return mock data so the frontend never breaks
    const mockData = generateMockParlays(["nba", "nfl", "mlb"], 3, 5);
    return NextResponse.json(mockData, {
      status: 200,
      headers: {
        "X-Data-Source": "mock-error-fallback",
      },
    });
  }
}
