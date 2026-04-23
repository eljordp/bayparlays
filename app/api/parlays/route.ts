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
import {
  coverProbability,
  expectedMargin,
  expectedTotal,
  isPlayoffPeriod,
  playoffDampedEloProb,
  totalProbability,
} from "@/lib/game-model";
import { detectSharpEdge } from "@/lib/fair-odds";
import { fetchGameWeather, type WeatherSignal } from "@/lib/weather";
import {
  fetchProbablePitchers,
  findGameLineup,
  pitcherMatchupBias,
  type GameLineup,
} from "@/lib/mlb-lineups";
import { readQuotaHeaders, persistQuota, canFetch } from "@/lib/odds-quota";

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
  commenceTime: string;  // ISO string — when this game is scheduled to start
  pick: string;
  market: string;
  odds: number;
  decimalOdds: number;
  book: string;
  bookCount: number;     // how many books priced this outcome (signal strength)
  impliedProb: number;   // book's implied probability (includes vig)
  ourProb: number;       // our estimate of true win probability
  trueEdge: number;      // ourProb - impliedProb, in decimal (0.05 = 5 point edge)
  edgeScore: number;     // legacy composite score, kept for back-compat
  scored: boolean;       // true if we had real signal to compute ourProb (not just de-vig)
  homeTeam: string;
  awayTeam: string;
  teamRecord?: TeamRecordInfo;
  // ── New signals (Apr 2026) ───────────────────────────────────────────
  fairProb?: number;     // de-vigged no-vig consensus across books
  sharpEdge?: boolean;   // best book is >2% EV vs no-vig consensus
  evVsFair?: number;     // decimal EV of best odds against fair prob
  weatherNote?: string | null;  // e.g. "90F heat, 18mph wind"
  pitcherNote?: string | null;  // e.g. "ace-vs-ace (avg ERA <3.25)"
}

interface ParlayLeg {
  sport: string;
  game: string;
  gameId?: string;
  commenceTime?: string;
  pick: string;
  market: string;
  odds: number;
  book: string;
  bookCount?: number;
  impliedProb: number;
  ourProb?: number;        // AI's true-probability estimate
  trueEdge?: number;       // ourProb - impliedProb
  edgeScore: number;
  scored?: boolean;        // true if we had real model signal for this leg
  teamRecord?: TeamRecordInfo;
  reasons?: string[];      // plain-English bullets explaining why we took it
  fairProb?: number;
  sharpEdge?: boolean;
  evVsFair?: number;
  weatherNote?: string | null;
  pitcherNote?: string | null;
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
    legsEvaluated: number;   // total legs pulled from all books
    legsScored: number;      // subset we could score with real model signal
    poolSize: number;        // how many legs made it into the ranked pool
    tier: string;
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

/**
 * For a given outcome, figure out the opposite side of the two-way market.
 * Used to de-vig each book's prices into a no-vig fair probability.
 */
function findOppositeOutcome(
  game: OddsGame,
  marketKey: string,
  outcomeName: string,
  outcomePoint?: number
): { name: string; point?: number } | null {
  if (marketKey === "h2h") {
    if (outcomeName === game.home_team) return { name: game.away_team };
    if (outcomeName === game.away_team) return { name: game.home_team };
    return null;
  }
  if (marketKey === "spreads" && outcomePoint !== undefined) {
    const otherTeam =
      outcomeName === game.home_team ? game.away_team : game.home_team;
    return { name: otherTeam, point: -outcomePoint };
  }
  if (marketKey === "totals" && outcomePoint !== undefined) {
    const oppName =
      outcomeName.toLowerCase() === "over" ? "Under" : "Over";
    return { name: oppName, point: outcomePoint };
  }
  return null;
}

/**
 * Return paired [side, opposite] odds for each book that prices both sides
 * of this two-way market. Used for proper per-book de-vigging.
 */
function findTwoWayBookPairs(
  bookmakers: OddsBookmaker[],
  marketKey: string,
  sideName: string,
  sidePoint: number | undefined,
  oppName: string,
  oppPoint: number | undefined
): { side: number; opposite: number }[] {
  const pairs: { side: number; opposite: number }[] = [];
  for (const bm of bookmakers) {
    const market = bm.markets.find((m) => m.key === marketKey);
    if (!market) continue;
    const side = market.outcomes.find(
      (o) =>
        o.name === sideName &&
        (sidePoint === undefined || o.point === sidePoint)
    );
    const opp = market.outcomes.find(
      (o) =>
        o.name === oppName &&
        (oppPoint === undefined || o.point === oppPoint)
    );
    if (side && opp) pairs.push({ side: side.price, opposite: opp.price });
  }
  return pairs;
}

interface ExtractCtx {
  weather?: WeatherSignal | null;
  lineup?: GameLineup | null;
}

function extractLegsFromGame(
  game: OddsGame,
  sportLabel: string,
  teamRecords?: Map<string, TeamRecord>,
  eloRatings?: Map<string, EloRating>,
  recentGames?: NormalizedGame[],
  ctx?: ExtractCtx
): ScoredLeg[] {
  // Skip games that have already started. Sportsbooks sometimes keep live
  // odds in the /odds feed after tip-off — we don't want those in new parlays
  // because users can't realistically bet them anymore.
  const now = Date.now();
  if (new Date(game.commence_time).getTime() <= now) {
    return [];
  }

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

      // ── No-vig fair probability + sharp-edge detection ──────────
      // Pair each book's side/opposite odds, de-vig per book, take the
      // median across books as the no-vig consensus. This is a much better
      // prior than the flat /1.045 hack we used before — vig varies by
      // market (sides ~4%, totals ~4.5%, heavy favorites can be 6%+).
      const oppositeInfo = findOppositeOutcome(
        game,
        marketKey,
        outcomeInfo.name,
        outcomeInfo.point,
      );
      let fairProb: number | null = null;
      let sharpEdgeFlag = false;
      let evVsFairNum = 0;
      if (oppositeInfo) {
        const pairs = findTwoWayBookPairs(
          game.bookmakers,
          marketKey,
          outcomeInfo.name,
          outcomeInfo.point,
          oppositeInfo.name,
          oppositeInfo.point,
        );
        if (pairs.length >= 2) {
          const sharp = detectSharpEdge(best.bestOdds, pairs);
          fairProb = sharp.fairProb;
          sharpEdgeFlag = sharp.isSharpEdge;
          evVsFairNum = sharp.bestEv;
          if (sharp.isSharpEdge) {
            edgeScore = Math.min(100, edgeScore + sharp.confidenceBoost);
          }
        }
      }
      // Starting ourProb: no-vig fair prob if we have it, otherwise fall
      // back to the old flat-vig approximation.
      let ourProb = fairProb !== null ? fairProb : impliedProb / 1.045;

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

      // Detect whether we're in the postseason for this sport — used to
      // dampen Elo predictions + widen spread/total variance downstream.
      const inPlayoffs = isPlayoffPeriod(
        sportLabel,
        new Date(game.commence_time),
      );

      // Track whether this leg was actually scored with real model signal,
      // vs. just falling back to de-vigged book prior. Unscored legs get
      // filtered out before parlay construction — studying 218 legs is
      // worthless if half of them are unscored noise.
      let wasScored = false;

      if (marketKey === "h2h" && (teamRecords || eloRatings)) {
        const isHome = outcomeInfo.name === game.home_team;
        const opponent = isHome ? game.away_team : game.home_team;
        const teamRating = eloRatings?.get(outcomeInfo.name);
        const oppRating = eloRatings?.get(opponent);
        const rec = teamRecords?.get(outcomeInfo.name);
        const oppRec = teamRecords?.get(opponent);

        // Collect whatever independent signals are available. Partial data
        // (one team has record, the other doesn't) still counts — we just
        // use a heuristic fallback. Better than reverting to pure book prior.
        const modelEstimates: { p: number; w: number }[] = [];

        // Elo: need both ratings for head-to-head comparison.
        if (teamRating && oppRating) {
          const homeBonus = isHome ? tune.homeBonus : -tune.homeBonus;
          const eloProb = playoffDampedEloProb(
            teamRating.rating,
            oppRating.rating,
            homeBonus,
            inPlayoffs,
          );
          modelEstimates.push({ p: eloProb, w: 0.4 });
        }

        // winRate: Pythagorean matchup if we have both, solo fallback otherwise.
        if (rec && oppRec) {
          const teamRate = Math.max(0.1, rec.winRate);
          const oppRate = Math.max(0.1, oppRec.winRate);
          let recordProb = teamRate / (teamRate + oppRate);
          recordProb = Math.min(
            0.95,
            Math.max(0.05, recordProb + (isHome ? 0.03 : -0.03)),
          );
          modelEstimates.push({ p: recordProb, w: 0.6 });
        } else if (rec) {
          // Solo fallback: pick team's winRate pulled toward .500, with a
          // small home/away tilt. Not as strong as matchup — lower weight.
          const pullToward500 = 0.5 + (rec.winRate - 0.5) * 0.6;
          const adjusted = Math.min(
            0.9,
            Math.max(0.1, pullToward500 + (isHome ? 0.03 : -0.03)),
          );
          modelEstimates.push({ p: adjusted, w: 0.3 });
        }

        if (modelEstimates.length >= 1) {
          const totalW = modelEstimates.reduce((s, x) => s + x.w, 0);
          const modelProb =
            modelEstimates.reduce((s, x) => s + x.p * x.w, 0) / totalW;
          ourProb = modelProb * 0.7 + ourProb * 0.3;
          wasScored = true;
        }

        // Form + streak nudges on top.
        if (rec) {
          const last5Wins = rec.lastFive.filter((x) => x === "W").length;
          const last5Rate =
            rec.lastFive.length > 0 ? last5Wins / rec.lastFive.length : 0.5;
          const formRate = last5Rate * 0.65 + rec.winRate * 0.35;
          ourProb += (formRate - 0.5) * 0.1;

          if (rec.streak.type === "W" && rec.streak.count >= 4) ourProb += 0.02;
          if (rec.streak.type === "L" && rec.streak.count >= 4) ourProb -= 0.02;
        }
      } else if (marketKey === "spreads" && eloRatings && outcomeInfo.point !== undefined) {
        // Spreads: use Elo differential + sport-specific Elo-per-point to
        // estimate expected margin of victory, then Normal distribution over
        // sport-specific variance to compute P(pick covers).
        const pickIsHome = outcomeInfo.name === game.home_team;
        const homeRating = eloRatings.get(game.home_team)?.rating;
        const awayRating = eloRatings.get(game.away_team)?.rating;
        const expMargin = expectedMargin(
          sportLabel,
          homeRating,
          awayRating,
          tune.homeBonus,
          inPlayoffs,
        );
        if (expMargin !== null) {
          // outcomeInfo.point is the spread for THIS outcome. E.g. if team
          // is home and line is -3.5, outcomeInfo.point = -3.5. We need the
          // spread from the home team's perspective for cover probability.
          const homeSpread = pickIsHome
            ? outcomeInfo.point
            : -outcomeInfo.point;
          const coverProb = coverProbability(
            sportLabel,
            pickIsHome,
            homeSpread,
            expMargin,
            inPlayoffs,
          );
          ourProb = coverProb;
          wasScored = true;
        }
      } else if (marketKey === "totals" && outcomeInfo.point !== undefined && recentGames) {
        // Totals: use recent scoring for both teams to estimate expected
        // combined total, then Normal distribution to price over/under.
        const expTotal = expectedTotal(
          sportLabel,
          game.home_team,
          game.away_team,
          recentGames,
          inPlayoffs,
        );
        if (expTotal !== null) {
          // MLB-only: apply weather + probable-pitcher biases to the expected
          // total before computing P(over) / P(under). Both bias values are
          // conservative (+/-0.25 max) so the Normal-distribution math stays
          // well-behaved. Other sports fall through with base expTotal.
          let adjustedTotal = expTotal;
          if (sportLabel === "MLB") {
            if (ctx?.weather?.run_bias) {
              adjustedTotal += ctx.weather.run_bias;
            }
            if (ctx?.lineup) {
              const { bias } = pitcherMatchupBias(ctx.lineup);
              adjustedTotal += bias;
            }
          }

          const pickIsOver = outcomeInfo.name.toLowerCase() === "over";
          ourProb = totalProbability(
            sportLabel,
            pickIsOver,
            outcomeInfo.point,
            adjustedTotal,
            inPlayoffs,
          );
          wasScored = true;
        }
      }

      // Clamp ourProb to realistic range
      ourProb = Math.max(0.05, Math.min(0.95, ourProb));
      const trueEdge = ourProb - impliedProb;

      // Pitcher note — only meaningful for MLB legs
      let pitcherNote: string | null = null;
      if (sportLabel === "MLB" && ctx?.lineup) {
        const { reason } = pitcherMatchupBias(ctx.lineup);
        pitcherNote = reason;
      }
      const weatherNote =
        sportLabel === "MLB" && ctx?.weather?.reason
          ? ctx.weather.reason
          : null;

      legs.push({
        sport: sportLabel,
        sportKey: game.sport_key,
        gameId: game.id,
        game: gameLabel,
        commenceTime: game.commence_time,
        pick,
        market: marketLabel,
        odds: best.bestOdds,
        decimalOdds: bestDecimal,
        book: best.bestBook,
        bookCount: best.allOdds.length,
        impliedProb: Math.round(impliedProb * 10000) / 10000,
        ourProb: Math.round(ourProb * 10000) / 10000,
        trueEdge: Math.round(trueEdge * 10000) / 10000,
        edgeScore,
        scored: wasScored,
        homeTeam: game.home_team,
        awayTeam: game.away_team,
        teamRecord: teamRecordInfo,
        fairProb: fairProb !== null ? Math.round(fairProb * 10000) / 10000 : undefined,
        sharpEdge: sharpEdgeFlag,
        evVsFair: Math.round(evVsFairNum * 10000) / 10000,
        weatherNote,
        pitcherNote,
      });
    }
  }

  return legs;
}

// ─── Reasons Builder ─────────────────────────────────────────────────────────
// Translates a ScoredLeg's internal signals into 2-4 plain-English bullets
// a non-analytics user can read and decide from.

function buildReasons(leg: ScoredLeg): string[] {
  const reasons: string[] = [];

  // 1. AI vs book — the core signal. Frame positive edge as a value signal,
  // negative edge as a warning (the AI thinks the book has it overpriced).
  const aiPct = (leg.ourProb * 100).toFixed(1);
  const bookPct = (leg.impliedProb * 100).toFixed(1);
  const edgePts = leg.trueEdge * 100;
  if (edgePts >= 2) {
    reasons.push(
      `AI sees value: model estimates ${aiPct}% chance to hit vs book's ${bookPct}% — ${edgePts.toFixed(1)} pt edge in our favor.`,
    );
  } else if (edgePts <= -2) {
    reasons.push(
      `⚠ AI flags this as overpriced: model estimates ${aiPct}% vs book's ${bookPct}%. Included only because stronger picks weren't available today.`,
    );
  } else if (leg.scored) {
    reasons.push(
      `AI estimate (${aiPct}%) tracks close to book's price (${bookPct}%). Pick rests on other factors — no visible mispricing.`,
    );
  } else {
    reasons.push(
      `AI couldn't independently estimate this leg (thin data). Book consensus from ${leg.bookCount} sportsbooks priced it at ${bookPct}%.`,
    );
  }

  // 2. Team form (only for moneyline/spread where team matters)
  if (leg.teamRecord && leg.market !== "total") {
    const rec = leg.teamRecord;
    const record = `${rec.wins}-${rec.losses}`;
    const streakLabel =
      rec.streak.count >= 2
        ? ` · ${rec.streak.type}${rec.streak.count} streak`
        : "";
    reasons.push(
      `Team record: ${record} (${Math.round(rec.winRate * 100)}% win rate)${streakLabel}.`,
    );

    if (rec.lastFive && rec.lastFive.length > 0) {
      const last5 = rec.lastFive.join("");
      const last5Wins = rec.lastFive.filter((x) => x === "W").length;
      reasons.push(
        `Last 5 games: ${last5} (${last5Wins}/${rec.lastFive.length} wins).`,
      );
    }
  }

  // 3. Line-shopping / market consensus
  if (leg.bookCount && leg.bookCount >= 4) {
    reasons.push(
      `Best price across ${leg.bookCount} sportsbooks at ${leg.book} — ${leg.odds > 0 ? "+" : ""}${leg.odds}.`,
    );
  }

  // 4. Sharp-edge flag — best book's price beats no-vig consensus by 2%+
  if (leg.sharpEdge && leg.evVsFair !== undefined && leg.fairProb !== undefined) {
    const evPct = (leg.evVsFair * 100).toFixed(1);
    const fairPct = (leg.fairProb * 100).toFixed(1);
    reasons.push(
      `Sharp edge flagged: ${leg.book} priced this at ${evPct}% EV vs no-vig consensus of ${fairPct}%. Retail books can be slow to tighten lines after sharp moves elsewhere.`,
    );
  }

  // 5. Weather note (MLB totals — only when outdoor + meaningful conditions)
  if (leg.weatherNote && leg.market === "total") {
    reasons.push(`Weather read: ${leg.weatherNote}.`);
  }

  // 6. Pitcher matchup note (MLB)
  if (leg.pitcherNote) {
    reasons.push(`Pitching: ${leg.pitcherNote}.`);
  }

  return reasons;
}

// ─── Parlay Builder ──────────────────────────────────────────────────────────

// Pool size is the same across tiers — analyzing more legs is basically
// free once the Odds API call has been made. What tier controls is OUTPUT
// curation + access to analytics tools, not how many legs we scan.
// Tighter minBooks at lower tiers means only strongly-priced consensus
// lines reach free users (extra noise filter on a casual audience).
const TIER_CONFIG: Record<
  string,
  { poolSize: number; minBooks: number }
> = {
  free:  { poolSize: 150, minBooks: 3 },
  sharp: { poolSize: 150, minBooks: 3 },
  vip:   { poolSize: 150, minBooks: 2 },
  admin: { poolSize: 200, minBooks: 2 },
};

function buildParlays(
  allLegs: ScoredLeg[],
  numLegs: number,
  count: number,
  sortMode: "ev" | "payout" | "confidence" = "ev",
  tier: string = "sharp",
): Parlay[] {
  let sorted: ScoredLeg[];
  let viable: ScoredLeg[];

  const cfg = TIER_CONFIG[tier] ?? TIER_CONFIG.sharp;

  // Drop thin-market legs — consensus from ≥3 books is worth trusting,
  // but a 1-book outlier is probably noise or stale.
  const qualityLegs = allLegs.filter((leg) => leg.bookCount >= cfg.minBooks);

  // Prefer legs with positive edge. A negative-edge leg means the AI thinks
  // the book has this pick OVERPRICED — recommending it as a "lock" would be
  // product malpractice. We still allow near-neutral legs (down to -1pt) so
  // the slate isn't empty when the market is tightly priced, but true
  // anti-picks (AI clearly disagrees) get cut.
  const EDGE_FLOOR = -0.01;
  const positiveEdgeLegs = qualityLegs.filter(
    (leg) => leg.trueEdge >= EDGE_FLOOR,
  );

  // Fallback — if nothing has positive edge today, let the full pool
  // through. Downstream UI labels these as "no edge detected" so we don't
  // pretend to have one.
  const basePool =
    positiveEdgeLegs.length >= cfg.poolSize / 4
      ? positiveEdgeLegs
      : qualityLegs;

  // Sort by ranking signal for this mode, then cap to tier's pool size.
  if (sortMode === "confidence") {
    // Most Confident = highest AI probability AMONG edge-positive picks.
    // Tiebreak on trueEdge so bigger market mispricings rank above
    // ties on raw probability.
    sorted = [...basePool]
      .filter((leg) => {
        if (leg.market === "moneyline" && leg.odds > 0) return false;
        if (leg.teamRecord && leg.teamRecord.winRate < 0.5) return false;
        return true;
      })
      .sort((a, b) => {
        const pDiff = b.ourProb - a.ourProb;
        if (Math.abs(pDiff) > 0.01) return pDiff;
        return b.trueEdge - a.trueEdge;
      })
      .slice(0, cfg.poolSize);
    viable = sorted;
  } else if (sortMode === "payout") {
    sorted = [...basePool]
      .sort((a, b) => {
        const decDiff = b.decimalOdds - a.decimalOdds;
        if (Math.abs(decDiff) > 0.1) return decDiff;
        return b.trueEdge - a.trueEdge;
      })
      .slice(0, cfg.poolSize);
    viable = sorted;
  } else {
    // BEST EV: sort purely by trueEdge — ourProb minus book-implied.
    sorted = [...basePool]
      .sort((a, b) => b.trueEdge - a.trueEdge)
      .slice(0, cfg.poolSize);
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

    // Minimum payout gate per sort mode. Nobody bets $10 to win $5 — heavy-
    // favorite juice parlays (combined -185) are structurally bad even if
    // they hit 65% of the time. Confidence mode needs real upside; payout
    // mode needs actual longshots; EV mode is math-driven and can flex.
    //
    //   confidence: min +200 (decimal 3.0) — $10 pays at least $30 profit
    //   payout:     min +600 (decimal 7.0) — real swings, not mid-odds
    //   ev:         min +100 (decimal 2.0) — basic "actually worth stacking"
    const minDecimalByMode: Record<typeof sortMode, number> = {
      confidence: 3.0,
      payout: 7.0,
      ev: 2.0,
    };
    if (combinedDecimal < minDecimalByMode[sortMode]) continue;

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
        gameId: l.gameId,
        commenceTime: l.commenceTime,
        pick: l.pick,
        market: l.market,
        odds: l.odds,
        book: l.book,
        bookCount: l.bookCount,
        impliedProb: l.impliedProb,
        ourProb: Math.round(l.ourProb * 10000) / 10000,
        trueEdge: Math.round(l.trueEdge * 10000) / 10000,
        edgeScore: l.edgeScore,
        scored: l.scored,
        reasons: buildReasons(l),
        ...(l.teamRecord ? { teamRecord: l.teamRecord } : {}),
        ...(l.fairProb !== undefined ? { fairProb: l.fairProb } : {}),
        ...(l.sharpEdge ? { sharpEdge: true } : {}),
        ...(l.evVsFair !== undefined ? { evVsFair: l.evVsFair } : {}),
        ...(l.weatherNote ? { weatherNote: l.weatherNote } : {}),
        ...(l.pitcherNote ? { pitcherNote: l.pitcherNote } : {}),
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
  // Gate: if we're within 10 credits of the monthly cap, skip live fetch and
  // let the upstream cache/mock path handle the response. Protects against
  // accidentally burning our buffer during high-traffic moments.
  const safeToFetch = await canFetch(10);
  if (!safeToFetch) {
    console.warn(`Odds API quota low — skipping fetch for ${sportKey}`);
    return [];
  }

  const url = `${BASE_URL}/sports/${sportKey}/odds/?apiKey=${ODDS_API_KEY}&regions=us&markets=h2h,spreads,totals&oddsFormat=american`;

  const res = await fetch(url, { next: { revalidate: 1800 } });

  // Persist quota headers on every response (success or error — both count).
  const snap = readQuotaHeaders(res.headers);
  if (snap) {
    void persistQuota(snap);
  }

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
      legsScored: 0,
      poolSize: 0,
      tier: "mock",
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
    const count = Math.min(30, Math.max(1, parseInt(searchParams.get("count") || "5", 10)));
    const sortMode = (searchParams.get("sort") || "ev") as "ev" | "payout" | "confidence";
    // format=legs returns the scored leg pool instead of parlays — powers
    // the /edges feed which hunts single-leg +EV picks. Shares the same
    // fetch pipeline so there's no additional Odds API credit cost.
    const format = (searchParams.get("format") || "parlays").toLowerCase();
    // Tier controls pre-filter strictness + pool size. Higher tiers get
    // access to more legs (less aggressive culling) since VIPs/admins want
    // the wider slate. Free users get the tightest-quality pool.
    const tier = (searchParams.get("tier") || "sharp").toLowerCase();

    // Check cache (cache key includes tier — free/sharp/vip responses differ)
    const cached = getCachedResponse(sports, numLegs, count, sortMode + ":" + tier);
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

    // MLB lineups & weather: free APIs, fetched once per request when MLB is
    // in the sport list. Probable pitchers keyed by home+away for lookup.
    const mlbLineupsPromise: Promise<GameLineup[]> = sports.includes("mlb")
      ? fetchProbablePitchers(new Date().toISOString().slice(0, 10))
      : Promise.resolve([]);

    const [results, mlbLineups] = await Promise.all([
      Promise.allSettled(sportFetches),
      mlbLineupsPromise,
    ]);

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
        // Build per-game context (MLB only — other sports get undefined ctx)
        let ctx: ExtractCtx | undefined;
        if (sport === "mlb") {
          const lineup = findGameLineup(
            mlbLineups,
            game.home_team,
            game.away_team,
          );
          // Weather fetch is async, cached in Supabase (6hr TTL) so sequential
          // loop stays fast after first pass. Wrapped in try/catch — failures
          // shouldn't break the whole pipeline.
          let weather: WeatherSignal | null = null;
          try {
            weather = await fetchGameWeather(
              game.home_team,
              game.id,
              game.commence_time,
            );
          } catch {
            weather = null;
          }
          ctx = { weather, lineup };
        }

        const gameLegs = extractLegsFromGame(
          game,
          sport.toUpperCase(),
          teamRecords,
          eloRatings,
          normalized,
          ctx,
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

    // Loud warning when the model silently broke. If we evaluated a real
    // pool of legs but scored ZERO of them with model signal, the upstream
    // data feed is dead (common cause: Odds API credits exhausted). Every
    // leg will fall back to naive de-vig, producing fake -EV "AI" numbers.
    // Log it so it's visible in Vercel logs — don't just return garbage.
    const legsScoredCheck = allLegs.filter((l) => l.scored).length;
    if (allLegs.length >= 20 && legsScoredCheck === 0) {
      console.error(
        `⚠ MODEL SILENT FAILURE: evaluated ${allLegs.length} legs but scored 0. ` +
        `Team records / Elo / situational all empty. Likely cause: Odds API ` +
        `credit exhaustion or sports-data.ts fetch failing. Sports: ${sports.join(",")}`,
      );
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

    // format=legs branch — return scored legs (not parlays) for the /edges
    // feed. Surfaces single-leg sharp-edge picks which is a strictly honest
    // product: "here's where the book is mispricing today."
    if (format === "legs") {
      // Filter to meaningful picks only. We want either sharpEdge flag OR a
      // positive modeled edge >= 1.5%. Skip legs with trueEdge < 0 (anti-picks).
      const MIN_EDGE = 0.015;
      const edgeLegs = allLegs.filter(
        (l) =>
          l.bookCount >= 3 && // require broad-market consensus
          l.commenceTime && // must have a kickoff
          (l.sharpEdge === true || l.trueEdge >= MIN_EDGE),
      );
      // Sort by the honest metric: EV vs no-vig fair (bigger = better).
      // Fall back to trueEdge if evVsFair isn't populated.
      edgeLegs.sort((a, b) => {
        const aEv = typeof a.evVsFair === "number" ? a.evVsFair : a.trueEdge;
        const bEv = typeof b.evVsFair === "number" ? b.evVsFair : b.trueEdge;
        return bEv - aEv;
      });
      const legsResponse = {
        legs: edgeLegs.slice(0, count * 4).map((l) => ({
          sport: l.sport,
          game: l.game,
          gameId: l.gameId,
          commenceTime: l.commenceTime,
          pick: l.pick,
          market: l.market,
          odds: l.odds,
          book: l.book,
          bookCount: l.bookCount,
          impliedProb: l.impliedProb,
          ourProb: l.ourProb,
          trueEdge: l.trueEdge,
          scored: l.scored,
          fairProb: l.fairProb,
          sharpEdge: l.sharpEdge,
          evVsFair: l.evVsFair,
          weatherNote: l.weatherNote ?? null,
          pitcherNote: l.pitcherNote ?? null,
          reasons: buildReasons(l),
        })),
        meta: {
          sportsScanned: sports.map((s) => s.toUpperCase()),
          gamesAnalyzed: totalGames,
          legsEvaluated: allLegs.length,
          legsScored: allLegs.filter((x) => x.scored).length,
          edgesFound: edgeLegs.length,
          generatedAt: new Date().toISOString(),
        },
      };
      return NextResponse.json(legsResponse, {
        headers: {
          "X-Cache": "MISS",
          "X-Data-Source": "live",
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60",
        },
      });
    }

    // Build optimized parlays
    const parlays = buildParlays(allLegs, numLegs, count, sortMode, tier);
    const legsScored = allLegs.filter((l) => l.scored).length;
    const tierCfg = (TIER_CONFIG as Record<string, { poolSize: number }>)[tier] ?? TIER_CONFIG.sharp;

    const response: ParlayResponse = {
      parlays,
      meta: {
        sportsScanned: sports.map((s) => s.toUpperCase()),
        gamesAnalyzed: totalGames,
        legsEvaluated: allLegs.length,
        legsScored,
        poolSize: tierCfg.poolSize,
        tier,
        generatedAt: new Date().toISOString(),
      },
    };

    // Cache the response
    setCachedResponse(response, sports, numLegs, count, sortMode + ":" + tier);

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
          const nowIso = new Date().toISOString();
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
          // Compact opening-lines snapshot — compared to closing-line at
          // score-check time to compute CLV (the real sharpness metric).
          const openingLinesByParlay = trackable.map((p) =>
            p.legs.map((l) => ({
              gameId: l.gameId,
              market: l.market,
              pick: l.pick,
              odds: l.odds,
              book: l.book,
              impliedProb: l.impliedProb,
              fairProb: l.fairProb,
              capturedAt: nowIso,
            })),
          );
          const rowsWithCategory = baseRows.map((r, i) => ({
            ...r,
            category: trackable[i].category,
            opening_lines: openingLinesByParlay[i],
          }));

          // Try the full payload first; if column migrations (010, 012) have
          // not been applied, fall back to dropping the new columns.
          const { error: insertErr } = await supabase
            .from("parlays")
            .insert(rowsWithCategory);

          if (insertErr && /column .*(category|opening_lines)/i.test(insertErr.message || "")) {
            // Fall back step 1: try without opening_lines but with category.
            const withCat = baseRows.map((r, i) => ({ ...r, category: trackable[i].category }));
            const { error: catErr } = await supabase.from("parlays").insert(withCat);
            if (catErr && /category/i.test(catErr.message || "")) {
              await supabase.from("parlays").insert(baseRows);
            }
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
