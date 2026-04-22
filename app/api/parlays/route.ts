import { NextRequest, NextResponse } from "next/server";
import {
  getTeamRecords,
  getRecentScores,
  normalizeGames,
  getTeamEdge,
  type TeamRecord,
  type NormalizedGame,
} from "@/lib/sports-data";
import {
  calculateEloRatings,
  getEloEdge,
  type EloRating,
} from "@/lib/elo";
import { getSituationalEdge } from "@/lib/situational";

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
  impliedProb: number;   // book's implied probability (includes vig)
  ourProb: number;       // our estimate of true win probability
  trueEdge: number;      // ourProb - impliedProb, in decimal (0.05 = 5 point edge)
  edgeScore: number;     // legacy composite score, kept for back-compat
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

type ParlayCategory = "ev" | "payout" | "confidence";

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
  category: ParlayCategory;
  impliedHitRate: number; // what book's odds say — includes vig
  aiEstimate: number;     // model's take on true probability — edge if > impliedHitRate
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
  teamRecords?: Map<string, TeamRecord>,
  eloRatings?: Map<string, EloRating>,
  recentGames?: NormalizedGame[]
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
        const opponent = isHome ? game.away_team : game.home_team;
        const teamEdge = getTeamEdge(outcomeInfo.name, teamRecords, isHome);
        edgeScore += teamEdge;

        // ── Elo Edge ──────────────────────────────────────────────
        // Compares Elo-predicted win probability against the book's
        // implied probability. Weighted at 0.5 — Elo is predictive but
        // not absolute and we don't want it to fully dominate scoring.
        if (eloRatings) {
          const eloEdge = getEloEdge(
            outcomeInfo.name,
            opponent,
            impliedProb,
            eloRatings,
            isHome
          );
          edgeScore += eloEdge * 0.5;
        }

        // ── Situational Edge ──────────────────────────────────────
        // Rest days, letdown/bounce-back spots, short-turnaround
        // penalties. Applied at full weight — these factors are known
        // to move lines in predictable ways.
        if (recentGames && recentGames.length > 0) {
          const situationalEdge = getSituationalEdge(
            outcomeInfo.name,
            recentGames,
            isHome,
            game.commence_time
          );
          edgeScore += situationalEdge;
        }

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

      // ── Our probability estimate ────────────────────────────────
      // Compose a true-probability estimate from the signals the book
      // doesn't price: Elo win probability, recent form, home advantage.
      // Tuning is sport-specific because each league has different variance
      // profiles and different home-court effects.
      //
      // Starting point: de-vig the book's implied prob (US books run 4-5% vig).
      let ourProb = impliedProb / 1.045;

      // Sport-specific weights
      const sportTune: Record<string, { eloWeight: number; homeBonus: number }> = {
        NBA:   { eloWeight: 0.50, homeBonus: 90 },   // noisier, bigger home edge
        NHL:   { eloWeight: 0.65, homeBonus: 35 },   // Elo stable, small home edge
        MLB:   { eloWeight: 0.55, homeBonus: 20 },   // pitcher-driven, tiny home edge
        NFL:   { eloWeight: 0.60, homeBonus: 55 },
        NCAAF: { eloWeight: 0.55, homeBonus: 80 },
        NCAAB: { eloWeight: 0.50, homeBonus: 90 },
      };
      const tune = sportTune[sportLabel] ?? { eloWeight: 0.60, homeBonus: 65 };

      if (marketKey === "h2h" && teamRecords && eloRatings) {
        const isHome = outcomeInfo.name === game.home_team;
        const opponent = isHome ? game.away_team : game.home_team;
        const teamRating = eloRatings.get(outcomeInfo.name);
        const oppRating = eloRatings.get(opponent);
        if (teamRating && oppRating) {
          const homeBonus = isHome ? tune.homeBonus : -tune.homeBonus;
          const eloProb =
            1 /
            (1 +
              Math.pow(
                10,
                (oppRating.rating - teamRating.rating - homeBonus) / 400,
              ));
          // Sport-tuned blend of Elo with de-vigged book prob.
          ourProb = eloProb * tune.eloWeight + ourProb * (1 - tune.eloWeight);

          // Recent form: last 5 games weigh more than season-long winRate.
          // Recent form deviations from .500 nudge ourProb up to ±5 pts.
          const rec = teamRecords.get(outcomeInfo.name);
          if (rec) {
            const last5Wins = rec.lastFive.filter((x) => x === "W").length;
            const last5Rate =
              rec.lastFive.length > 0 ? last5Wins / rec.lastFive.length : 0.5;
            const formRate = last5Rate * 0.65 + rec.winRate * 0.35;
            ourProb += (formRate - 0.5) * 0.1;

            // Hot/cold streak tilt on top of form.
            if (rec.streak.type === "W" && rec.streak.count >= 4) ourProb += 0.02;
            if (rec.streak.type === "L" && rec.streak.count >= 4) ourProb -= 0.02;
          }
        }
      } else if (marketKey === "spreads" || marketKey === "totals") {
        // Spreads and totals are priced near 50/50 by design. Without a
        // margin-of-victory or pace model, our only honest edge signal is
        // raw line divergence — how much better the best book pays vs the
        // market average. Ignore the composite edgeScore here (it absorbs
        // team-record bonuses that only make sense for moneyline).
        //
        // rawLineEdge is typically 1-3% when there's real divergence. We
        // apply half of it to ourProb so a 2% better line ≈ 1% probability
        // edge. Anything larger should go through a dedicated model.
        const rawLineEdge = (bestDecimal - avgDecimal) / avgDecimal;
        ourProb += rawLineEdge * 0.5;
      }

      // Clamp ourProb to realistic range
      ourProb = Math.max(0.05, Math.min(0.95, ourProb));
      const trueEdge = ourProb - impliedProb;

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
        ourProb: Math.round(ourProb * 10000) / 10000,
        trueEdge: Math.round(trueEdge * 10000) / 10000,
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

  // Sort all legs by the ranking signal for this mode. We DON'T hard-filter
  // by trueEdge here — the parlay-level EV gate downstream (evPercent >= 5
  // at insert time) decides what actually enters the public track record.
  // This way /parlays always has picks to browse even on thin-edge days,
  // but /results only commits to the subset the model really stands behind.
  if (sortMode === "confidence") {
    // MOST CONFIDENT: favorites with highest ourProb, with sanity filters.
    sorted = [...allLegs]
      .filter((leg) => {
        if (leg.market === "moneyline" && leg.odds > 0) return false;
        if (leg.teamRecord && leg.teamRecord.winRate < 0.5) return false;
        return true;
      })
      .sort((a, b) => b.ourProb - a.ourProb);
    viable = sorted;
  } else if (sortMode === "payout") {
    // HIGHEST PAYOUT: sort by decimal odds (bigger payouts first), tiebreak
    // on trueEdge so we don't pick pure coin flips.
    sorted = [...allLegs].sort((a, b) => {
      const decDiff = b.decimalOdds - a.decimalOdds;
      if (Math.abs(decDiff) > 0.1) return decDiff;
      return b.trueEdge - a.trueEdge;
    });
    viable = sorted;
  } else {
    // BEST EV: sort purely by trueEdge — ourProb minus book-implied.
    sorted = [...allLegs].sort((a, b) => b.trueEdge - a.trueEdge);
    viable = sorted;
  }

  // Need at least enough legs across different games to build one parlay.
  if (viable.length < numLegs) {
    return [];
  }

  const parlays: Parlay[] = [];
  const usedCombinations = new Set<string>();

  // Greedy parlay construction: start from top legs, no same-game parlays.
  for (let attempt = 0; attempt < count * 20 && parlays.length < count; attempt++) {
    const selected: ScoredLeg[] = [];
    const usedGames = new Set<string>();

    // Shuffle the top legs slightly for variety on subsequent attempts.
    // Uses trueEdge now (not the legacy composite) as the ranking signal.
    const pool = [...viable];
    if (attempt > 0) {
      for (let i = Math.min(pool.length - 1, numLegs * 4); i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      pool.sort(
        (a, b) =>
          b.trueEdge -
          a.trueEdge +
          (Math.random() - 0.5) * (attempt * 0.02),
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

    // Parlay probability = product of each leg's TRUE probability estimate.
    // No more inflating by arbitrary edge boosts — ourProb is already the
    // probability after de-vig + Elo + form adjustments. Compounding it across
    // legs gives the real parlay hit rate the model is projecting.
    const combinedProb = selected.reduce((acc, leg) => acc * leg.ourProb, 1);

    const stake = 100;
    const ev = calculateEV(combinedDecimal, combinedProb, stake);
    const evPercent = (ev / stake) * 100;
    const payout = Math.round(combinedDecimal * stake * 100) / 100;
    const combinedAmerican = decimalToAmerican(combinedDecimal);

    // Confidence = combined true probability, mapped to a 0-100 scale.
    // A parlay projected to hit 40% of the time = confidence 40. Parlay
    // projected to hit 20% = confidence 20. This is a REAL number, not an
    // aggregated composite score. Used as the track-record gate downstream.
    const confidence = Math.min(100, Math.round(combinedProb * 100));

    // Find the most common book across legs — recommend placing full parlay there
    const bookCounts = new Map<string, number>();
    for (const l of selected) {
      bookCounts.set(l.book, (bookCounts.get(l.book) || 0) + 1);
    }
    const recommendedBook = [...bookCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || selected[0]?.book || "DraftKings";

    // Implied hit rate = what the book's odds say the parlay will cash at
    // (includes the vig — this is the honest number a bettor should look at).
    // AI estimate = model's take on the true probability after removing vig
    // and applying edge adjustments. If aiEstimate > impliedHitRate, we see
    // positive EV — the sell of this product.
    const impliedHitRate = Math.round((1 / combinedDecimal) * 10000) / 100;
    const aiEstimate = Math.round(combinedProb * 10000) / 100;

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
      category: sortMode,
      impliedHitRate,
      aiEstimate,
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
  count: number,
  sortMode: ParlayCategory = "ev"
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
      category: sortMode,
      impliedHitRate: Math.round((1 / combinedDecimal) * 10000) / 100,
      aiEstimate: Math.round(combinedProb * 10000) / 100,
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
      const mockData = generateMockParlays(sports, numLegs, count, sortMode);
      return NextResponse.json(mockData, {
        headers: {
          "X-Data-Source": "mock",
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60",
        },
      });
    }

    // Fetch odds, team records, AND raw scores (for Elo/situational) in parallel
    const sportFetches = sports.map((sport) => {
      const sportKey = SPORT_MAP[sport];
      return Promise.all([
        fetchOddsForSport(sportKey).then((games) => ({ sport, games })),
        getTeamRecords(sportKey),
        getRecentScores(sportKey),
      ]);
    });

    const results = await Promise.allSettled(sportFetches);

    // Collect all games and extract scored legs
    const allLegs: ScoredLeg[] = [];
    let totalGames = 0;
    const lineHistoryRows: Array<{
      game_id: string;
      sport: string;
      market: string;
      team: string;
      point: number | null;
      best_odds: number;
      best_book: string | null;
      avg_odds: number | null;
    }> = [];

    for (const result of results) {
      if (result.status !== "fulfilled") continue;
      const [{ sport, games }, teamRecords, rawScores] = result.value;

      // Normalize raw scores once per sport and feed Elo + situational
      const normalized = normalizeGames(rawScores);
      const eloRatings = calculateEloRatings(
        normalized.map((g) => ({
          home_team: g.home,
          away_team: g.away,
          home_score: g.homeScore,
          away_score: g.awayScore,
          completed: g.completed,
        }))
      );

      totalGames += games.length;

      for (const game of games) {
        const gameLegs = extractLegsFromGame(
          game,
          sport.toUpperCase(),
          teamRecords,
          eloRatings,
          normalized
        );
        allLegs.push(...gameLegs);

        // Capture current best lines for line-history snapshot
        for (const leg of gameLegs) {
          lineHistoryRows.push({
            game_id: leg.gameId,
            sport: leg.sport,
            market: leg.market,
            team: leg.pick,
            point: null,
            best_odds: leg.odds,
            best_book: leg.book,
            avg_odds: null,
          });
        }
      }
    }

    // If no live data came back, fall back to mock
    if (allLegs.length === 0) {
      console.warn(
        "No odds data returned from API — falling back to mock data"
      );
      const mockData = generateMockParlays(sports, numLegs, count, sortMode);
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
        // Only track parlays that have real positive expected value.
        // evPercent > 5 means our model projects >5% EV over many bets —
        // enough buffer to absorb model error while still showing +EV.
        // Legs were already gated at trueEdge >= 3% per leg upstream, so this
        // is a belt-and-suspenders check at the parlay level.
        const MIN_EV_TO_TRACK = 5;
        const trackable = parlays.filter((p) => p.evPercent >= MIN_EV_TO_TRACK);

        if (trackable.length > 0) {
          const baseRows = trackable.map((p) => ({
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
          const rowsWithCategory = baseRows.map((r, i) => ({
            ...r,
            category: trackable[i].category,
          }));

          // Try with category first; fall back without it if the column
          // migration (010_parlay_category.sql) hasn't been applied.
          const { error: insertErr } = await supabase
            .from("parlays")
            .insert(rowsWithCategory);

          if (insertErr && /category/i.test(insertErr.message || "")) {
            await supabase.from("parlays").insert(baseRows);
          }
        }

        // Snapshot current best lines for movement analysis.
        // Gated on the same 5-minute window as parlay inserts to avoid
        // hammering the table on every request.
        if (lineHistoryRows.length > 0) {
          try {
            await supabase.from("line_history").insert(lineHistoryRows);
          } catch (err) {
            console.error("Failed to snapshot line_history:", err);
          }
        }
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
