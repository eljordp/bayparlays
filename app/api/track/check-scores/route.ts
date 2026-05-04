import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getOddsApiKey } from "@/lib/odds-key";

const SCORES_BASE = "https://api.the-odds-api.com/v4/sports";

const SPORT_MAP: Record<string, string> = {
  NBA: "basketball_nba",
  NFL: "americanfootball_nfl",
  MLB: "baseball_mlb",
  UFC: "mma_mixed_martial_arts",
  NHL: "icehockey_nhl",
};

interface ScoreGame {
  id: string;
  sport_key: string;
  home_team: string;
  away_team: string;
  completed: boolean;
  scores:
    | { name: string; score: string }[]
    | null;
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
  impliedProb: number;
  edgeScore: number;
}

interface OpeningLine {
  gameId: string;
  market: string;
  pick: string;
  odds: number;
  book: string;
  impliedProb: number;
  fairProb?: number;
  capturedAt: string;
}

interface ParlayRow {
  id: string;
  created_at: string;
  legs: ParlayLeg[];
  payout: number;
  stake: number;
  sports: string[];
  status: string;
  opening_lines?: OpeningLine[];
}

function americanToDecimal(odds: number): number {
  if (odds > 0) return odds / 100 + 1;
  return 100 / Math.abs(odds) + 1;
}

// Cache fetched scores per sport key to avoid duplicate API calls
const scoresCache = new Map<string, ScoreGame[]>();

async function fetchScores(sportKey: string): Promise<ScoreGame[]> {
  if (scoresCache.has(sportKey)) {
    return scoresCache.get(sportKey)!;
  }

  const apiKey = await getOddsApiKey();
  if (!apiKey) {
    console.error("No Odds API key for check-scores");
    scoresCache.set(sportKey, []);
    return [];
  }
  const url = `${SCORES_BASE}/${sportKey}/scores/?apiKey=${apiKey}&daysFrom=2`;
  const res = await fetch(url);

  if (!res.ok) {
    console.error(`Scores API error for ${sportKey}: ${res.status}`);
    scoresCache.set(sportKey, []);
    return [];
  }

  const data: ScoreGame[] = await res.json();
  scoresCache.set(sportKey, data);
  return data;
}

function normalizeTeam(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function findGame(scores: ScoreGame[], gameLabel: string): ScoreGame | null {
  // gameLabel is "Away Team vs Home Team"
  const parts = gameLabel.split(" vs ");
  if (parts.length < 2) return null;

  const awayNorm = normalizeTeam(parts[0]);
  const homeNorm = normalizeTeam(parts[1]);

  return (
    scores.find((g) => {
      const gHome = normalizeTeam(g.home_team);
      const gAway = normalizeTeam(g.away_team);
      // Match if team names are contained in either direction
      return (
        (gHome.includes(homeNorm) || homeNorm.includes(gHome)) &&
        (gAway.includes(awayNorm) || awayNorm.includes(gAway))
      );
    }) ?? null
  );
}

function getScores(game: ScoreGame): { home: number; away: number } | null {
  if (!game.scores || game.scores.length < 2) return null;

  const homeScore = game.scores.find(
    (s) => normalizeTeam(s.name) === normalizeTeam(game.home_team)
  );
  const awayScore = game.scores.find(
    (s) => normalizeTeam(s.name) === normalizeTeam(game.away_team)
  );

  if (!homeScore || !awayScore) return null;

  return {
    home: parseFloat(homeScore.score),
    away: parseFloat(awayScore.score),
  };
}

function didLegWin(
  leg: ParlayLeg,
  game: ScoreGame
): boolean | null {
  const scores = getScores(game);
  if (!scores) return null;

  const pick = leg.pick;

  if (leg.market === "moneyline") {
    // Pick format: "Team Name ML"
    const pickedTeam = pick.replace(/\s*ML$/i, "").trim();
    const pickedNorm = normalizeTeam(pickedTeam);
    const homeNorm = normalizeTeam(game.home_team);
    const awayNorm = normalizeTeam(game.away_team);

    const pickedHome =
      homeNorm.includes(pickedNorm) || pickedNorm.includes(homeNorm);
    const pickedAway =
      awayNorm.includes(pickedNorm) || pickedNorm.includes(awayNorm);

    if (pickedHome) return scores.home > scores.away;
    if (pickedAway) return scores.away > scores.home;
    return null;
  }

  if (leg.market === "spread") {
    // Pick format: "Team Name +/-X.X"
    const spreadMatch = pick.match(/^(.+?)\s+([+-]?\d+\.?\d*)$/);
    if (!spreadMatch) return null;

    const pickedTeam = spreadMatch[1].trim();
    const spread = parseFloat(spreadMatch[2]);
    const pickedNorm = normalizeTeam(pickedTeam);
    const homeNorm = normalizeTeam(game.home_team);

    const pickedHome =
      homeNorm.includes(pickedNorm) || pickedNorm.includes(homeNorm);

    let teamScore: number;
    let opponentScore: number;

    if (pickedHome) {
      teamScore = scores.home;
      opponentScore = scores.away;
    } else {
      teamScore = scores.away;
      opponentScore = scores.home;
    }

    return teamScore + spread > opponentScore;
  }

  if (leg.market === "total") {
    // Pick format: "Over X.X" or "Under X.X"
    const totalMatch = pick.match(/^(Over|Under)\s+(\d+\.?\d*)$/i);
    if (!totalMatch) return null;

    const direction = totalMatch[1].toLowerCase();
    const line = parseFloat(totalMatch[2]);
    const actualTotal = scores.home + scores.away;

    if (direction === "over") return actualTotal > line;
    return actualTotal < line;
  }

  return null;
}

// Allow both GET (browser/cron) and POST
export async function GET() {
  return checkScores();
}

export async function POST() {
  return checkScores();
}

async function checkScores() {
  try {
    const resolvedKey = await getOddsApiKey();
    if (!resolvedKey) {
      return NextResponse.json(
        { error: "ODDS_API_KEY not configured" },
        { status: 500 }
      );
    }

    // Fetch pending parlays from last 48 hours
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - 48);

    const { data: pendingParlays, error } = await supabase
      .from("parlays")
      .select("*")
      .eq("status", "pending")
      .gte("created_at", cutoff.toISOString())
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Supabase query error:", error);
      return NextResponse.json(
        { error: "Failed to fetch pending parlays", details: error.message },
        { status: 500 }
      );
    }

    const rows = (pendingParlays ?? []) as ParlayRow[];

    if (rows.length === 0) {
      return NextResponse.json({
        message: "No pending parlays to check",
        updated: 0,
      });
    }

    // Collect all unique sport keys we need scores for
    const sportKeys = new Set<string>();
    for (const parlay of rows) {
      for (const sport of parlay.sports ?? []) {
        const key = SPORT_MAP[sport.toUpperCase()];
        if (key) sportKeys.add(key);
      }
    }

    // Fetch scores for all sports in parallel
    await Promise.all(
      Array.from(sportKeys).map((key) => fetchScores(key))
    );

    // Process each pending parlay
    const updates: { id: string; status: string; profit: number }[] = [];

    for (const parlay of rows) {
      const legs = parlay.legs;
      let allResolved = true;
      let anyLost = false;

      // Per-leg outcome log written back to the parlay row so the calibration
      // job can bucket by (sport, market, odds_bucket) at LEG granularity
      // instead of just rolling everything up to the parlay's win/loss.
      const legResults: Array<{
        gameId: string | null;
        sport: string;
        market: string;
        pick: string;
        odds: number | null;
        decimalOdds: number | null;
        result: "won" | "lost";
      }> = [];

      for (const leg of legs) {
        const sportKey = SPORT_MAP[leg.sport?.toUpperCase()];
        if (!sportKey) {
          allResolved = false;
          continue;
        }

        const scores = scoresCache.get(sportKey) ?? [];
        const game = findGame(scores, leg.game);

        if (!game || !game.completed) {
          allResolved = false;
          continue;
        }

        const result = didLegWin(leg, game);
        if (result === null) {
          allResolved = false;
          continue;
        }

        if (!result) {
          anyLost = true;
        }

        legResults.push({
          gameId: leg.gameId ?? null,
          sport: leg.sport,
          market: leg.market,
          pick: leg.pick,
          odds: typeof leg.odds === "number" ? leg.odds : null,
          decimalOdds: (() => {
            const decRaw = (leg as unknown as { decimalOdds?: unknown }).decimalOdds;
            if (typeof decRaw === "number") return decRaw;
            if (typeof leg.odds === "number") return americanToDecimal(leg.odds);
            return null;
          })(),
          result: result ? "won" : "lost",
        });
      }

      if (!allResolved && !anyLost) continue;

      // If any leg lost, the whole parlay is lost (even if some legs unresolved)
      // If all resolved and none lost, it's a win
      const newStatus = anyLost ? "lost" : allResolved ? "won" : null;
      if (!newStatus) continue;

      const stake = parlay.stake ?? 100;
      const profit = newStatus === "won" ? parlay.payout - stake : -stake;

      // Compute CLV: for each leg, find the line_history row closest to (but
      // not after) commence_time and compare to the opening price. Positive
      // CLV = we beat the closing line = model is sharp. Consistent positive
      // CLV is the only sharpness signal that isn't just variance.
      let clvPercent: number | null = null;
      const closingLines: Array<{ gameId: string; market: string; pick: string; closingOdds: number | null; clv: number | null }> = [];
      try {
        const perLegClvs: number[] = [];
        for (const leg of legs) {
          if (!leg.gameId || !leg.commenceTime) continue;
          const { data: historyRows } = await supabase
            .from("line_history")
            .select("best_odds, captured_at")
            .eq("game_id", leg.gameId)
            .eq("market", leg.market)
            .eq("team", leg.pick)
            .lte("captured_at", leg.commenceTime)
            .order("captured_at", { ascending: false })
            .limit(1);
          const closingOdds = historyRows?.[0]?.best_odds ?? null;
          const openingLine = (parlay.opening_lines ?? []).find(
            (o) => o.gameId === leg.gameId && o.market === leg.market && o.pick === leg.pick,
          );
          const openingOdds = openingLine?.odds ?? leg.odds;
          if (closingOdds !== null && openingOdds) {
            const openDec = americanToDecimal(openingOdds);
            const closeDec = americanToDecimal(closingOdds);
            // CLV = how much better your opening price is vs closing. Higher
            // decimal odds at open = you got a better price = positive CLV.
            const legClv = (openDec / closeDec - 1) * 100;
            perLegClvs.push(legClv);
            closingLines.push({ gameId: leg.gameId, market: leg.market, pick: leg.pick, closingOdds, clv: legClv });
          } else {
            closingLines.push({ gameId: leg.gameId, market: leg.market, pick: leg.pick, closingOdds, clv: null });
          }
        }
        if (perLegClvs.length > 0) {
          clvPercent = perLegClvs.reduce((s, x) => s + x, 0) / perLegClvs.length;
          clvPercent = Math.round(clvPercent * 100) / 100;
        }
      } catch (err) {
        console.error(`CLV calc failed for parlay ${parlay.id}:`, err);
      }

      const updatePayload: Record<string, unknown> = { status: newStatus, profit };
      if (clvPercent !== null) updatePayload.clv_percent = clvPercent;
      if (closingLines.length > 0) updatePayload.closing_lines = closingLines;
      if (legResults.length > 0) updatePayload.leg_results = legResults;

      const { error: updateError } = await supabase
        .from("parlays")
        .update(updatePayload)
        .eq("id", parlay.id);

      if (updateError) {
        // If new columns haven't been migrated yet, retry without them so
        // grading still proceeds on environments lagging on migrations.
        if (/column .*(clv_percent|closing_lines|leg_results)/i.test(updateError.message || "")) {
          const { error: retryErr } = await supabase
            .from("parlays")
            .update({ status: newStatus, profit })
            .eq("id", parlay.id);
          if (retryErr) {
            console.error(`Failed to update parlay ${parlay.id}:`, retryErr);
            continue;
          }
        } else {
          console.error(`Failed to update parlay ${parlay.id}:`, updateError);
          continue;
        }
      }

      updates.push({ id: parlay.id, status: newStatus, profit });
    }

    // ── Grade edge_picks too ──────────────────────────────────────────
    // Same scores cache, same didLegWin parser. Every sharp-edge pick that's
    // been sitting in pending for a completed game gets its status, profit,
    // and CLV updated so /edges/history reflects real outcomes.
    const edgeCutoff = new Date();
    edgeCutoff.setHours(edgeCutoff.getHours() - 48);
    const edgesUpdated: { id: string; status: string; profit: number }[] = [];
    try {
      const { data: pendingEdges } = await supabase
        .from("edge_picks")
        .select("*")
        .eq("status", "pending")
        .gte("created_at", edgeCutoff.toISOString());
      const edgeRows = (pendingEdges ?? []) as Array<{
        id: string;
        sport: string;
        game_id: string;
        game: string;
        market: string;
        pick: string;
        commence_time: string;
        odds: number;
        decimal_odds: number;
      }>;

      // Make sure we have scores for any sport in the edges queue.
      const edgeSportKeys = new Set<string>();
      for (const e of edgeRows) {
        const k = SPORT_MAP[e.sport?.toUpperCase()];
        if (k && !scoresCache.has(k)) edgeSportKeys.add(k);
      }
      await Promise.all(Array.from(edgeSportKeys).map((k) => fetchScores(k)));

      for (const edge of edgeRows) {
        const sportKey = SPORT_MAP[edge.sport?.toUpperCase()];
        if (!sportKey) continue;
        const scores = scoresCache.get(sportKey) ?? [];
        const game = findGame(scores, edge.game);
        if (!game || !game.completed) continue;

        const result = didLegWin(
          {
            sport: edge.sport,
            game: edge.game,
            pick: edge.pick,
            market: edge.market,
            odds: edge.odds,
            book: "",
            impliedProb: 0,
            edgeScore: 0,
          } as ParlayLeg,
          game,
        );
        if (result === null) continue;

        const newStatus = result ? "won" : "lost";
        const stake = 100;
        const profit = result ? stake * (edge.decimal_odds - 1) : -stake;

        // Closing-line capture for this single leg's CLV
        let clv: number | null = null;
        let closingOdds: number | null = null;
        try {
          const { data: historyRows } = await supabase
            .from("line_history")
            .select("best_odds, captured_at")
            .eq("game_id", edge.game_id)
            .eq("market", edge.market)
            .eq("team", edge.pick)
            .lte("captured_at", edge.commence_time)
            .order("captured_at", { ascending: false })
            .limit(1);
          closingOdds = historyRows?.[0]?.best_odds ?? null;
          if (closingOdds !== null) {
            const openDec = americanToDecimal(edge.odds);
            const closeDec = americanToDecimal(closingOdds);
            clv = Math.round(((openDec / closeDec - 1) * 100) * 100) / 100;
          }
        } catch {
          /* non-fatal */
        }

        const { error: edgeUpdateErr } = await supabase
          .from("edge_picks")
          .update({
            status: newStatus,
            profit: Math.round(profit * 100) / 100,
            closing_odds: closingOdds,
            clv_percent: clv,
            resolved_at: new Date().toISOString(),
          })
          .eq("id", edge.id);
        if (edgeUpdateErr) {
          console.error(`Failed to update edge ${edge.id}:`, edgeUpdateErr);
          continue;
        }
        edgesUpdated.push({ id: edge.id, status: newStatus, profit });
      }
    } catch (err) {
      console.error("Edge grading failed:", err);
    }

    // Clear the cache after processing
    scoresCache.clear();

    return NextResponse.json({
      message: `Checked ${rows.length} pending parlays`,
      updated: updates.length,
      results: updates,
      edgesUpdated: edgesUpdated.length,
      edgeResults: edgesUpdated,
    });
  } catch (error) {
    console.error("Check scores error:", error);
    scoresCache.clear();
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
