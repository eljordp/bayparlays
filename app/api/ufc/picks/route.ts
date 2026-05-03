import { NextResponse } from "next/server";
import { generateUfcPicks } from "@/lib/ufc-llm-picker";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
export const maxDuration = 60;

// UFC picks endpoint — Gemini-driven LLM picker.
//
// Each call generates picks for the entire upcoming UFC card (within
// 7 days). Sequential Gemini calls take ~30 sec for a 12-fight card,
// hence the 60s maxDuration. Server-side cache is 30 minutes so
// repeat hits within a window don't re-burn Gemini quota.

let cached: { picks: Awaited<ReturnType<typeof generateUfcPicks>>; cachedAt: number } | null = null;
const CACHE_TTL_MS = 30 * 60 * 1000;

export async function GET() {
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return NextResponse.json(
      {
        picks: cached.picks,
        cachedAt: new Date(cached.cachedAt).toISOString(),
        fromCache: true,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const picks = await generateUfcPicks();
  cached = { picks, cachedAt: Date.now() };

  return NextResponse.json(
    {
      picks,
      cachedAt: new Date(cached.cachedAt).toISOString(),
      fromCache: false,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
