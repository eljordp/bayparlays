"use client";

import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from "remotion";
import { Player } from "@remotion/player";

/* ─── Constants ─── */

const SPORTSBOOKS = [
  "DraftKings",
  "FanDuel",
  "BetMGM",
  "Caesars",
  "PointsBet",
  "BetRivers",
  "Hard Rock",
  "ESPNBet",
  "Bet365",
  "BetUS",
  "Bovada",
  "WynnBet",
];

const SAMPLE_ODDS = [
  { book: "DraftKings", odds: -110 },
  { book: "FanDuel", odds: -115 },
  { book: "BetMGM", odds: -105 },
  { book: "Caesars", odds: -120 },
  { book: "PointsBet", odds: +100 },
  { book: "BetRivers", odds: -108 },
  { book: "Hard Rock", odds: -112 },
  { book: "ESPNBet", odds: -110 },
  { book: "Bet365", odds: -103 },
  { book: "BetUS", odds: -115 },
  { book: "Bovada", odds: -110 },
  { book: "WynnBet", odds: -118 },
];

/* Best odds index (PointsBet at +100) */
const BEST_ODDS_INDEX = 4;

/* ─── Composition ─── */

export function HowItWorksComposition() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  /* ═══ ACT 1: "12 SPORTSBOOKS" + grid appear (frames 0-30) ═══ */

  const titleOpacity = interpolate(frame, [0, 8], [0, 1], {
    extrapolateRight: "clamp",
  });
  const titleScale = spring({
    frame,
    fps,
    config: { damping: 12, stiffness: 180, mass: 0.8 },
  });
  const titleFadeOut = interpolate(frame, [25, 30], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  /* ═══ ACT 2: Numbers flying, best odds highlighted (frames 30-60) ═══ */

  const scanTitleOpacity = interpolate(frame, [30, 36, 55, 60], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  /* ═══ ACT 3: "EDGE FOUND" + parlay card assembling (frames 60-90) ═══ */

  const edgeFoundOpacity = interpolate(frame, [60, 66], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const edgeFoundScale = spring({
    frame: frame - 60,
    fps,
    config: { damping: 8, stiffness: 200, mass: 0.6 },
  });

  const cardOpacity = interpolate(frame, [68, 74], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const cardSlideY = interpolate(frame, [68, 80], [40, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  /* ═══ ACT 4: "+EV" badge animating in (frames 90-120) ═══ */

  const evBadgeScale = spring({
    frame: frame - 92,
    fps,
    config: { damping: 6, stiffness: 220, mass: 1.0 },
  });
  const evBadgeOpacity = interpolate(frame, [92, 96], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const glowPulse = frame >= 95 ? 0.6 + 0.4 * Math.sin((frame - 95) * 0.15) : 0;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#0a0a0a",
        fontFamily: "system-ui, -apple-system, sans-serif",
        overflow: "hidden",
      }}
    >
      {/* Dot grid */}
      <AbsoluteFill
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(255,255,255,0.03) 1px, transparent 1px)",
          backgroundSize: "20px 20px",
        }}
      />

      {/* Vignette */}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.7) 100%)",
          pointerEvents: "none",
        }}
      />

      {/* ═══ ACT 1: Title + Sportsbook Grid ═══ */}
      {frame < 30 && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            opacity: titleFadeOut,
          }}
        >
          {/* "12 SPORTSBOOKS" */}
          <div
            style={{
              opacity: titleOpacity,
              transform: `scale(${titleScale})`,
              fontSize: 42,
              fontWeight: 900,
              letterSpacing: "0.15em",
              color: "#ededed",
              textTransform: "uppercase",
              marginBottom: 40,
              textAlign: "center",
            }}
          >
            <span style={{ color: "#FF3B3B", fontSize: 56 }}>12</span>{" "}
            Sportsbooks
          </div>

          {/* Grid of book names appearing one by one */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: 12,
              maxWidth: 700,
              padding: "0 40px",
            }}
          >
            {SPORTSBOOKS.map((book, i) => {
              const bookDelay = 3 + i * 1.5;
              const bookOpacity = interpolate(
                frame,
                [bookDelay, bookDelay + 4],
                [0, 1],
                { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
              );
              const bookScale = spring({
                frame: frame - bookDelay,
                fps,
                config: { damping: 14, stiffness: 200, mass: 0.4 },
              });

              return (
                <div
                  key={book}
                  style={{
                    opacity: bookOpacity,
                    transform: `scale(${bookScale})`,
                    backgroundColor: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 10,
                    padding: "12px 8px",
                    textAlign: "center",
                    fontSize: 13,
                    fontWeight: 600,
                    color: "rgba(255,255,255,0.6)",
                    letterSpacing: "0.02em",
                  }}
                >
                  {book}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══ ACT 2: Odds Comparison / Scanning ═══ */}
      {frame >= 30 && frame < 60 && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {/* "COMPARING ODDS" */}
          <div
            style={{
              opacity: scanTitleOpacity,
              fontSize: 20,
              fontWeight: 700,
              letterSpacing: "0.2em",
              color: "rgba(255,255,255,0.4)",
              textTransform: "uppercase",
              marginBottom: 30,
            }}
          >
            COMPARING ODDS
          </div>

          {/* Odds table */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              maxWidth: 500,
              width: "100%",
              padding: "0 60px",
            }}
          >
            {SAMPLE_ODDS.map((item, i) => {
              const rowDelay = 30 + i * 1.8;
              const rowOpacity = interpolate(
                frame,
                [rowDelay, rowDelay + 3],
                [0, 1],
                { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
              );

              // Highlight best odds at the right time
              const isHighlighted = i === BEST_ODDS_INDEX && frame >= 48;
              const highlightGlow = isHighlighted
                ? interpolate(frame, [48, 52], [0, 1], {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                  })
                : 0;

              return (
                <div
                  key={item.book}
                  style={{
                    opacity: rowOpacity,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "10px 16px",
                    backgroundColor: isHighlighted
                      ? `rgba(255,59,59,${0.12 * highlightGlow})`
                      : "rgba(255,255,255,0.02)",
                    border: `1px solid ${
                      isHighlighted
                        ? `rgba(255,59,59,${0.4 * highlightGlow})`
                        : "rgba(255,255,255,0.04)"
                    }`,
                    borderRadius: 8,
                    transition: "all 0.3s",
                  }}
                >
                  <span
                    style={{
                      fontSize: 13,
                      color: isHighlighted
                        ? "rgba(255,255,255,0.9)"
                        : "rgba(255,255,255,0.4)",
                      fontWeight: isHighlighted ? 700 : 400,
                    }}
                  >
                    {item.book}
                  </span>
                  <span
                    style={{
                      fontSize: 16,
                      fontFamily: "monospace",
                      fontWeight: 700,
                      color: isHighlighted ? "#FF3B3B" : "rgba(255,255,255,0.5)",
                    }}
                  >
                    {item.odds > 0 ? `+${item.odds}` : item.odds}
                  </span>
                </div>
              );
            })}
          </div>

          {/* "BEST LINE" indicator */}
          {frame >= 50 && (
            <div
              style={{
                marginTop: 20,
                opacity: interpolate(frame, [50, 54], [0, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                }),
                fontSize: 12,
                fontWeight: 800,
                letterSpacing: "0.15em",
                color: "#FF3B3B",
                textTransform: "uppercase",
              }}
            >
              BEST LINE FOUND: PointsBet +100
            </div>
          )}
        </div>
      )}

      {/* ═══ ACT 3: EDGE FOUND + Parlay Card ═══ */}
      {frame >= 60 && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {/* "EDGE FOUND" */}
          <div
            style={{
              opacity: edgeFoundOpacity,
              transform: `scale(${edgeFoundScale})`,
              fontSize: 36,
              fontWeight: 900,
              letterSpacing: "0.18em",
              color: "#FF3B3B",
              textTransform: "uppercase",
              marginBottom: 30,
              textShadow: "0 0 30px rgba(255,59,59,0.3)",
            }}
          >
            EDGE FOUND
          </div>

          {/* Parlay card assembling */}
          <div
            style={{
              opacity: cardOpacity,
              transform: `translateY(${cardSlideY}px)`,
              backgroundColor: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 16,
              padding: "24px 28px",
              maxWidth: 460,
              width: "100%",
            }}
          >
            {/* Parlay legs */}
            {[
              { sport: "NBA", pick: "Celtics ML", odds: "+100", game: "PHI @ BOS" },
              { sport: "MLB", pick: "Dodgers -1.5", odds: "+110", game: "LAD @ COL" },
              { sport: "NHL", pick: "Over 5.5", odds: "+105", game: "STL @ UTA" },
            ].map((leg, i) => {
              const legDelay = 72 + i * 5;
              const legOpacity = interpolate(
                frame,
                [legDelay, legDelay + 4],
                [0, 1],
                { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
              );
              const legSlideX = interpolate(
                frame,
                [legDelay, legDelay + 6],
                [30, 0],
                { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
              );

              return (
                <div
                  key={i}
                  style={{
                    opacity: legOpacity,
                    transform: `translateX(${legSlideX}px)`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "10px 0",
                    borderBottom:
                      i < 2 ? "1px solid rgba(255,255,255,0.05)" : "none",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 800,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                        color: "#FFFFFF",
                        backgroundColor: "#FF3B3B",
                        padding: "4px 10px",
                        borderRadius: 5,
                        fontFamily: "monospace",
                      }}
                    >
                      {leg.sport}
                    </span>
                    <div>
                      <div
                        style={{
                          fontSize: 15,
                          fontWeight: 600,
                          color: "rgba(255,255,255,0.85)",
                        }}
                      >
                        {leg.pick}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: "rgba(255,255,255,0.3)",
                        }}
                      >
                        {leg.game}
                      </div>
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: 17,
                      fontWeight: 700,
                      color: "#FF3B3B",
                      fontFamily: "monospace",
                    }}
                  >
                    {leg.odds}
                  </span>
                </div>
              );
            })}
          </div>

          {/* ═══ ACT 4: +EV Badge ═══ */}
          {frame >= 92 && (
            <div
              style={{
                marginTop: 24,
                opacity: evBadgeOpacity,
                transform: `scale(${evBadgeScale})`,
                display: "flex",
                alignItems: "center",
                gap: 12,
              }}
            >
              <div
                style={{
                  backgroundColor: "rgba(34,197,94,0.12)",
                  border: "1px solid rgba(34,197,94,0.3)",
                  borderRadius: 12,
                  padding: "12px 24px",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  boxShadow: `0 0 ${30 * glowPulse}px rgba(34,197,94,${0.15 * glowPulse})`,
                }}
              >
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 800,
                    letterSpacing: "0.12em",
                    color: "#22C55E",
                    textTransform: "uppercase",
                  }}
                >
                  +EV
                </span>
                <span
                  style={{
                    fontSize: 28,
                    fontWeight: 900,
                    fontFamily: "monospace",
                    color: "#22C55E",
                  }}
                >
                  +7.2%
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── Watermark ─── */}
      <div
        style={{
          position: "absolute",
          bottom: 20,
          left: 0,
          right: 0,
          textAlign: "center",
          opacity: interpolate(frame, [100, 110], [0, 0.15], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        <span
          style={{
            fontSize: 12,
            fontWeight: 500,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,1)",
          }}
        >
          BayParlays.com
        </span>
      </div>
    </AbsoluteFill>
  );
}

/* ─── Player Wrapper ─── */

export function HowItWorksPlayer() {
  return (
    <Player
      component={HowItWorksComposition}
      inputProps={{}}
      durationInFrames={120}
      fps={30}
      compositionWidth={1080}
      compositionHeight={1080}
      style={{
        width: "100%",
        maxWidth: 600,
        borderRadius: 12,
        overflow: "hidden",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
      controls={false}
      autoPlay
      loop
    />
  );
}
