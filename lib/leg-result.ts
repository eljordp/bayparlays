// Determines whether a parlay leg has won, lost, is live, or hasn't
// started — using actual game state from ESPN. Used by /api/sim/cashout
// to refuse cash-out on bets that haven't started (or have already lost).
//
// Replaces the old time-based estimator that let users cash out 4-leg
// $586 parlays with no games even started.

import type { GameStatus } from "@/lib/live-game-status";

export type LegState = "pending" | "live" | "won" | "lost" | "unknown";

export interface LegLite {
  pick?: string;
  market?: string;
  game?: string;
  homeTeam?: string;
  awayTeam?: string;
  commenceTime?: string;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Decide if a leg WON given the final scores. Mirrors check-scores logic:
//   moneyline: pickedTeam.score > opponent.score
//   spread:    pickedTeam.score + spread > opponent.score
//   total:     home + away > line (Over) / < line (Under)
function didLegWin(leg: LegLite, status: GameStatus): boolean | null {
  if (status.homeScore === null || status.awayScore === null) return null;
  const pick = leg.pick ?? "";

  // Moneyline: "Lakers ML"
  if (pick.toUpperCase().endsWith(" ML") || leg.market === "moneyline") {
    const teamName = pick.replace(/\s*ML\s*$/i, "").trim();
    const teamNorm = normalize(teamName);
    const homeNorm = normalize(status.homeTeam);
    const awayNorm = normalize(status.awayTeam);
    if (homeNorm.includes(teamNorm) || teamNorm.includes(homeNorm)) {
      return status.homeScore > status.awayScore;
    }
    if (awayNorm.includes(teamNorm) || teamNorm.includes(awayNorm)) {
      return status.awayScore > status.homeScore;
    }
    return null;
  }

  // Spread: "Lakers -5.5" / "Celtics +3"
  const spreadMatch = pick.match(/^(.+?)\s+([+-]?\d+(?:\.\d+)?)$/);
  if (spreadMatch && (leg.market === "spread" || leg.market === "spreads")) {
    const teamName = spreadMatch[1].trim();
    const spread = parseFloat(spreadMatch[2]);
    const teamNorm = normalize(teamName);
    const homeNorm = normalize(status.homeTeam);
    const isHome = homeNorm.includes(teamNorm) || teamNorm.includes(homeNorm);
    const teamScore = isHome ? status.homeScore : status.awayScore;
    const oppScore = isHome ? status.awayScore : status.homeScore;
    return teamScore + spread > oppScore;
  }

  // Total: "Over 220.5" / "Under 8.5"
  const totalMatch = pick.match(/^(Over|Under)\s+(\d+(?:\.\d+)?)$/i);
  if (totalMatch && (leg.market === "total" || leg.market === "totals")) {
    const direction = totalMatch[1].toLowerCase();
    const line = parseFloat(totalMatch[2]);
    const total = status.homeScore + status.awayScore;
    if (direction === "over") return total > line;
    return total < line;
  }

  return null;
}

export function legState(leg: LegLite, status: GameStatus | undefined): LegState {
  if (!status) {
    // No live status found — fall back to commence time. If game start is
    // still in the future, leg is pending; if past, we just don't know.
    if (leg.commenceTime) {
      return new Date(leg.commenceTime).getTime() > Date.now() ? "pending" : "unknown";
    }
    return "unknown";
  }

  if (status.state === "pre") return "pending";
  if (status.state === "in") return "live";

  // state === "post" — game is done, check if pick won
  const won = didLegWin(leg, status);
  if (won === null) return "unknown";
  return won ? "won" : "lost";
}
