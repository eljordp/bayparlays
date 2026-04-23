"use client";

import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
} from "remotion";

/* ─── Types ─── */

export interface EdgeLegData {
  sport: string;
  game: string;
  pick: string;
  market?: string;
  odds: number;
  book: string;
  impliedProb: number;
  fairProb?: number;
  evVsFair?: number;
  sharpEdge?: boolean;
  reasons?: string[];
}

export interface EdgeShareVideoProps {
  leg: EdgeLegData;
  format?: "square" | "story";
}

/* ─── Helpers ─── */

function formatOdds(odds: number): string {
  return odds > 0 ? `+${odds}` : `${odds}`;
}

function formatEv(n: number): string {
  return `${n > 0 ? "+" : ""}${(n * 100).toFixed(2)}%`;
}

function formatPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

/* ─── Composition ─── */

export function EdgeShareVideoComposition({
  leg,
  format = "square",
}: EdgeShareVideoProps) {
  const frame = useCurrentFrame();
  useVideoConfig();

  const isStory = format === "story";
  const W = isStory ? 1080 : 1080;
  const H = isStory ? 1920 : 1080;

  // Stagger timings (30fps): eyebrow → pick → odds → stats → CTA
  const eyebrowStart = 3; // ~0.1s
  const pickStart = 12; // ~0.4s
  const gameStart = 18; // ~0.6s
  const oddsStart = 27; // ~0.9s
  const evStart = 39; // ~1.3s
  const statsStart = 48; // ~1.6s
  const ctaStart = 60; // ~2s

  /* Fade-in helper: each element gets a 10-frame fade */
  const fadeIn = (start: number) =>
    interpolate(frame, [start, start + 10], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
  const riseIn = (start: number, distance = 18) =>
    interpolate(frame, [start, start + 14], [distance, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });

  const eyebrowOpacity = fadeIn(eyebrowStart);
  const pickOpacity = fadeIn(pickStart);
  const pickY = riseIn(pickStart, 20);
  const gameOpacity = fadeIn(gameStart);
  const oddsOpacity = fadeIn(oddsStart);
  const oddsScale = interpolate(
    frame,
    [oddsStart, oddsStart + 16],
    [0.85, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );
  const evOpacity = fadeIn(evStart);
  const evY = riseIn(evStart, 12);
  const statsOpacity = fadeIn(statsStart);
  const statsY = riseIn(statsStart, 12);
  const ctaOpacity = fadeIn(ctaStart);

  const ev = leg.evVsFair ?? 0;
  const evColor = ev >= 0.02 ? "#22c55e" : ev >= 0.01 ? "#eab308" : "#22c55e";

  /* Scale helpers — story and square have different paddings/sizes */
  const padding = isStory ? 80 : 70;
  const eyebrowSize = isStory ? 22 : 20;
  const pickSize = isStory ? 124 : 96;
  const gameSize = isStory ? 28 : 24;
  const oddsSize = isStory ? 260 : 200;
  const bookSize = isStory ? 26 : 22;
  const evSize = isStory ? 46 : 38;
  const statLabelSize = isStory ? 16 : 14;
  const statValueSize = isStory ? 44 : 36;
  const ctaSize = isStory ? 22 : 18;
  const logoSize = isStory ? 30 : 26;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#0a0a0a",
        fontFamily:
          "var(--font-geist-sans), system-ui, -apple-system, sans-serif",
        overflow: "hidden",
        width: W,
        height: H,
      }}
    >
      {/* Subtle red gradient glow top-right */}
      <div
        style={{
          position: "absolute",
          top: -W * 0.3,
          right: -W * 0.3,
          width: W * 0.8,
          height: W * 0.8,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(255,59,59,0.08) 0%, transparent 60%)",
          filter: "blur(40px)",
        }}
      />
      {/* Subtle glow bottom-left */}
      <div
        style={{
          position: "absolute",
          bottom: -W * 0.3,
          left: -W * 0.3,
          width: W * 0.7,
          height: W * 0.7,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(255,59,59,0.05) 0%, transparent 60%)",
          filter: "blur(40px)",
        }}
      />

      {/* Content container */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          padding,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
        }}
      >
        {/* ── TOP: Eyebrow + Pick + Game ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: isStory ? 20 : 16 }}>
          {/* Eyebrow */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              opacity: eyebrowOpacity,
            }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                backgroundColor: "#FF3B3B",
                boxShadow: "0 0 16px rgba(255,59,59,0.6)",
              }}
            />
            <span
              style={{
                fontSize: eyebrowSize,
                fontWeight: 600,
                letterSpacing: "0.28em",
                textTransform: "uppercase",
                color: "#FF3B3B",
                fontFamily:
                  "var(--font-geist-mono), ui-monospace, monospace",
              }}
            >
              Sharp Edge
            </span>
            <span
              style={{
                fontSize: eyebrowSize - 2,
                fontWeight: 500,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "rgba(255,255,255,0.35)",
                fontFamily:
                  "var(--font-geist-mono), ui-monospace, monospace",
                marginLeft: 8,
              }}
            >
              {leg.sport}
            </span>
          </div>

          {/* Giant serif headline: the pick */}
          <div
            style={{
              fontSize: pickSize,
              fontFamily: "'DM Serif Display', Georgia, serif",
              fontWeight: 400,
              letterSpacing: "-0.02em",
              lineHeight: 1.02,
              color: "#ededed",
              opacity: pickOpacity,
              transform: `translateY(${pickY}px)`,
              marginTop: isStory ? 12 : 6,
            }}
          >
            {leg.pick}
          </div>

          {/* Game subtitle */}
          <div
            style={{
              fontSize: gameSize,
              color: "rgba(255,255,255,0.45)",
              fontWeight: 400,
              letterSpacing: "0.01em",
              opacity: gameOpacity,
              marginTop: 4,
            }}
          >
            {leg.game}
            {leg.market ? (
              <span style={{ color: "rgba(255,255,255,0.25)" }}>
                {"  ·  "}
                {leg.market}
              </span>
            ) : null}
          </div>
        </div>

        {/* ── MIDDLE: Massive odds + book + EV ── */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: isStory ? 18 : 12,
            marginTop: isStory ? 40 : 20,
            marginBottom: isStory ? 40 : 20,
          }}
        >
          {/* Odds */}
          <div
            style={{
              fontSize: oddsSize,
              fontFamily:
                "var(--font-geist-mono), ui-monospace, 'SF Mono', monospace",
              fontWeight: 700,
              letterSpacing: "-0.04em",
              color: "#FF3B3B",
              lineHeight: 0.95,
              opacity: oddsOpacity,
              transform: `scale(${oddsScale})`,
              textShadow:
                "0 0 60px rgba(255,59,59,0.35), 0 8px 40px rgba(0,0,0,0.5)",
            }}
          >
            {formatOdds(leg.odds)}
          </div>

          {/* Book name */}
          <div
            style={{
              fontSize: bookSize,
              fontWeight: 500,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.55)",
              fontFamily:
                "var(--font-geist-mono), ui-monospace, monospace",
              opacity: oddsOpacity,
            }}
          >
            {leg.book}
          </div>

          {/* EV vs Fair */}
          <div
            style={{
              marginTop: isStory ? 18 : 10,
              display: "flex",
              alignItems: "baseline",
              gap: 12,
              opacity: evOpacity,
              transform: `translateY(${evY}px)`,
            }}
          >
            <span
              style={{
                fontSize: eyebrowSize - 2,
                fontWeight: 600,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "rgba(255,255,255,0.4)",
                fontFamily:
                  "var(--font-geist-mono), ui-monospace, monospace",
              }}
            >
              EV vs Fair
            </span>
            <span
              style={{
                fontSize: evSize,
                fontWeight: 700,
                fontFamily:
                  "var(--font-geist-mono), ui-monospace, 'SF Mono', monospace",
                color: evColor,
                letterSpacing: "-0.02em",
                textShadow: `0 0 30px ${evColor}40`,
              }}
            >
              {formatEv(ev)}
            </span>
          </div>
        </div>

        {/* ── STATS: Fair Prob vs Book Implied ── */}
        <div
          style={{
            display: "flex",
            gap: isStory ? 24 : 20,
            opacity: statsOpacity,
            transform: `translateY(${statsY}px)`,
          }}
        >
          <div
            style={{
              flex: 1,
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 16,
              padding: isStory ? "28px 32px" : "22px 26px",
            }}
          >
            <div
              style={{
                fontSize: statLabelSize,
                fontWeight: 600,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "rgba(255,255,255,0.4)",
                fontFamily:
                  "var(--font-geist-mono), ui-monospace, monospace",
                marginBottom: 10,
              }}
            >
              Fair Prob
            </div>
            <div
              style={{
                fontSize: statValueSize,
                fontFamily:
                  "var(--font-geist-mono), ui-monospace, 'SF Mono', monospace",
                fontWeight: 500,
                color: "#ededed",
                letterSpacing: "-0.01em",
              }}
            >
              {leg.fairProb !== undefined ? formatPct(leg.fairProb) : "—"}
            </div>
          </div>

          <div
            style={{
              flex: 1,
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 16,
              padding: isStory ? "28px 32px" : "22px 26px",
            }}
          >
            <div
              style={{
                fontSize: statLabelSize,
                fontWeight: 600,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "rgba(255,255,255,0.4)",
                fontFamily:
                  "var(--font-geist-mono), ui-monospace, monospace",
                marginBottom: 10,
              }}
            >
              Book Implied
            </div>
            <div
              style={{
                fontSize: statValueSize,
                fontFamily:
                  "var(--font-geist-mono), ui-monospace, 'SF Mono', monospace",
                fontWeight: 500,
                color: "rgba(255,255,255,0.55)",
                letterSpacing: "-0.01em",
              }}
            >
              {formatPct(leg.impliedProb)}
            </div>
          </div>
        </div>

        {/* ── BOTTOM: Logo + URL ── */}
        <div
          style={{
            marginTop: isStory ? 48 : 28,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            opacity: ctaOpacity,
            paddingTop: isStory ? 32 : 22,
            borderTop: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <div
            style={{
              fontSize: logoSize,
              fontWeight: 800,
              letterSpacing: "-0.02em",
              color: "#ededed",
            }}
          >
            Bay<span style={{ color: "#FF3B3B" }}>Parlays</span>
          </div>
          <div
            style={{
              fontSize: ctaSize,
              fontWeight: 500,
              letterSpacing: "0.1em",
              color: "rgba(255,255,255,0.45)",
              fontFamily:
                "var(--font-geist-mono), ui-monospace, monospace",
            }}
          >
            bayparlays.vercel.app
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
}
