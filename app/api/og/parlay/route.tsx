import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";

export const runtime = "edge";

// White-background share card for a parlay. Replaces the Remotion video flow
// for social sharing — 1200x630 static PNG, generated per-request from URL
// params. Optimized to stop the thumb on dark-mode Twitter/IG timelines where
// the current dark card design blends in.
//
// Design spec: white bg, red accent bar, DM Serif Display headline, bold
// monospace odds, sport-colored pills. No stock photography — purely typo-
// graphic + geometric branding that's actually shareable.
//
// Expected query params:
//   legs  — JSON-encoded array of { sport, pick, game, odds }
//   combined — combined American odds string (e.g. "+500")
//   payout — dollar payout string (e.g. "$500")
//   ev — numeric EV percent
//   confidence — AI hit-rate percent (0-100)

const SPORT_COLORS: Record<string, string> = {
  NBA: "#C8102E",
  MLB: "#002D62",
  NHL: "#0B1F3A",
  NFL: "#013369",
  NCAAB: "#003594",
  NCAAF: "#013369",
  MLS: "#1B5E20",
  UFC: "#D20A0A",
  WNBA: "#D95E00",
};

// TTF font URLs from Google's fonts GitHub mirror. @vercel/og (bundled by
// next/og in Next 14.2) only accepts TTF/OTF/WOFF — not WOFF2 — and Google
// Fonts CSS now only serves WOFF2, so we bypass it and fetch the raw TTF.
const FONT_URLS = {
  serif: "https://raw.githubusercontent.com/google/fonts/main/ofl/dmserifdisplay/DMSerifDisplay-Regular.ttf",
  sans: "https://raw.githubusercontent.com/google/fonts/main/ofl/inter/Inter%5Bslnt%2Cwght%5D.ttf",
};

async function fetchFont(url: string): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    return buf.byteLength > 0 ? buf : null;
  } catch {
    return null;
  }
}

interface ShareLeg {
  sport: string;
  pick: string;
  game: string;
  odds: string;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  let legs: ShareLeg[] = [];
  try {
    const legsParam = searchParams.get("legs");
    if (legsParam) legs = JSON.parse(decodeURIComponent(legsParam));
  } catch {
    legs = [];
  }
  legs = legs.slice(0, 5); // cap at 5 so the card never overflows

  const combined = searchParams.get("combined") || "—";
  const payout = searchParams.get("payout") || "—";
  const evNum = parseFloat(searchParams.get("ev") || "0");
  const confNum = parseFloat(searchParams.get("confidence") || "0");

  const [serifBuf, sansBuf] = await Promise.all([
    fetchFont(FONT_URLS.serif),
    fetchFont(FONT_URLS.sans),
  ]);

  // At least one font must load for @vercel/og to lay out text. If both
  // fail (GitHub blip, etc.), we return a 503 with a clear error rather
  // than a cryptic "no fonts loaded" from deep in the render engine.
  if (!serifBuf && !sansBuf) {
    return new Response("Font fetch failed — share card unavailable", {
      status: 503,
    });
  }

  const loadedFonts: {
    name: string;
    data: ArrayBuffer;
    weight: 400;
    style: "normal";
  }[] = [];
  if (serifBuf) {
    loadedFonts.push({
      name: "DM Serif Display",
      data: serifBuf,
      weight: 400,
      style: "normal",
    });
  }
  if (sansBuf) {
    loadedFonts.push({
      name: "Inter",
      data: sansBuf,
      weight: 400,
      style: "normal",
    });
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "#ffffff",
          padding: 60,
          fontFamily: "Inter, sans-serif",
        }}
      >
        {/* Top row: red accent + brand */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            marginBottom: 28,
          }}
        >
          <div
            style={{
              width: 56,
              height: 6,
              background: "#FF3B3B",
            }}
          />
          <span
            style={{
              fontSize: 18,
              fontWeight: 700,
              letterSpacing: 4,
              textTransform: "uppercase",
              color: "#FF3B3B",
            }}
          >
            BayParlays · AI Parlay
          </span>
        </div>

        {/* Headline: combined odds + payout */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            marginBottom: 24,
          }}
        >
          <h1
            style={{
              fontSize: 96,
              fontWeight: 400,
              color: "#0a0a0a",
              margin: 0,
              lineHeight: 1,
              fontFamily: "DM Serif Display, serif",
              letterSpacing: -2,
            }}
          >
            {combined} · {payout}
          </h1>
          <div
            style={{
              display: "flex",
              gap: 32,
              marginTop: 16,
              fontSize: 22,
              fontWeight: 600,
              color: "#555",
            }}
          >
            <span style={{ display: "flex", gap: 6 }}>
              <span>AI hit</span>
              <span style={{ color: "#0a0a0a", fontWeight: 900 }}>{confNum.toFixed(0)}%</span>
            </span>
            <span
              style={{
                color: evNum >= 0 ? "#0a7d3a" : "#b00020",
                fontWeight: 900,
              }}
            >
              {evNum >= 0 ? "+" : ""}
              {evNum.toFixed(1)}% EV
            </span>
          </div>
        </div>

        {/* Legs list */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
            flex: 1,
          }}
        >
          {legs.map((leg, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 20,
                paddingBottom: 12,
                borderBottom: "1px solid #eeeeee",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  minWidth: 72,
                  height: 36,
                  background: SPORT_COLORS[leg.sport?.toUpperCase()] || "#333",
                  color: "#fff",
                  borderRadius: 8,
                  fontSize: 16,
                  fontWeight: 900,
                  letterSpacing: 0.5,
                }}
              >
                {leg.sport}
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  flex: 1,
                  minWidth: 0,
                }}
              >
                <span
                  style={{
                    fontSize: 28,
                    fontWeight: 700,
                    color: "#0a0a0a",
                    lineHeight: 1.1,
                  }}
                >
                  {leg.pick}
                </span>
                <span
                  style={{
                    fontSize: 15,
                    color: "#888",
                    marginTop: 2,
                  }}
                >
                  {leg.game}
                </span>
              </div>
              <span
                style={{
                  fontSize: 26,
                  fontWeight: 900,
                  color: "#0a0a0a",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {leg.odds}
              </span>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            paddingTop: 20,
            marginTop: 16,
            borderTop: "2px solid #0a0a0a",
          }}
        >
          <span
            style={{
              fontSize: 18,
              fontWeight: 700,
              color: "#0a0a0a",
              letterSpacing: 0.5,
            }}
          >
            bayparlays.vercel.app
          </span>
          <span
            style={{
              fontSize: 13,
              color: "#999",
              fontWeight: 500,
            }}
          >
            Not financial advice · 21+
          </span>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: loadedFonts,
    },
  );
}
