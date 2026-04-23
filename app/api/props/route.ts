import { NextResponse } from "next/server";
import { getNBAPlayerStats, type PlayerStats } from "@/lib/espn-stats";
import { getWNBAPlayerStats } from "@/lib/espn-wnba-stats";
import {
  getMLBPitcherStats,
  getMLBBatterStats,
  type MLBPitcherStats,
  type MLBBatterStats,
} from "@/lib/espn-mlb-stats";
import {
  getNHLSkaterStats,
  type NHLSkaterStats,
} from "@/lib/espn-nhl-stats";
import {
  getNFLPassingStats,
  getNFLRushingStats,
  getNFLReceivingStats,
  type NFLPassingStats,
  type NFLRushingStats,
  type NFLReceivingStats,
} from "@/lib/espn-nfl-stats";
import {
  getMLSPlayerStats,
  getEPLPlayerStats,
  type SoccerPlayerStats,
} from "@/lib/espn-soccer-stats";

export const dynamic = "force-dynamic";

// ─── Shared prop row shape ───────────────────────────────────────────────────

export type PropRow = {
  player: string;
  team: string;
  stat: string;
  average: number; // per-game average (or per-start for pitchers)
  typicalLine: number;
  edge: number;
  games: number;
};

export type PropCategory = {
  label: string;
  rows: PropRow[];
};

// Build a typical sportsbook line from a season average.
// Lines are usually set a bit below a player's average to balance action.
function typicalLine(avg: number, buffer: number): number {
  const raw = avg - buffer;
  return Math.floor(raw) + 0.5;
}

function r(n: number, p = 2): number {
  const m = Math.pow(10, p);
  return Math.round(n * m) / m;
}

// ─── NBA builders ────────────────────────────────────────────────────────────

type NBAStat = "points" | "rebounds" | "assists" | "threes" | "steals" | "blocks";

function topNBA(
  players: PlayerStats[],
  stat: NBAStat,
  buffer: number,
  edge: number,
  limit = 10,
): PropRow[] {
  return [...players]
    .filter((p) => p.gamesPlayed >= 10 && (p.stats[stat] || 0) > 0)
    .sort((a, b) => (b.stats[stat] || 0) - (a.stats[stat] || 0))
    .slice(0, limit)
    .map((p) => {
      const avg = p.stats[stat] || 0;
      return {
        player: p.name,
        team: p.team,
        stat,
        average: r(avg, 1),
        typicalLine: typicalLine(avg, buffer),
        edge,
        games: p.gamesPlayed,
      };
    });
}

// ─── MLB builders ────────────────────────────────────────────────────────────

// pitcher_strikeouts: top 10 by kPer9, line = kPer9 - 1.5 (half-step), edge
// scales with sample size so short-sample kings (1 start hot flash) don't win.
function topPitcherStrikeouts(
  pitchers: MLBPitcherStats[],
  limit = 10,
): PropRow[] {
  return [...pitchers]
    .filter((p) => p.kPer9 > 0 && p.starts >= 3)
    .sort((a, b) => b.kPer9 - a.kPer9)
    .slice(0, limit)
    .map((p) => {
      const avg = p.kPer9;
      const line = typicalLine(avg, 1.5);
      // Sample factor: 20+ starts = full 1.0, under that scales down.
      const sampleFactor = Math.min(1, p.starts / 20);
      const edge = Math.max(0, (avg - line) * sampleFactor);
      return {
        player: p.name,
        team: p.team,
        stat: "strikeouts",
        average: r(avg, 2),
        typicalLine: line,
        edge: r(edge, 2),
        games: p.starts,
      };
    });
}

// batter_hits: top 10 by hitsPerGame, line = floor(avg) + 0.5, edge = avg - line
function topBatterHits(batters: MLBBatterStats[], limit = 10): PropRow[] {
  return [...batters]
    .filter((b) => b.hitsPerGame > 0)
    .sort((a, b) => b.hitsPerGame - a.hitsPerGame)
    .slice(0, limit)
    .map((b) => {
      const avg = b.hitsPerGame;
      const line = Math.floor(avg) + 0.5;
      return {
        player: b.name,
        team: b.team,
        stat: "hits",
        average: r(avg, 2),
        typicalLine: line,
        edge: r(avg - line, 2),
        games: b.games,
      };
    });
}

// batter_rbis: line = 0.5, edge = rbiPerGame * small factor
function topBatterRBIs(batters: MLBBatterStats[], limit = 10): PropRow[] {
  return [...batters]
    .filter((b) => b.rbiPerGame > 0)
    .sort((a, b) => b.rbiPerGame - a.rbiPerGame)
    .slice(0, limit)
    .map((b) => {
      const avg = b.rbiPerGame;
      return {
        player: b.name,
        team: b.team,
        stat: "rbi",
        average: r(avg, 2),
        typicalLine: 0.5,
        edge: r(avg * 0.5, 2),
        games: b.games,
      };
    });
}

// batter_total_bases: line = floor(avg) + 0.5, edge = avg - line
function topBatterTotalBases(batters: MLBBatterStats[], limit = 10): PropRow[] {
  return [...batters]
    .filter((b) => b.totalBasesPerGame > 0)
    .sort((a, b) => b.totalBasesPerGame - a.totalBasesPerGame)
    .slice(0, limit)
    .map((b) => {
      const avg = b.totalBasesPerGame;
      const line = Math.floor(avg) + 0.5;
      return {
        player: b.name,
        team: b.team,
        stat: "totalBases",
        average: r(avg, 2),
        typicalLine: line,
        edge: r(avg - line, 2),
        games: b.games,
      };
    });
}

// batter_stolen_bases: line = 0.5 (standard), edge = sbPerGame * 0.7
function topBatterStolenBases(
  batters: MLBBatterStats[],
  limit = 10,
): PropRow[] {
  return [...batters]
    .filter((b) => b.stolenBasesPerGame > 0)
    .sort((a, b) => b.stolenBasesPerGame - a.stolenBasesPerGame)
    .slice(0, limit)
    .map((b) => {
      const avg = b.stolenBasesPerGame;
      return {
        player: b.name,
        team: b.team,
        stat: "stolenBases",
        average: r(avg, 3),
        typicalLine: 0.5,
        edge: r(avg * 0.7, 3),
        games: b.games,
      };
    });
}

// batter_runs: line = floor(avg) + 0.5, edge = avg - line
function topBatterRuns(batters: MLBBatterStats[], limit = 10): PropRow[] {
  return [...batters]
    .filter((b) => b.runsPerGame > 0)
    .sort((a, b) => b.runsPerGame - a.runsPerGame)
    .slice(0, limit)
    .map((b) => {
      const avg = b.runsPerGame;
      const line = Math.floor(avg) + 0.5;
      return {
        player: b.name,
        team: b.team,
        stat: "runs",
        average: r(avg, 2),
        typicalLine: line,
        edge: r(avg - line, 2),
        games: b.games,
      };
    });
}

// season_wins: futures-style. line = wins - 2, edge = wins - line (always 2).
// Shown as season totals, not per-game.
function topPitcherSeasonWins(
  pitchers: MLBPitcherStats[],
  limit = 10,
): PropRow[] {
  return [...pitchers]
    .filter((p) => p.wins > 0 && p.starts >= 3)
    .sort((a, b) => b.wins - a.wins)
    .slice(0, limit)
    .map((p) => {
      const wins = p.wins;
      const line = Math.max(0.5, wins - 2);
      return {
        player: p.name,
        team: p.team,
        stat: "wins",
        average: wins,
        typicalLine: line,
        edge: r(wins - line, 2),
        games: p.starts,
      };
    });
}

// batter_home_runs: line = 0.5 (standard "to hit a HR" line), edge = hrPerGame * 0.8
function topBatterHomeRuns(batters: MLBBatterStats[], limit = 10): PropRow[] {
  return [...batters]
    .filter((b) => b.hrPerGame > 0)
    .sort((a, b) => b.hrPerGame - a.hrPerGame)
    .slice(0, limit)
    .map((b) => {
      const avg = b.hrPerGame;
      return {
        player: b.name,
        team: b.team,
        stat: "homeRuns",
        average: r(avg, 3),
        typicalLine: 0.5,
        edge: r(avg * 0.8, 3),
        games: b.games,
      };
    });
}

// ─── NHL builders ────────────────────────────────────────────────────────────

// skater_goals: line = 0.5, edge = goalsPerGame * 0.7
function topSkaterGoals(skaters: NHLSkaterStats[], limit = 10): PropRow[] {
  return [...skaters]
    .filter((s) => s.goalsPerGame > 0)
    .sort((a, b) => b.goalsPerGame - a.goalsPerGame)
    .slice(0, limit)
    .map((s) => {
      const avg = s.goalsPerGame;
      return {
        player: s.name,
        team: s.team,
        stat: "goals",
        average: r(avg, 3),
        typicalLine: 0.5,
        edge: r(avg * 0.7, 3),
        games: s.games,
      };
    });
}

// skater_points: line = floor(avg) + 0.5, edge = avg - line
function topSkaterPoints(skaters: NHLSkaterStats[], limit = 10): PropRow[] {
  return [...skaters]
    .filter((s) => s.pointsPerGame > 0)
    .sort((a, b) => b.pointsPerGame - a.pointsPerGame)
    .slice(0, limit)
    .map((s) => {
      const avg = s.pointsPerGame;
      const line = Math.floor(avg) + 0.5;
      return {
        player: s.name,
        team: s.team,
        stat: "points",
        average: r(avg, 2),
        typicalLine: line,
        edge: r(avg - line, 2),
        games: s.games,
      };
    });
}

// skater_pim: line = 0.5 (fighters/grinders hit fighting majors = 5 PIMs),
// edge = pimPerGame * 0.5
function topSkaterPIM(skaters: NHLSkaterStats[], limit = 10): PropRow[] {
  return [...skaters]
    .filter((s) => s.pimPerGame > 0)
    .sort((a, b) => b.pimPerGame - a.pimPerGame)
    .slice(0, limit)
    .map((s) => {
      const avg = s.pimPerGame;
      return {
        player: s.name,
        team: s.team,
        stat: "pim",
        average: r(avg, 2),
        typicalLine: 0.5,
        edge: r(avg * 0.5, 2),
        games: s.games,
      };
    });
}

// skater_plus_minus: season total, not per-game. Line = +/- rounded to nearest
// 0.5, edge flows from the raw value. Positive +/- = value signal.
function topSkaterPlusMinus(skaters: NHLSkaterStats[], limit = 10): PropRow[] {
  return [...skaters]
    .filter((s) => Math.abs(s.plusMinus) > 0)
    .sort((a, b) => b.plusMinus - a.plusMinus)
    .slice(0, limit)
    .map((s) => {
      const pm = s.plusMinus;
      // Round to nearest 0.5
      const line = Math.round(pm * 2) / 2 - 0.5;
      return {
        player: s.name,
        team: s.team,
        stat: "plusMinus",
        average: pm,
        typicalLine: line,
        edge: r(pm - line, 2),
        games: s.games,
      };
    });
}

// skater_shots: line = shotsPerGame - 1 (half-step), edge = avg - line
function topSkaterShots(skaters: NHLSkaterStats[], limit = 10): PropRow[] {
  return [...skaters]
    .filter((s) => s.shotsPerGame > 0)
    .sort((a, b) => b.shotsPerGame - a.shotsPerGame)
    .slice(0, limit)
    .map((s) => {
      const avg = s.shotsPerGame;
      const line = typicalLine(avg, 1);
      return {
        player: s.name,
        team: s.team,
        stat: "shots",
        average: r(avg, 2),
        typicalLine: line,
        edge: r(avg - line, 2),
        games: s.games,
      };
    });
}

// ─── NFL builders ────────────────────────────────────────────────────────────

// Round sportsbook-style: floor(x / 5) * 5 — keeps lines at nice 5-yd steps.
function roundedDown5(x: number): number {
  return Math.floor(x / 5) * 5;
}

// qb_passing_yards: sportsbook-style line at (yardsPerGame / 5 floor) - 10.
// Floors prevent edge from being too lopsided on star QBs.
function topQBPassingYards(qbs: NFLPassingStats[], limit = 10): PropRow[] {
  return [...qbs]
    .filter((q) => q.yardsPerGame > 0)
    .sort((a, b) => b.yardsPerGame - a.yardsPerGame)
    .slice(0, limit)
    .map((q) => {
      const avg = q.yardsPerGame;
      const rounded = Math.max(0, roundedDown5(avg) - 10);
      const line = rounded + 0.5;
      return {
        player: q.name,
        team: q.team,
        stat: "passingYards",
        average: r(avg, 1),
        typicalLine: line,
        edge: r(avg - line, 2),
        games: q.games,
      };
    });
}

// qb_passing_tds: line = 1.5, edge = tdsPerGame * 0.8
function topQBPassingTDs(qbs: NFLPassingStats[], limit = 10): PropRow[] {
  return [...qbs]
    .filter((q) => q.tdsPerGame > 0)
    .sort((a, b) => b.tdsPerGame - a.tdsPerGame)
    .slice(0, limit)
    .map((q) => {
      const avg = q.tdsPerGame;
      return {
        player: q.name,
        team: q.team,
        stat: "passingTds",
        average: r(avg, 2),
        typicalLine: 1.5,
        edge: r(avg * 0.8, 2),
        games: q.games,
      };
    });
}

// rb_rushing_yards: line = floor(ypg/5)*5 + 0.5, edge = avg - line
function topRBRushingYards(rbs: NFLRushingStats[], limit = 10): PropRow[] {
  return [...rbs]
    .filter((r) => r.yardsPerGame > 0)
    .sort((a, b) => b.yardsPerGame - a.yardsPerGame)
    .slice(0, limit)
    .map((rb) => {
      const avg = rb.yardsPerGame;
      const line = roundedDown5(avg) + 0.5;
      return {
        player: rb.name,
        team: rb.team,
        stat: "rushingYards",
        average: r(avg, 1),
        typicalLine: line,
        edge: r(avg - line, 2),
        games: rb.games,
      };
    });
}

// wr_receiving_yards: same rounded-5 line logic
function topWRReceivingYards(
  wrs: NFLReceivingStats[],
  limit = 10,
): PropRow[] {
  return [...wrs]
    .filter((w) => w.yardsPerGame > 0)
    .sort((a, b) => b.yardsPerGame - a.yardsPerGame)
    .slice(0, limit)
    .map((w) => {
      const avg = w.yardsPerGame;
      const line = roundedDown5(avg) + 0.5;
      return {
        player: w.name,
        team: w.team,
        stat: "receivingYards",
        average: r(avg, 1),
        typicalLine: line,
        edge: r(avg - line, 2),
        games: w.games,
      };
    });
}

// wr_receptions: line = floor(recs) + 0.5, edge = avg - line
function topWRReceptions(wrs: NFLReceivingStats[], limit = 10): PropRow[] {
  return [...wrs]
    .filter((w) => w.recsPerGame > 0)
    .sort((a, b) => b.recsPerGame - a.recsPerGame)
    .slice(0, limit)
    .map((w) => {
      const avg = w.recsPerGame;
      const line = Math.floor(avg) + 0.5;
      return {
        player: w.name,
        team: w.team,
        stat: "receptions",
        average: r(avg, 2),
        typicalLine: line,
        edge: r(avg - line, 2),
        games: w.games,
      };
    });
}

// wr_anytime_td: 0.5 line, edge = tdsPerGame * 0.6
function topWRAnytimeTD(wrs: NFLReceivingStats[], limit = 10): PropRow[] {
  return [...wrs]
    .filter((w) => w.tdsPerGame > 0)
    .sort((a, b) => b.tdsPerGame - a.tdsPerGame)
    .slice(0, limit)
    .map((w) => {
      const avg = w.tdsPerGame;
      return {
        player: w.name,
        team: w.team,
        stat: "receivingTds",
        average: r(avg, 3),
        typicalLine: 0.5,
        edge: r(avg * 0.6, 3),
        games: w.games,
      };
    });
}

// ─── Soccer builders (MLS + EPL share shapes) ────────────────────────────────

// goals: line = 0.5 (anytime-goalscorer), edge = goalsPerGame * 0.8
function topSoccerGoals(
  players: SoccerPlayerStats[],
  limit = 10,
): PropRow[] {
  return [...players]
    .filter((p) => p.goalsPerGame > 0)
    .sort((a, b) => b.goalsPerGame - a.goalsPerGame)
    .slice(0, limit)
    .map((p) => {
      const avg = p.goalsPerGame;
      return {
        player: p.name,
        team: p.team,
        stat: "goals",
        average: r(avg, 3),
        typicalLine: 0.5,
        edge: r(avg * 0.8, 3),
        games: p.games,
      };
    });
}

// assists: line = 0.5 (anytime-assist), edge = assistsPerGame * 0.7
function topSoccerAssists(
  players: SoccerPlayerStats[],
  limit = 10,
): PropRow[] {
  return [...players]
    .filter((p) => p.assistsPerGame > 0)
    .sort((a, b) => b.assistsPerGame - a.assistsPerGame)
    .slice(0, limit)
    .map((p) => {
      const avg = p.assistsPerGame;
      return {
        player: p.name,
        team: p.team,
        stat: "assists",
        average: r(avg, 3),
        typicalLine: 0.5,
        edge: r(avg * 0.7, 3),
        games: p.games,
      };
    });
}

// shots_on_target: line = floor(avg) + 0.5, edge = avg - line
function topSoccerShotsOnTarget(
  players: SoccerPlayerStats[],
  limit = 10,
): PropRow[] {
  return [...players]
    .filter((p) => p.shotsOnTargetPerGame > 0)
    .sort((a, b) => b.shotsOnTargetPerGame - a.shotsOnTargetPerGame)
    .slice(0, limit)
    .map((p) => {
      const avg = p.shotsOnTargetPerGame;
      const line = Math.floor(avg) + 0.5;
      return {
        player: p.name,
        team: p.team,
        stat: "shotsOnTarget",
        average: r(avg, 2),
        typicalLine: line,
        edge: r(avg - line, 2),
        games: p.games,
      };
    });
}

// total_shots: line = floor(avg) + 0.5, edge = avg - line
function topSoccerTotalShots(
  players: SoccerPlayerStats[],
  limit = 10,
): PropRow[] {
  return [...players]
    .filter((p) => p.shotsPerGame > 0)
    .sort((a, b) => b.shotsPerGame - a.shotsPerGame)
    .slice(0, limit)
    .map((p) => {
      const avg = p.shotsPerGame;
      const line = Math.floor(avg) + 0.5;
      return {
        player: p.name,
        team: p.team,
        stat: "totalShots",
        average: r(avg, 2),
        typicalLine: line,
        edge: r(avg - line, 2),
        games: p.games,
      };
    });
}

// ─── Route ───────────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  const url = new URL(req.url);
  const sportParam = url.searchParams.get("sport")?.toLowerCase() || "nba";
  const sport: "nba" | "wnba" | "mlb" | "nhl" | "nfl" | "mls" | "epl" =
    sportParam === "wnba"
      ? "wnba"
      : sportParam === "mlb"
        ? "mlb"
        : sportParam === "nhl"
          ? "nhl"
          : sportParam === "nfl"
            ? "nfl"
            : sportParam === "mls"
              ? "mls"
              : sportParam === "epl"
                ? "epl"
                : "nba";
  const updated = new Date().toISOString();

  if (sport === "mlb") {
    const [pitchers, batters] = await Promise.all([
      getMLBPitcherStats(),
      getMLBBatterStats(),
    ]);

    if (pitchers.length === 0 && batters.length === 0) {
      return NextResponse.json({
        sport: "mlb",
        updated,
        categories: {
          pitcher_strikeouts: { label: "Pitcher Strikeouts (K/9)", rows: [] },
          batter_hits: { label: "Batter Hits", rows: [] },
          batter_rbis: { label: "Batter RBIs", rows: [] },
          batter_home_runs: { label: "Batter Home Runs", rows: [] },
        },
        error: "Unable to fetch MLB player stats",
      });
    }

    const categories: Record<string, PropCategory> = {
      pitcher_strikeouts: {
        label: "Pitcher Strikeouts (K/9)",
        rows: topPitcherStrikeouts(pitchers),
      },
      batter_hits: { label: "Batter Hits", rows: topBatterHits(batters) },
      batter_rbis: { label: "Batter RBIs", rows: topBatterRBIs(batters) },
      batter_home_runs: {
        label: "Batter Home Runs",
        rows: topBatterHomeRuns(batters),
      },
      batter_total_bases: {
        label: "Batter Total Bases",
        rows: topBatterTotalBases(batters),
      },
      batter_stolen_bases: {
        label: "Batter Stolen Bases",
        rows: topBatterStolenBases(batters),
      },
      batter_runs: { label: "Batter Runs", rows: topBatterRuns(batters) },
      season_wins: {
        label: "Pitcher Season Wins",
        rows: topPitcherSeasonWins(pitchers),
      },
    };

    return NextResponse.json({ sport: "mlb", updated, categories });
  }

  if (sport === "nhl") {
    const skaters = await getNHLSkaterStats();

    if (skaters.length === 0) {
      return NextResponse.json({
        sport: "nhl",
        updated,
        categories: {
          skater_goals: { label: "Skater Goals", rows: [] },
          skater_points: { label: "Skater Points", rows: [] },
          skater_shots: { label: "Shots on Goal", rows: [] },
        },
        error: "Unable to fetch NHL player stats",
      });
    }

    const categories: Record<string, PropCategory> = {
      skater_goals: { label: "Skater Goals", rows: topSkaterGoals(skaters) },
      skater_points: { label: "Skater Points", rows: topSkaterPoints(skaters) },
      skater_shots: { label: "Shots on Goal", rows: topSkaterShots(skaters) },
      skater_pim: {
        label: "Penalty Minutes",
        rows: topSkaterPIM(skaters),
      },
      skater_plus_minus: {
        label: "Plus / Minus",
        rows: topSkaterPlusMinus(skaters),
      },
    };

    return NextResponse.json({ sport: "nhl", updated, categories });
  }

  if (sport === "nfl") {
    const [passing, rushing, receiving] = await Promise.all([
      getNFLPassingStats(),
      getNFLRushingStats(),
      getNFLReceivingStats(),
    ]);

    if (
      passing.length === 0 &&
      rushing.length === 0 &&
      receiving.length === 0
    ) {
      return NextResponse.json({
        sport: "nfl",
        updated,
        categories: {
          qb_passing_yards: { label: "QB Passing Yards", rows: [] },
          qb_passing_tds: { label: "QB Passing TDs", rows: [] },
          rb_rushing_yards: { label: "RB Rushing Yards", rows: [] },
          wr_receiving_yards: { label: "WR Receiving Yards", rows: [] },
          wr_receptions: { label: "WR Receptions", rows: [] },
          wr_anytime_td: { label: "WR Anytime TD", rows: [] },
        },
        error: "Unable to fetch NFL player stats",
      });
    }

    const categories: Record<string, PropCategory> = {
      qb_passing_yards: {
        label: "QB Passing Yards",
        rows: topQBPassingYards(passing),
      },
      qb_passing_tds: {
        label: "QB Passing TDs",
        rows: topQBPassingTDs(passing),
      },
      rb_rushing_yards: {
        label: "RB Rushing Yards",
        rows: topRBRushingYards(rushing),
      },
      wr_receiving_yards: {
        label: "WR Receiving Yards",
        rows: topWRReceivingYards(receiving),
      },
      wr_receptions: {
        label: "WR Receptions",
        rows: topWRReceptions(receiving),
      },
      wr_anytime_td: {
        label: "WR Anytime TD",
        rows: topWRAnytimeTD(receiving),
      },
    };

    return NextResponse.json({ sport: "nfl", updated, categories });
  }

  if (sport === "wnba") {
    const players = await getWNBAPlayerStats();

    if (players.length === 0) {
      return NextResponse.json({
        sport: "wnba",
        updated,
        categories: {
          points: { label: "Points", rows: [] },
          rebounds: { label: "Rebounds", rows: [] },
          assists: { label: "Assists", rows: [] },
          threes: { label: "Threes", rows: [] },
          steals: { label: "Steals", rows: [] },
          blocks: { label: "Blocks", rows: [] },
        },
        error: "Unable to fetch WNBA player stats",
      });
    }

    // Same buffer/edge tuning as NBA — stat distributions are very similar.
    return NextResponse.json({
      sport: "wnba",
      updated,
      categories: {
        points: { label: "Points", rows: topNBA(players, "points", 2.5, 3) },
        rebounds: {
          label: "Rebounds",
          rows: topNBA(players, "rebounds", 1.5, 2),
        },
        assists: {
          label: "Assists",
          rows: topNBA(players, "assists", 1.5, 2),
        },
        threes: { label: "Threes", rows: topNBA(players, "threes", 2.5, 1.5) },
        steals: { label: "Steals", rows: topNBA(players, "steals", 0.5, 0.5) },
        blocks: { label: "Blocks", rows: topNBA(players, "blocks", 0.5, 0.5) },
      },
    });
  }

  if (sport === "mls" || sport === "epl") {
    const players =
      sport === "mls" ? await getMLSPlayerStats() : await getEPLPlayerStats();

    if (players.length === 0) {
      return NextResponse.json({
        sport,
        updated,
        categories: {
          goals: { label: "Goals", rows: [] },
          assists: { label: "Assists", rows: [] },
          shots_on_target: { label: "Shots on Target", rows: [] },
          total_shots: { label: "Total Shots", rows: [] },
        },
        error: `Unable to fetch ${sport.toUpperCase()} player stats`,
      });
    }

    return NextResponse.json({
      sport,
      updated,
      categories: {
        goals: { label: "Goals", rows: topSoccerGoals(players) },
        assists: { label: "Assists", rows: topSoccerAssists(players) },
        shots_on_target: {
          label: "Shots on Target",
          rows: topSoccerShotsOnTarget(players),
        },
        total_shots: {
          label: "Total Shots",
          rows: topSoccerTotalShots(players),
        },
      },
    });
  }

  // NBA (default) ────────────────────────────────────────────────────────────
  const players = await getNBAPlayerStats();

  if (players.length === 0) {
    return NextResponse.json({
      sport: "nba",
      updated,
      categories: {
        points: { label: "Points", rows: [] },
        rebounds: { label: "Rebounds", rows: [] },
        assists: { label: "Assists", rows: [] },
        threes: { label: "Threes", rows: [] },
        steals: { label: "Steals", rows: [] },
        blocks: { label: "Blocks", rows: [] },
      },
      // Backwards-compat: keep legacy top-level keys with empty arrays so an
      // old client doesn't explode on the error path.
      points: [],
      rebounds: [],
      assists: [],
      error: "Unable to fetch player stats",
    });
  }

  const pointsRows = topNBA(players, "points", 2.5, 3);
  const reboundsRows = topNBA(players, "rebounds", 1.5, 2);
  const assistsRows = topNBA(players, "assists", 1.5, 2);
  const threesRows = topNBA(players, "threes", 2.5, 1.5);
  const stealsRows = topNBA(players, "steals", 0.5, 0.5);
  const blocksRows = topNBA(players, "blocks", 0.5, 0.5);

  return NextResponse.json({
    sport: "nba",
    updated,
    categories: {
      points: { label: "Points", rows: pointsRows },
      rebounds: { label: "Rebounds", rows: reboundsRows },
      assists: { label: "Assists", rows: assistsRows },
      threes: { label: "Threes", rows: threesRows },
      steals: { label: "Steals", rows: stealsRows },
      blocks: { label: "Blocks", rows: blocksRows },
    },
    // Backwards-compat: keep legacy top-level keys so clients reading the old
    // shape (before the page update lands) continue to work.
    points: pointsRows,
    rebounds: reboundsRows,
    assists: assistsRows,
  });
}
