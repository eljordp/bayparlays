import { NextResponse } from "next/server";
import {
  fetchUnderdogLines,
  buildUnderdogIndex,
  normalizePlayerKey,
} from "@/lib/underdog";

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
    // Also run the actual library path to see why matches fail
    let libReport: Record<string, unknown> | null = null;
    try {
      // ALSO do a raw fetch that matches the library's signature exactly,
      // so we can compare what the LIBRARY sees vs the debug's direct fetch.
      let libRawLineCount = 0;
      let libRawStatus = 0;
      let libRawHasData = false;
      try {
        const libRaw = await fetch(
          "https://api.underdogfantasy.com/beta/v5/over_under_lines",
          {
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
              Accept: "application/json, text/plain, */*",
              "Accept-Language": "en-US,en;q=0.9",
            },
            cache: "no-store",
          },
        );
        libRawStatus = libRaw.status;
        const j = (await libRaw.json()) as { over_under_lines?: unknown[] };
        libRawHasData = true;
        libRawLineCount = Array.isArray(j.over_under_lines)
          ? j.over_under_lines.length
          : 0;
      } catch (e) {
        libRawStatus = -1;
        libRawHasData = false;
        libRawLineCount = -1;
        console.error("libRaw fetch failed:", e);
      }

      const lines = await fetchUnderdogLines();
      const index = buildUnderdogIndex(lines);
      const byKey = index.byPlayerStat;
      const sportsAvailable = Array.from(index.sportAvailable);
      // Sample a few NBA + MLB + NHL players to see what keys look like
      const nbaProbes = [
        "Shai Gilgeous-Alexander",
        "Jayson Tatum",
        "Luka Doncic",
      ];
      const probeResults = nbaProbes.map((name) => {
        const key = `NBA|${normalizePlayerKey(name)}|points`;
        const hit = byKey.get(key);
        return {
          name,
          lookupKey: key,
          found: !!hit,
          matched: hit ? { stat: hit.stat, line: hit.lineValue } : null,
        };
      });
      // Show first 5 keys in the index for cross-reference
      const firstFiveKeys: string[] = [];
      let i = 0;
      for (const k of byKey.keys()) {
        if (k.startsWith("NBA|")) {
          firstFiveKeys.push(k);
          if (++i >= 10) break;
        }
      }
      libReport = {
        libRawStatus,
        libRawHasData,
        libRawLineCount,
        lineCountFromLib: lines.length,
        sportsAvailable,
        indexSize: byKey.size,
        firstNBAKeys: firstFiveKeys,
        probeResults,
      };
    } catch (e) {
      libReport = { libError: String(e) };
    }

    return NextResponse.json({
      status: res.status,
      ok: res.ok,
      contentType,
      elapsedMs: Date.now() - start,
      headers,
      parsedShape,
      bodyPreview,
      libReport,
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
