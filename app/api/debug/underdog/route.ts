import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Quick diagnostic: hit Underdog directly from the serverless runtime and
// report what happens. Used to debug why /api/props overlay is always
// falling back to heuristic lines — Vercel functions may be getting
// blocked by Underdog's WAF even though browser+local curl succeed.
export async function GET() {
  const url =
    "https://api.underdogfantasy.com/beta/v5/over_under_lines";
  const start = Date.now();
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.9",
      },
      cache: "no-store",
    });
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      headers[k] = v;
    });
    const contentType = res.headers.get("content-type") || "";
    let bodyPreview: unknown = null;
    let parsedShape: unknown = null;
    if (contentType.includes("json")) {
      try {
        const json = (await res.json()) as Record<string, unknown>;
        parsedShape = {
          topKeys: Object.keys(json).slice(0, 10),
          lineCount: Array.isArray(json.over_under_lines)
            ? (json.over_under_lines as unknown[]).length
            : null,
          playerCount: Array.isArray(json.players)
            ? (json.players as unknown[]).length
            : null,
        };
      } catch (e) {
        bodyPreview = `JSON parse failed: ${String(e)}`;
      }
    } else {
      const text = await res.text();
      bodyPreview = text.slice(0, 800);
    }
    return NextResponse.json({
      status: res.status,
      ok: res.ok,
      contentType,
      elapsedMs: Date.now() - start,
      headers,
      parsedShape,
      bodyPreview,
    });
  } catch (e) {
    return NextResponse.json(
      {
        error: String(e),
        elapsedMs: Date.now() - start,
      },
      { status: 500 },
    );
  }
}
