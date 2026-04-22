// ─── Game Outcome Model ─────────────────────────────────────────────────────
// Real probability estimates for spread and total bets, derived from Elo
// differentials + recent scoring data. Replaces the previous "line divergence
// nudge" which was a fake signal priced the same across all markets.

import type { NormalizedGame } from "./sports-data";

// ─── Sport-specific constants ───────────────────────────────────────────────
// Elo-to-spread conversion: how many points of spread each Elo point is worth.
// Calibrated to standard sports-reference figures for each league.
// Also spread sigma: typical SD of actual margin vs expected margin.
// Total sigma: SD of actual total vs expected total.

interface SportModel {
  eloPerPoint: number;   // Elo points per 1 unit of spread
  spreadSigma: number;   // SD of final margin vs expected (points/runs/goals)
  totalSigma: number;    // SD of final total vs expected
  scoringFloor: number;  // reasonable minimum score to expect (filters early-season noise)
}

const SPORT_MODEL: Record<string, SportModel> = {
  NBA:   { eloPerPoint: 28,  spreadSigma: 11.5, totalSigma: 17.5, scoringFloor: 80 },
  NCAAB: { eloPerPoint: 28,  spreadSigma: 10.5, totalSigma: 16.0, scoringFloor: 55 },
  NFL:   { eloPerPoint: 25,  spreadSigma: 13.5, totalSigma: 13.5, scoringFloor: 10 },
  NCAAF: { eloPerPoint: 25,  spreadSigma: 14.5, totalSigma: 14.5, scoringFloor: 10 },
  MLB:   { eloPerPoint: 130, spreadSigma: 3.2,  totalSigma: 3.8,  scoringFloor: 2 },
  NHL:   { eloPerPoint: 120, spreadSigma: 2.5,  totalSigma: 2.2,  scoringFloor: 1 },
};

const DEFAULT_MODEL: SportModel = {
  eloPerPoint: 28,
  spreadSigma: 12,
  totalSigma: 17,
  scoringFloor: 50,
};

// ─── Normal CDF (no stdlib dependency) ──────────────────────────────────────
// Abramowitz & Stegun 7.1.26 approximation — accurate to ~1.5e-7.
function normalCdf(x: number, mean = 0, sigma = 1): number {
  const z = (x - mean) / sigma;
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p =
    d *
    t *
    (0.3193815 +
      t *
        (-0.3565638 +
          t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}

// ─── Playoff Detection + Adjustment ─────────────────────────────────────────
// In playoffs: only good teams are left, coaching tightens, variance goes up.
// We dampen Elo differentials (teams closer than regular season) and widen
// sigma slightly (more upsets / tighter scores).

export function isPlayoffPeriod(sport: string, date: Date): boolean {
  const m = date.getUTCMonth(); // 0-indexed
  switch (sport) {
    case "NBA":
    case "NHL":
      // Postseason runs mid-April through mid-June.
      return m >= 3 && m <= 5;
    case "MLB":
      // October postseason.
      return m === 9;
    case "NFL":
      // January playoffs + early February Super Bowl.
      return m === 0 || (m === 1 && date.getUTCDate() <= 15);
    case "NCAAB":
      // March Madness runs mid-March into early April.
      return m === 2 || (m === 3 && date.getUTCDate() <= 10);
    case "NCAAF":
      // Bowl season mid-December through mid-January.
      return m === 11 || (m === 0 && date.getUTCDate() <= 15);
    default:
      return false;
  }
}

function playoffAdjust(
  model: SportModel,
  eloDiff: number,
  isPlayoff: boolean,
): { adjustedEloDiff: number; spreadSigma: number; totalSigma: number } {
  if (!isPlayoff) {
    return {
      adjustedEloDiff: eloDiff,
      spreadSigma: model.spreadSigma,
      totalSigma: model.totalSigma,
    };
  }
  // Dampen Elo gap by 20% — favorites less favored in playoffs.
  // Widen sigmas by 15% — tighter games but more variance in outcomes.
  return {
    adjustedEloDiff: eloDiff * 0.8,
    spreadSigma: model.spreadSigma * 1.15,
    totalSigma: model.totalSigma * 1.15,
  };
}

// ─── Expected Margin ────────────────────────────────────────────────────────
// Returns expected margin of victory from the home team's perspective.
// Positive = home wins by that many. Negative = home loses by that many.

export function expectedMargin(
  sport: string,
  homeElo: number | undefined,
  awayElo: number | undefined,
  homeBonusElo: number,
  isPlayoff: boolean,
): number | null {
  if (homeElo === undefined || awayElo === undefined) return null;
  const model = SPORT_MODEL[sport] ?? DEFAULT_MODEL;
  const rawDiff = homeElo + homeBonusElo - awayElo;
  const { adjustedEloDiff } = playoffAdjust(model, rawDiff, isPlayoff);
  return adjustedEloDiff / model.eloPerPoint;
}

// ─── Cover Probability ──────────────────────────────────────────────────────
// Given a spread line (positive means home is favored by that many), returns
// the probability that the PICKED side covers. pickIsHome + spread orientation
// are already resolved by the caller.
//
// Example: pickIsHome=true, homeSpread = -3.5 (home favored by 3.5), expected
// margin = 5 → P(home wins by more than 3.5) = 1 - normalCdf(3.5, 5, sigma)

export function coverProbability(
  sport: string,
  pickIsHome: boolean,
  homeSpread: number,    // negative if home favored; +3.5 if home +3.5 underdog
  expectedHomeMargin: number,
  isPlayoff: boolean,
): number {
  const model = SPORT_MODEL[sport] ?? DEFAULT_MODEL;
  const { spreadSigma } = playoffAdjust(model, 0, isPlayoff);

  // P(home margin > homeSpreadAbsorbed)
  // If home is -3.5 (favored), they need margin > 3.5. homeSpread = -3.5,
  // so the threshold is -homeSpread = 3.5.
  const threshold = -homeSpread;
  const pHomeCovers = 1 - normalCdf(threshold, expectedHomeMargin, spreadSigma);
  return pickIsHome ? pHomeCovers : 1 - pHomeCovers;
}

// ─── Expected Total ─────────────────────────────────────────────────────────
// Compute each team's expected scoring contribution from their own scoring
// avg and the opponent's points-allowed avg, blended 50/50. Fall back to
// league-average approximation if we have <3 recent games for either team.

export function expectedTotal(
  sport: string,
  home: string,
  away: string,
  recentGames: NormalizedGame[],
  isPlayoff: boolean,
): number | null {
  const model = SPORT_MODEL[sport] ?? DEFAULT_MODEL;

  // Collect recent scoring for each team
  const scored: Record<string, number[]> = {};
  const allowed: Record<string, number[]> = {};
  for (const g of recentGames) {
    if (!g.completed) continue;
    scored[g.home] = scored[g.home] ?? [];
    scored[g.home].push(g.homeScore);
    scored[g.away] = scored[g.away] ?? [];
    scored[g.away].push(g.awayScore);
    allowed[g.home] = allowed[g.home] ?? [];
    allowed[g.home].push(g.awayScore);
    allowed[g.away] = allowed[g.away] ?? [];
    allowed[g.away].push(g.homeScore);
  }

  const avg = (xs: number[] | undefined) =>
    xs && xs.length > 0 ? xs.reduce((a, b) => a + b, 0) / xs.length : null;

  const homeScoredAvg = avg(scored[home]);
  const homeAllowedAvg = avg(allowed[home]);
  const awayScoredAvg = avg(scored[away]);
  const awayAllowedAvg = avg(allowed[away]);

  // Need at least one team with real scoring data.
  if (
    homeScoredAvg === null &&
    homeAllowedAvg === null &&
    awayScoredAvg === null &&
    awayAllowedAvg === null
  ) {
    return null;
  }

  // Expected home scoring = (home's avg scored + away's avg allowed) / 2
  // Expected away scoring = (away's avg scored + home's avg allowed) / 2
  const homeExpected =
    homeScoredAvg !== null && awayAllowedAvg !== null
      ? (homeScoredAvg + awayAllowedAvg) / 2
      : homeScoredAvg ?? awayAllowedAvg ?? model.scoringFloor;

  const awayExpected =
    awayScoredAvg !== null && homeAllowedAvg !== null
      ? (awayScoredAvg + homeAllowedAvg) / 2
      : awayScoredAvg ?? homeAllowedAvg ?? model.scoringFloor;

  let total = homeExpected + awayExpected;

  // Playoff games are often lower-scoring (tighter defense, slower pace).
  if (isPlayoff) total *= 0.95;

  return total;
}

// ─── Totals Probability ─────────────────────────────────────────────────────
// P(actual total > line) given our expected total and sport-specific variance.

export function totalProbability(
  sport: string,
  pickIsOver: boolean,
  totalLine: number,
  expected: number,
  isPlayoff: boolean,
): number {
  const model = SPORT_MODEL[sport] ?? DEFAULT_MODEL;
  const { totalSigma } = playoffAdjust(model, 0, isPlayoff);
  const pOver = 1 - normalCdf(totalLine, expected, totalSigma);
  return pickIsOver ? pOver : 1 - pOver;
}

// ─── Playoff-adjusted moneyline Elo probability ─────────────────────────────
// Used by the moneyline path to dampen Elo predictions in playoff periods.

export function playoffDampedEloProb(
  teamElo: number,
  oppElo: number,
  homeBonus: number,
  isPlayoff: boolean,
): number {
  const rawDiff = teamElo + homeBonus - oppElo;
  const effectiveDiff = isPlayoff ? rawDiff * 0.8 : rawDiff;
  return 1 / (1 + Math.pow(10, -effectiveDiff / 400));
}
