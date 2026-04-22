// ─── Elo Rating System ──────────────────────────────────────────────────────
// Adjusts team ratings based on game outcomes and margin of victory.
// More predictive than raw W/L records because it accounts for opponent
// strength and the decisiveness of each result.

export interface EloRating {
  team: string;
  rating: number;
  games: number;
}

const K_FACTOR = 20; // How quickly ratings change per game
const HOME_ADVANTAGE = 50; // Elo points added to home team in expected-score calc
const STARTING_ELO = 1500;

interface Game {
  home_team: string;
  away_team: string;
  home_score: number;
  away_score: number;
  completed: boolean;
}

// ─── Build Ratings From Games ───────────────────────────────────────────────

export function calculateEloRatings(games: Game[]): Map<string, EloRating> {
  const ratings = new Map<string, EloRating>();

  function getOrInit(team: string): EloRating {
    if (!ratings.has(team)) {
      ratings.set(team, { team, rating: STARTING_ELO, games: 0 });
    }
    return ratings.get(team)!;
  }

  for (const game of games) {
    if (!game.completed) continue;

    const home = getOrInit(game.home_team);
    const away = getOrInit(game.away_team);

    // Expected score (probability of winning) factoring home advantage
    const homeAdj = home.rating + HOME_ADVANTAGE;
    const expectedHome =
      1 / (1 + Math.pow(10, (away.rating - homeAdj) / 400));
    const expectedAway = 1 - expectedHome;

    // Actual result
    const homeWon = game.home_score > game.away_score;
    const actualHome = homeWon ? 1 : 0;
    const actualAway = homeWon ? 0 : 1;

    // Margin-of-victory multiplier — blowouts create bigger rating swings,
    // but are dampened when favorites beat underdogs (expected result).
    const margin = Math.abs(game.home_score - game.away_score);
    const mov =
      Math.log(margin + 1) *
      (2.2 / (Math.abs(home.rating - away.rating) * 0.001 + 2.2));

    home.rating += K_FACTOR * mov * (actualHome - expectedHome);
    away.rating += K_FACTOR * mov * (actualAway - expectedAway);
    home.games++;
    away.games++;
  }

  return ratings;
}

// ─── Win Probability From Elo ───────────────────────────────────────────────

export function getEloWinProb(
  team: string,
  opponent: string,
  ratings: Map<string, EloRating>,
  isHome: boolean
): number {
  const teamRating = ratings.get(team)?.rating || STARTING_ELO;
  const oppRating = ratings.get(opponent)?.rating || STARTING_ELO;
  const homeBonus = isHome ? HOME_ADVANTAGE : 0;
  return 1 / (1 + Math.pow(10, (oppRating - teamRating - homeBonus) / 400));
}

// ─── Elo Edge vs Implied Probability ────────────────────────────────────────
// If Elo says team wins 60% but the market implies only 50%, we have a 10-point
// edge. Positive means the book is underrating this side.

export function getEloEdge(
  team: string,
  opponent: string,
  impliedProb: number,
  ratings: Map<string, EloRating>,
  isHome: boolean
): number {
  const eloWinProb = getEloWinProb(team, opponent, ratings, isHome);
  const edge = (eloWinProb - impliedProb) * 100;
  return edge;
}
