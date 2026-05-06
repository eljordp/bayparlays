import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// One-shot historical leg_results backfill.
//
// The resolver started writing per-leg outcomes on 2026-05-04. Every parlay
// graded before that date only has parlay-level (won/lost) status — no per-
// leg granularity. The trained ML model needs leg-level outcomes to fit, so
// the dataset was effectively gated to ~225 legs from new gradings only,
// even though the full history has ~1,500 graded parlays = ~3,500-4,000 legs.
//
// This endpoint re-grades historical parlays using ESPN's free public
// scoreboard API (free, supports historical dates, no auth) instead of the
// Odds API (paid + only goes back 2 days). For each parlay missing
// leg_results, we look up the games' final scores by date+sport and apply
// the same grading logic the live resolver uses.
//
// Idempotent — running it twice is a no-op for parlays already backfilled.

interface ParlayLeg {
  sport?: string;
  game?: string;
  gameId?: string;
  market?: string;
  pick?: string;
  odds?: number;
  decimalOdds?: number;
}

interface ParlayRow {
  id: string;
  created_at: string;
  legs: ParlayLeg[] | null;
  status: string;
  leg_results: unknown;
}

interface EspnCompetitor {
  homeAway: "home" | "away";
  team?: { displayName?: string; abbreviation?: string };
  score?: string;
}

interface EspnEvent {
  date?: string;
  competitions?: Array<{
    completed?: boolean;
    status?: { type?: { completed?: boolean; description?: string } };
    competitors?: EspnCompetitor[];
  }>;
}

interface EspnScoreboard {
  events?: EspnEvent[];
}

// ESPN sport+league path for each of our sports. Same root host so we can
// share the fetch helper across all of them.
const ESPN_PATHS: Record<string, string> = {
  MLB: "baseball/mlb",
  NBA: "basketball/nba",
  NHL: "hockey/nhl",
  NFL: "football/nfl",
  NCAAF: "football/college-football",
  NCAAB: "basketball/mens-college-basketball",
};

interface NormalizedGame {
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  completed: boolean;
}

function normalizeTeam(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function americanToDecimal(odds: number): number {
  if (odds > 0) return odds / 100 + 1;
  return 100 / Math.abs(odds) + 1;
}

async function fetchEspnGames(
  sport: string,
  yyyymmdd: string,
): Promise<NormalizedGame[]> {
  const path = ESPN_PATHS[sport];
  if (!path) return [];
  const url =
    `https://site.api.espn.com/apis/site/v2/sports/${path}/scoreboard` +
    `?dates=${yyyymmdd}`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        Accept: "application/json",
      },
      cache: "no-store",
    });
    if (!res.ok) return [];
    const json = (await res.json()) as EspnScoreboard;
    const games: NormalizedGame[] = [];
    for (const ev of json.events ?? []) {
      const comp = ev.competitions?.[0];
      if (!comp) continue;
      const completed =
        !!comp.completed || !!comp.status?.type?.completed;
      const home = comp.competitors?.find((c) => c.homeAway === "home");
      const away = comp.competitors?.find((c) => c.homeAway === "away");
      if (!home?.team?.displayName || !away?.team?.displayName) continue;
      const homeScore = home.score !== undefined ? Number(home.score) : NaN;
      const awayScore = away.score !== undefined ? Number(away.score) : NaN;
      if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore)) continue;
      games.push({
        homeTeam: home.team.displayName,
        awayTeam: away.team.displayName,
        homeScore,
        awayScore,
        completed,
      });
    }
    return games;
  } catch {
    return [];
  }
}

function findGame(
  games: NormalizedGame[],
  awayTeamHint: string,
  homeTeamHint: string,
): NormalizedGame | null {
  const aN = normalizeTeam(awayTeamHint);
  const hN = normalizeTeam(homeTeamHint);
  return (
    games.find((g) => {
      const gh = normalizeTeam(g.homeTeam);
      const ga = normalizeTeam(g.awayTeam);
      const homeMatch = gh.includes(hN) || hN.includes(gh);
      const awayMatch = ga.includes(aN) || aN.includes(ga);
      return homeMatch && awayMatch;
    }) ?? null
  );
}

// Same grading logic as the live resolver, just operating on the
// normalized ESPN game shape instead of Odds API's ScoreGame.
function gradeLeg(
  leg: ParlayLeg,
  game: NormalizedGame,
): "won" | "lost" | null {
  if (!leg.market || !leg.pick) return null;

  if (leg.market === "moneyline") {
    const pickedTeam = leg.pick.replace(/\s*ML$/i, "").trim();
    const pN = normalizeTeam(pickedTeam);
    const hN = normalizeTeam(game.homeTeam);
    const aN = normalizeTeam(game.awayTeam);
    const pickedHome = hN.includes(pN) || pN.includes(hN);
    const pickedAway = aN.includes(pN) || pN.includes(aN);
    if (pickedHome) return game.homeScore > game.awayScore ? "won" : "lost";
    if (pickedAway) return game.awayScore > game.homeScore ? "won" : "lost";
    return null;
  }

  if (leg.market === "spread") {
    const m = leg.pick.match(/^(.+?)\s+([+-]?\d+\.?\d*)$/);
    if (!m) return null;
    const pickedTeam = m[1].trim();
    const spread = parseFloat(m[2]);
    const pN = normalizeTeam(pickedTeam);
    const hN = normalizeTeam(game.homeTeam);
    const pickedHome = hN.includes(pN) || pN.includes(hN);
    const teamScore = pickedHome ? game.homeScore : game.awayScore;
    const opp = pickedHome ? game.awayScore : game.homeScore;
    return teamScore + spread > opp ? "won" : "lost";
  }

  if (leg.market === "total") {
    const m = leg.pick.match(/^(Over|Under)\s+(\d+\.?\d*)$/i);
    if (!m) return null;
    const dir = m[1].toLowerCase();
    const line = parseFloat(m[2]);
    const total = game.homeScore + game.awayScore;
    if (dir === "over") return total > line ? "won" : "lost";
    return total < line ? "won" : "lost";
  }

  return null;
}

// Extract YYYYMMDD from leg.commenceTime (ISO) or fallback to parlay
// created_at if leg has no commenceTime stored.
function dateKey(iso: string | undefined): string | null {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return null;
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return `${y}${m}${day}`;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: "Missing Supabase env" }, { status: 500 });
  }
  const supabase = createClient(url, key);

  const startTime = Date.now();
  const result = {
    parlays_scanned: 0,
    parlays_updated: 0,
    legs_graded: 0,
    legs_unmatched: 0,
    games_fetched: 0,
    errors: [] as string[],
  };

  // Pull graded parlays missing leg_results, in batches. Cap at 500 per
  // run to stay under the 60s timeout — caller can re-trigger as needed
  // until backfilled count is 0.
  const BATCH_LIMIT = 500;
  const { data: parlayRows, error: pErr } = await supabase
    .from("parlays")
    .select("id, created_at, legs, status, leg_results")
    .neq("status", "pending")
    .is("leg_results", null)
    .order("created_at", { ascending: false })
    .limit(BATCH_LIMIT);
  if (pErr) {
    return NextResponse.json({ error: pErr.message }, { status: 500 });
  }
  const parlays = (parlayRows ?? []) as ParlayRow[];
  result.parlays_scanned = parlays.length;

  // Cache fetched scoreboards by (sport, date) so we don't refetch the
  // same date+sport multiple times across parlays in this batch.
  const scoreCache = new Map<string, NormalizedGame[]>();
  async function getGames(sport: string, yyyymmdd: string): Promise<NormalizedGame[]> {
    const k = `${sport}|${yyyymmdd}`;
    if (scoreCache.has(k)) return scoreCache.get(k)!;
    const games = await fetchEspnGames(sport, yyyymmdd);
    scoreCache.set(k, games);
    if (games.length > 0) result.games_fetched++;
    return games;
  }

  for (const parlay of parlays) {
    if (!Array.isArray(parlay.legs) || parlay.legs.length === 0) continue;
    const legResults: Array<{
      gameId: string | null;
      sport: string;
      market: string;
      pick: string;
      odds: number | null;
      decimalOdds: number | null;
      result: "won" | "lost";
    }> = [];

    let allLegsGraded = true;
    for (const leg of parlay.legs) {
      const sport = (leg.sport ?? "").toUpperCase();
      if (!sport || !leg.market || !leg.pick) {
        allLegsGraded = false;
        break;
      }
      // Try leg's commenceTime first (stored on the jsonb leg even though
      // not in the typed interface), fall back to parlay created_at for
      // older parlays saved before commenceTime was tracked.
      const legCommence = (leg as { commenceTime?: string }).commenceTime;
      const dk = dateKey(legCommence) ?? dateKey(parlay.created_at);
      if (!dk) {
        allLegsGraded = false;
        break;
      }
      // Try the day-of and day-after to handle late-night games that
      // started one UTC day and finished on the next.
      let games = await getGames(sport, dk);
      let parts = (leg.game ?? "").split(/\s+vs\s+/i);
      if (parts.length < 2) parts = (leg.game ?? "").split(/\s+@\s+/);
      const awayHint = parts[0]?.trim() ?? "";
      const homeHint = parts[1]?.trim() ?? "";
      let game = findGame(games, awayHint, homeHint);
      if (!game) {
        // Fallback: try the day after (covers UTC-day-rollover games)
        const next = new Date(`${dk.slice(0, 4)}-${dk.slice(4, 6)}-${dk.slice(6, 8)}T00:00:00Z`);
        next.setUTCDate(next.getUTCDate() + 1);
        const ndk =
          next.getUTCFullYear() +
          String(next.getUTCMonth() + 1).padStart(2, "0") +
          String(next.getUTCDate()).padStart(2, "0");
        games = await getGames(sport, ndk);
        game = findGame(games, awayHint, homeHint);
      }
      if (!game || !game.completed) {
        result.legs_unmatched++;
        allLegsGraded = false;
        break;
      }
      const graded = gradeLeg(leg, game);
      if (!graded) {
        result.legs_unmatched++;
        allLegsGraded = false;
        break;
      }
      const dec =
        typeof leg.decimalOdds === "number" && leg.decimalOdds > 1
          ? leg.decimalOdds
          : typeof leg.odds === "number"
            ? americanToDecimal(leg.odds)
            : null;
      legResults.push({
        gameId: leg.gameId ?? null,
        sport,
        market: leg.market,
        pick: leg.pick,
        odds: typeof leg.odds === "number" ? leg.odds : null,
        decimalOdds: dec,
        result: graded,
      });
    }

    if (!allLegsGraded || legResults.length === 0) continue;

    // Sanity check: a parlay with status=won should have all legs winning.
    // Catches any grading bugs from team-name mismatches against ESPN data.
    if (parlay.status === "won" && legResults.some((l) => l.result === "lost")) {
      result.errors.push(
        `parlay ${parlay.id} status=won but at least one leg graded as lost — skipping (likely team-name mismatch)`,
      );
      continue;
    }

    const { error: uErr } = await supabase
      .from("parlays")
      .update({ leg_results: legResults })
      .eq("id", parlay.id);
    if (uErr) {
      result.errors.push(`update ${parlay.id}: ${uErr.message}`);
      continue;
    }
    result.parlays_updated++;
    result.legs_graded += legResults.length;
  }

  return NextResponse.json({
    ok: true,
    duration_ms: Date.now() - startTime,
    ...result,
    has_more: parlays.length === BATCH_LIMIT,
    timestamp: new Date().toISOString(),
  });
}
