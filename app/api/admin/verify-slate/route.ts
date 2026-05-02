import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

// Manual verify-slate endpoint.
//
// GET: returns the active slate's parlays with full leg context, pre-formatted
//      so the owner can paste the prompt into a Claude chat, get rankings
//      back, and POST the verdicts to apply them.
//
// POST: accepts { verdicts: Array<{ parlayId, verdict, reason }> } and
//       updates each parlay's llm_verdict / llm_confidence / llm_reason
//       columns. Picks marked "skip" are archived (archived_at set).

const OWNER_EMAILS = ["eljordp@gmail.com"];

function buildClaudePrompt(parlays: Array<Record<string, unknown>>, slateId: string): string {
  const blocks = parlays.map((p, i) => {
    const legs = (p.legs as Array<Record<string, unknown>>) ?? [];
    const legText = legs
      .map((l, j) => {
        const pick = l.pick ?? "?";
        const market = l.market ?? "?";
        const odds = l.odds ?? "?";
        const game = l.game ?? "?";
        const ourProb = l.ourProb ? Math.round((l.ourProb as number) * 100) : "?";
        const reasons = (l.reasons as string[]) ?? [];
        return `  Leg ${j + 1}: ${pick} (${market}, ${(typeof odds === "number" && odds > 0 ? "+" : "")}${odds}) — ${game} | model ${ourProb}% | ${reasons.slice(0, 2).join(" | ")}`;
      })
      .join("\n");
    return `Pick #${i + 1} [id: ${p.id}]
combined: ${p.combined_odds} | conf: ${p.confidence}% | EV claim: ${(p.ev_percent as number)?.toFixed(1) ?? "?"}%
${legText}`;
  });

  return `You are reviewing the BayParlays slate for ${slateId}.

For each pick below, decide whether to KEEP, mark SOFT (lukewarm), or SKIP entirely.
Consider: structural soundness, claimed EV vs realistic, individual leg quality, sport coverage gaps in the model.

Respond with JSON ONLY in this format:
[
  {"parlayId": "<id>", "verdict": "keep" | "soft" | "skip", "confidence": <0-100>, "reason": "<≤120 chars>"},
  ...
]

Picks:

${blocks.join("\n\n")}`;
}

export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get("email")?.toLowerCase();
  if (!email || !OWNER_EMAILS.includes(email)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  // Find the most recent slate
  const { data: latest } = await supabase
    .from("parlays")
    .select("slate_id")
    .not("slate_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!latest?.slate_id) {
    return NextResponse.json({ slateId: null, parlays: [], prompt: "" });
  }

  const { data: parlays } = await supabase
    .from("parlays")
    .select("id, slate_id, slate_rank, combined_odds, confidence, ev_percent, legs, llm_verdict, llm_confidence, llm_reason, status, archived_at")
    .eq("slate_id", latest.slate_id)
    .is("archived_at", null)
    .order("slate_rank", { ascending: true });

  const rows = parlays ?? [];
  const prompt = buildClaudePrompt(rows, latest.slate_id);

  return NextResponse.json(
    {
      slateId: latest.slate_id,
      parlays: rows,
      prompt,
      count: rows.length,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

interface IncomingVerdict {
  parlayId?: string;
  id?: string;
  verdict: "keep" | "soft" | "skip";
  confidence?: number;
  reason?: string;
}

export async function POST(req: NextRequest) {
  let body: { email?: string; verdicts?: IncomingVerdict[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const email = body.email?.toLowerCase();
  if (!email || !OWNER_EMAILS.includes(email)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  const verdicts = Array.isArray(body.verdicts) ? body.verdicts : [];
  if (verdicts.length === 0) {
    return NextResponse.json({ error: "no verdicts" }, { status: 400 });
  }

  const updated: string[] = [];
  const archived: string[] = [];
  const errors: Array<{ id: string; err: string }> = [];

  for (const v of verdicts) {
    const id = v.parlayId ?? v.id;
    if (!id) continue;
    if (v.verdict === "skip") {
      const { error } = await supabase
        .from("parlays")
        .update({
          archived_at: new Date().toISOString(),
          llm_verdict: "skip",
          llm_confidence: typeof v.confidence === "number" ? v.confidence : null,
          llm_reason: v.reason ?? "manual skip",
        })
        .eq("id", id);
      if (error) errors.push({ id, err: error.message });
      else archived.push(id);
    } else {
      const { error } = await supabase
        .from("parlays")
        .update({
          llm_verdict: v.verdict,
          llm_confidence: typeof v.confidence === "number" ? v.confidence : null,
          llm_reason: v.reason ?? null,
        })
        .eq("id", id);
      if (error) errors.push({ id, err: error.message });
      else updated.push(id);
    }
  }

  return NextResponse.json({
    updated: updated.length,
    archived: archived.length,
    errors,
  });
}
