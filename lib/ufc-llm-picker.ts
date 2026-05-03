// UFC pick generator powered entirely by Gemini.
//
// Why this is different: the statistical model that runs MLB/NHL doesn't
// apply to UFC. Fighters fight 2-3 times a year — there's not enough data
// per fighter for Elo / form / matchup math to converge. But Gemini already
// knows every active UFC fighter (training cutoff includes their bios,
// recent fights, style breakdowns, layoff history). So for UFC we skip
// the stats foundation entirely and let the LLM be the picker.
//
// Flow per fight:
//   1. Pull UFC h2h odds from The Odds API (one call covers the whole card)
//   2. For each fight, build a prompt with both fighter names + current odds
//   3. Gemini returns winner + confidence (0-100) + one-sentence reason
//   4. Confidence is converted to ourProb; ourProb × decimal odds = EV
//
// Rate-limited sequential calls (Gemini free tier is 15 req/min) so a
// 12-fight card takes ~30 sec to score end-to-end.

import { getOddsApiKey } from "@/lib/odds-key";

const ODDS_BASE = "https://api.the-odds-api.com/v4";
const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export interface UfcFight {
  gameId: string;
  commenceTime: string;
  fighter1: string;
  fighter2: string;
  fighter1Odds: number; // American
  fighter2Odds: number;
  fighter1Book: string;
  fighter2Book: string;
}

export interface UfcPick {
  gameId: string;
  commenceTime: string;
  fighter1: string;
  fighter2: string;
  pick: string;            // The fighter Gemini picked
  pickOdds: number;        // American odds for the picked fighter
  bookForPick: string;
  confidence: number;      // Gemini's 0-100 estimate
  ourProb: number;         // confidence / 100
  impliedProb: number;     // book's implied (with vig)
  edge: number;            // ourProb - impliedProb
  evPercent: number;       // Expected return %
  reason: string;
  decimalOdds: number;
}

interface OddsResponse {
  id?: string;
  commence_time?: string;
  home_team?: string;
  away_team?: string;
  bookmakers?: Array<{
    key?: string;
    title?: string;
    markets?: Array<{
      key?: string;
      outcomes?: Array<{
        name?: string;
        price?: number;
      }>;
    }>;
  }>;
}

function americanToDecimal(odds: number): number {
  if (odds > 0) return odds / 100 + 1;
  return 100 / Math.abs(odds) + 1;
}

function americanToImpliedProb(odds: number): number {
  if (odds > 0) return 100 / (odds + 100);
  return Math.abs(odds) / (Math.abs(odds) + 100);
}

// For each fight, find the best (highest) odds across books for each side.
// We always want the best price the bettor could realistically get.
function bestOddsAcrossBooks(
  bookmakers: OddsResponse["bookmakers"] | undefined,
  team: string,
): { odds: number; book: string } | null {
  if (!bookmakers) return null;
  let best: { odds: number; book: string } | null = null;
  for (const bk of bookmakers) {
    const market = bk.markets?.find((m) => m.key === "h2h");
    if (!market) continue;
    const outcome = market.outcomes?.find((o) => o.name === team);
    if (!outcome || typeof outcome.price !== "number") continue;
    if (best === null || outcome.price > best.odds) {
      best = { odds: outcome.price, book: bk.title ?? bk.key ?? "?" };
    }
  }
  return best;
}

export async function fetchUfcCard(): Promise<UfcFight[]> {
  const apiKey = await getOddsApiKey();
  if (!apiKey) return [];
  try {
    const url = `${ODDS_BASE}/sports/mma_mixed_martial_arts/odds/?apiKey=${apiKey}&regions=us&markets=h2h&oddsFormat=american&bookmakers=draftkings,fanduel,betmgm,caesars,bovada`;
    const res = await fetch(url, { next: { revalidate: 1800 } });
    if (!res.ok) return [];
    const games = (await res.json()) as OddsResponse[];
    const now = Date.now();
    const horizon = 7 * 24 * 60 * 60 * 1000; // 7 days

    const fights: UfcFight[] = [];
    for (const g of games) {
      if (!g.commence_time || !g.home_team || !g.away_team || !g.id) continue;
      const t = new Date(g.commence_time).getTime();
      if (t < now || t > now + horizon) continue;
      const home = bestOddsAcrossBooks(g.bookmakers, g.home_team);
      const away = bestOddsAcrossBooks(g.bookmakers, g.away_team);
      if (!home || !away) continue;
      fights.push({
        gameId: g.id,
        commenceTime: g.commence_time,
        fighter1: g.away_team,    // Odds API "away" is fighter listed first
        fighter2: g.home_team,
        fighter1Odds: away.odds,
        fighter2Odds: home.odds,
        fighter1Book: away.book,
        fighter2Book: home.book,
      });
    }
    return fights;
  } catch (e) {
    console.error("fetchUfcCard failed:", e);
    return [];
  }
}

interface GeminiVerdict {
  winner: string;
  confidence: number;
  reason: string;
}

function buildFightPrompt(f: UfcFight): string {
  return `You are a sharp UFC bettor. A bookmaker has set the following moneyline:

- ${f.fighter1}: ${f.fighter1Odds > 0 ? "+" : ""}${f.fighter1Odds}
- ${f.fighter2}: ${f.fighter2Odds > 0 ? "+" : ""}${f.fighter2Odds}

Fight time: ${f.commenceTime}

Using your knowledge of these fighters' styles, recent form, layoff time, weight class, takedown defense, striking accuracy, durability, and historical matchup tendencies — pick a winner.

Respond with JSON ONLY, no prose:
{"winner": "<exact fighter name from above>", "confidence": <integer 30-95>, "reason": "<one sentence, ≤140 chars>"}

Confidence guide:
- 80-95: clear stylistic mismatch or huge skill gap
- 60-79: real edge, you'd bet small-medium
- 45-59: lean, you'd bet small or pass
- 30-44: closer to coin-flip, fade or pass
Never claim >95% confidence — every UFC fight has knockout variance.`;
}

async function callGemini(prompt: string, apiKey: string): Promise<GeminiVerdict | null> {
  try {
    const url = `${GEMINI_BASE}/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 200,
          responseMimeType: "application/json",
        },
      }),
    });
    if (!res.ok) {
      console.error(`Gemini ${res.status}: ${(await res.text()).slice(0, 150)}`);
      return null;
    }
    const data = await res.json();
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!raw) return null;
    const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(cleaned);
    if (!parsed.winner || typeof parsed.confidence !== "number" || !parsed.reason) {
      return null;
    }
    return {
      winner: parsed.winner.trim(),
      confidence: Math.max(30, Math.min(95, parsed.confidence)),
      reason: String(parsed.reason).slice(0, 200),
    };
  } catch (e) {
    console.error("Gemini fight call failed:", e);
    return null;
  }
}

export async function generateUfcPicks(): Promise<UfcPick[]> {
  const fights = await fetchUfcCard();
  if (fights.length === 0) return [];

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("UFC picks: GEMINI_API_KEY not set");
    return [];
  }

  const picks: UfcPick[] = [];
  // Sequential to avoid hitting Gemini's free-tier rate limit (15 req/min).
  for (const f of fights) {
    const verdict = await callGemini(buildFightPrompt(f), apiKey);
    if (!verdict) continue;

    // Match winner string to one of the two fighters (fuzzy contains)
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    const w = norm(verdict.winner);
    let pickName: string | null = null;
    let pickOdds = 0;
    let pickBook = "";
    if (norm(f.fighter1).includes(w) || w.includes(norm(f.fighter1))) {
      pickName = f.fighter1;
      pickOdds = f.fighter1Odds;
      pickBook = f.fighter1Book;
    } else if (norm(f.fighter2).includes(w) || w.includes(norm(f.fighter2))) {
      pickName = f.fighter2;
      pickOdds = f.fighter2Odds;
      pickBook = f.fighter2Book;
    } else {
      // Gemini named someone neither of the two — skip
      continue;
    }

    const decimalOdds = americanToDecimal(pickOdds);
    const impliedProb = americanToImpliedProb(pickOdds);
    const ourProb = verdict.confidence / 100;
    const edge = ourProb - impliedProb;
    const evPercent = (decimalOdds * ourProb - 1) * 100;

    picks.push({
      gameId: f.gameId,
      commenceTime: f.commenceTime,
      fighter1: f.fighter1,
      fighter2: f.fighter2,
      pick: pickName,
      pickOdds,
      bookForPick: pickBook,
      confidence: verdict.confidence,
      ourProb: Math.round(ourProb * 1000) / 1000,
      impliedProb: Math.round(impliedProb * 1000) / 1000,
      edge: Math.round(edge * 1000) / 1000,
      evPercent: Math.round(evPercent * 100) / 100,
      reason: verdict.reason,
      decimalOdds: Math.round(decimalOdds * 100) / 100,
    });
  }

  // Sort by EV descending — strongest plays first
  picks.sort((a, b) => b.evPercent - a.evPercent);
  return picks;
}
