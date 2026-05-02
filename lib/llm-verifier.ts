// LLM-as-verifier — adds reasoning on top of the statistical model.
//
// Each candidate parlay coming out of /api/parlays is scored by an LLM
// using Gemini 1.5 Flash by default (free tier, ~1500 req/day cap). The
// prompt includes the leg picks, claimed model probabilities, and a
// short context block (recent form, schedule, injury notes the legs
// already carry). The LLM returns a 0-100 confidence, a verdict
// (keep/skip), and a one-line reason.
//
// Use the abstract Verifier shape so we can swap providers later
// (Claude API, Groq, local Ollama, etc) without touching call sites.

export interface VerifierLeg {
  pick?: string;
  market?: string;
  sport?: string;
  game?: string;
  odds?: number;
  ourProb?: number;
  trueEdge?: number;
  reasons?: string[];
  injuryNote?: string | null;
  weatherNote?: string | null;
  pitcherNote?: string | null;
  restNote?: string | null;
}

export interface VerifierParlay {
  id: string;
  legs: VerifierLeg[];
  combinedOdds: string;
  combinedDecimal: number;
  confidence: number;
  evPercent: number;
}

export interface VerifierVerdict {
  parlayId: string;
  llmConfidence: number; // 0-100
  verdict: "keep" | "skip" | "soft";
  reason: string;
}

export interface Verifier {
  name: string;
  scoreParlay: (p: VerifierParlay) => Promise<VerifierVerdict>;
  scoreSlate: (parlays: VerifierParlay[]) => Promise<VerifierVerdict[]>;
}

// ─── Prompt construction ──────────────────────────────────────────

function legText(leg: VerifierLeg): string {
  const parts: string[] = [];
  parts.push(`${leg.pick ?? "?"} (${leg.market ?? "?"}, ${leg.sport ?? "?"}) — ${leg.game ?? "?"}`);
  parts.push(`  odds=${leg.odds && leg.odds > 0 ? "+" : ""}${leg.odds}, model prob=${((leg.ourProb ?? 0) * 100).toFixed(0)}%, edge=${((leg.trueEdge ?? 0) * 100).toFixed(1)}pp`);
  if (leg.injuryNote) parts.push(`  injuries: ${leg.injuryNote}`);
  if (leg.restNote) parts.push(`  rest: ${leg.restNote}`);
  if (leg.weatherNote) parts.push(`  weather: ${leg.weatherNote}`);
  if (leg.pitcherNote) parts.push(`  pitchers: ${leg.pitcherNote}`);
  if (leg.reasons && leg.reasons.length) {
    parts.push(`  signals: ${leg.reasons.slice(0, 3).join(" | ")}`);
  }
  return parts.join("\n");
}

function buildPrompt(parlay: VerifierParlay): string {
  const legBlock = parlay.legs.map((l, i) => `Leg ${i + 1}: ${legText(l)}`).join("\n\n");
  return `You are a sharp sports bettor reviewing a parlay built by a statistical model.

Parlay summary:
- Combined odds: ${parlay.combinedOdds}
- Model claims hit probability: ${parlay.confidence}%
- Model claims +EV: ${parlay.evPercent.toFixed(1)}%
- Number of legs: ${parlay.legs.length}

Legs:
${legBlock}

Your job: judge whether the model's confidence is realistic given the situation. Consider:
- Are any legs on backup goalies (NHL), key player out (NBA), bad pitching matchup (MLB)?
- Is the parlay structurally sketchy (4+ longshots strung together)?
- Does the claimed EV pass a sanity check given the legs and odds?
- Would a sharp human bet this?

Respond with JSON ONLY, no prose around it:
{"confidence": <0-100 integer>, "verdict": "keep" | "skip" | "soft", "reason": "<one sentence, ≤120 chars>"}

Verdict guide:
- "keep" = real, ride it
- "soft" = ok but not great, consider skipping for slate
- "skip" = structurally bad, do not publish`;
}

// ─── Gemini implementation ────────────────────────────────────────

const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
}

async function callGemini(prompt: string, apiKey: string): Promise<string | null> {
  const url = `${GEMINI_BASE}/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 200,
          responseMimeType: "application/json",
        },
      }),
    });
    if (!res.ok) {
      console.error(`Gemini ${res.status}: ${await res.text().then((t) => t.slice(0, 200))}`);
      return null;
    }
    const data = (await res.json()) as GeminiResponse;
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
  } catch (e) {
    console.error("Gemini call failed:", e);
    return null;
  }
}

function parseVerdict(raw: string | null, parlayId: string): VerifierVerdict {
  if (!raw) {
    return {
      parlayId,
      llmConfidence: 50,
      verdict: "soft",
      reason: "LLM no-response — defaulting to soft keep",
    };
  }
  try {
    // Strip code fences if present
    const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(cleaned);
    const conf = typeof parsed.confidence === "number" ? Math.max(0, Math.min(100, parsed.confidence)) : 50;
    const verdict = ["keep", "skip", "soft"].includes(parsed.verdict) ? parsed.verdict : "soft";
    const reason = typeof parsed.reason === "string" ? parsed.reason.slice(0, 200) : "no reason";
    return { parlayId, llmConfidence: conf, verdict, reason };
  } catch {
    return {
      parlayId,
      llmConfidence: 50,
      verdict: "soft",
      reason: `LLM parse failed: ${raw.slice(0, 80)}`,
    };
  }
}

export function geminiVerifier(apiKey: string | undefined): Verifier {
  return {
    name: "gemini-2.5-flash",
    async scoreParlay(p) {
      if (!apiKey) {
        return {
          parlayId: p.id,
          llmConfidence: 50,
          verdict: "soft",
          reason: "no GEMINI_API_KEY — defaulting to soft keep",
        };
      }
      const prompt = buildPrompt(p);
      const raw = await callGemini(prompt, apiKey);
      return parseVerdict(raw, p.id);
    },
    async scoreSlate(parlays) {
      // Simple sequential — Gemini free tier is 15 req/min so paralleling
      // 36 candidates at once will rate-limit. Keep it sequential for
      // safety; total elapsed = ~36 sec for a 12-pick slate, fine for
      // a cron job.
      const out: VerifierVerdict[] = [];
      for (const p of parlays) {
        const v = await this.scoreParlay(p);
        out.push(v);
      }
      return out;
    },
  };
}

// Dummy verifier: passes everything through as "keep" with neutral confidence.
// Used when verifier is disabled, for fallback, and when no API key is set.
export const passthroughVerifier: Verifier = {
  name: "passthrough",
  async scoreParlay(p) {
    return {
      parlayId: p.id,
      llmConfidence: p.confidence,
      verdict: "keep",
      reason: "verifier disabled — pass-through",
    };
  },
  async scoreSlate(parlays) {
    return parlays.map((p) => ({
      parlayId: p.id,
      llmConfidence: p.confidence,
      verdict: "keep" as const,
      reason: "verifier disabled — pass-through",
    }));
  },
};

// Pick the active verifier based on env. Default to passthrough so deploy
// without setting GEMINI_API_KEY isn't broken — slate just acts like before.
export function activeVerifier(): Verifier {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return passthroughVerifier;
  return geminiVerifier(key);
}
