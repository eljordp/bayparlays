// ─── Situational Factors ────────────────────────────────────────────────────
// Pros bet on spots, not just teams. Rest, travel, letdown/bounce-back
// situations and short-turnarounds all move lines in predictable ways.

export interface SituationalFactors {
  team: string;
  restDays: number;
  isBackToBack: boolean;
  travelDistance?: number;
  isDivisionGame: boolean;
  lastGameMargin: number; // positive if won big, negative if lost big
}

interface RecentGame {
  date: string;
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
}

// ─── Situational Edge Calculation ───────────────────────────────────────────

export function getSituationalEdge(
  team: string,
  recentGames: RecentGame[],
  isHome: boolean,
  gameDate: string
): number {
  let edge = 0;

  // Find this team's last completed game
  const teamGames = recentGames
    .filter((g) => g.home === team || g.away === team)
    .sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

  if (teamGames.length > 0) {
    const lastGame = teamGames[0];
    const daysSince =
      (new Date(gameDate).getTime() - new Date(lastGame.date).getTime()) /
      (1000 * 60 * 60 * 24);

    // Rest edge — short rest hurts, 3+ days helps, too much rest = rust
    if (daysSince < 1.5) edge -= 5; // back-to-back penalty
    if (daysSince >= 3) edge += 3; // well-rested boost
    if (daysSince >= 7) edge -= 2; // rust penalty on long layoff

    // Letdown vs bounce-back spots
    const teamWasHome = lastGame.home === team;
    const teamScore = teamWasHome ? lastGame.homeScore : lastGame.awayScore;
    const oppScore = teamWasHome ? lastGame.awayScore : lastGame.homeScore;
    const margin = teamScore - oppScore;

    if (margin >= 20) edge -= 3; // letdown after blowout win
    if (margin <= -20) edge += 4; // bounce-back after blowout loss

    // Quick home-after-road turnaround often under-performs
    if (isHome && !teamWasHome && daysSince <= 2) edge -= 2;
  }

  return edge;
}
