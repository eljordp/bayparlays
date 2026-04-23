import { NextResponse } from "next/server";
import { getNBAPlayerStats, type PlayerStats } from "@/lib/espn-stats";
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

// ─── Route ───────────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  const url = new URL(req.url);
  const sportParam = url.searchParams.get("sport")?.toLowerCase() || "nba";
  const sport: "nba" | "mlb" | "nhl" =
    sportParam === "mlb" ? "mlb" : sportParam === "nhl" ? "nhl" : "nba";
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
    };

    return NextResponse.json({ sport: "nhl", updated, categories });
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
