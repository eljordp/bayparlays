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

const W = 720;
const H = 720;

const BOOKS = ["DK", "FD", "MGM", "CZR", "BR", "ESPN"];

const ODDS_DATA = [
  { book: "DK", odds: "-110" },
  { book: "FD", odds: "-115" },
  { book: "MGM", odds: "-105" },
  { book: "CZR", odds: "-120" },
  { book: "BR", odds: "+100" },
  { book: "ESPN", odds: "-108" },
];

const BEST_INDEX = 4; // BR +100

const PARLAY_LEGS = [
  { sport: "NBA", pick: "Celtics ML", odds: "+100" },
  { sport: "MLB", pick: "Dodgers -1.5", odds: "+110" },
  { sport: "NHL", pick: "Over 5.5", odds: "+105" },
];

/* ─── Composition ─── */

export function HowItWorksComposition() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const cx = W / 2;

  /* ═══════════════════════════════════════════════════
     ACT 1: THE SCAN (frames 0-40)
     ═══════════════════════════════════════════════════ */

  // Red pulse line sweeping top to bottom (frame 0-5)
  const scanLineY = interpolate(frame, [0, 5], [0, H], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const scanLineOpacity = interpolate(frame, [0, 1, 3, 5], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // "SCANNING" text (frame 5-15)
  const scanningOpacity = interpolate(frame, [5, 8, 30, 35], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const scanningGlow = 0.4 + 0.6 * Math.sin(frame * 0.3);

  // "12 SPORTSBOOKS" subtitle
  const subtitleOpacity = interpolate(frame, [8, 12, 30, 35], [0, 0.5, 0.5, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Sync flash (frame 35-37)
  const syncFlash = interpolate(frame, [35, 36, 37, 38], [0, 1, 0.5, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Entire Act 1 fade out
  const act1Fade = interpolate(frame, [35, 40], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  /* ═══════════════════════════════════════════════════
     ACT 2: THE COMPARE (frames 40-85)
     ═══════════════════════════════════════════════════ */

  // "COMPARING LINES" slam
  const compareTitleScale = spring({
    frame: frame - 40,
    fps,
    config: { damping: 8, stiffness: 220, mass: 1.0 },
  });
  const compareTitleOpacity = interpolate(frame, [40, 42, 70, 75], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Red zip line (frame 75-85)
  const zipLineWidth = interpolate(frame, [75, 80], [0, W], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const zipLineOpacity = interpolate(frame, [75, 77, 82, 85], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Act 2 fade
  const act2Fade = interpolate(frame, [78, 85], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  /* ═══════════════════════════════════════════════════
     ACT 3: THE EDGE (frames 85-150)
     ═══════════════════════════════════════════════════ */

  // Screen flash (frame 85-88)
  const edgeFlash = interpolate(frame, [85, 86, 87, 88], [0, 0.8, 0.3, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // "EDGE FOUND" slam
  const edgeScale = spring({
    frame: frame - 85,
    fps,
    config: { damping: 6, stiffness: 180, mass: 1.4 },
  });
  const edgeFinalScale = frame < 85 ? 0 : interpolate(edgeScale, [0, 1], [2.5, 1]);
  const edgeOpacity = interpolate(frame, [85, 88], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Combined odds slam (frame 110-120)
  const combinedOddsSpring = spring({
    frame: frame - 110,
    fps,
    config: { damping: 6, stiffness: 160, mass: 1.4 },
  });
  const combinedScale = frame < 110 ? 0 : interpolate(combinedOddsSpring, [0, 1], [2.5, 1]);
  const combinedOpacity = interpolate(frame, [110, 113], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // +EV badge (frame 120-135)
  const evSpring = spring({
    frame: frame - 120,
    fps,
    config: { damping: 6, stiffness: 200, mass: 1.0 },
  });
  const evScale = frame < 120 ? 0 : interpolate(evSpring, [0, 1], [0, 1]);
  const evOpacity = interpolate(frame, [120, 124], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const evGlow = frame >= 124 ? 0.5 + 0.5 * Math.sin((frame - 124) * 0.2) : 0;

  // Watermark (frame 135-150)
  const watermarkOpacity = interpolate(frame, [135, 145], [0, 0.5], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#0a0a0a",
        fontFamily: "system-ui, -apple-system, sans-serif",
        overflow: "hidden",
        width: W,
        height: H,
      }}
    >
      {/* ═══ ACT 1: THE SCAN ═══ */}

      {/* Red scanner pulse line — horizontal, sweeping top to bottom */}
      {frame < 6 && (
        <div
          style={{
            position: "absolute",
            left: 0,
            top: scanLineY - 2,
            width: W,
            height: 4,
            background:
              "linear-gradient(90deg, transparent 5%, #FF3B3B 20%, #FF3B3B 80%, transparent 95%)",
            opacity: scanLineOpacity,
            boxShadow: "0 0 40px #FF3B3B, 0 0 80px rgba(255,59,59,0.4)",
          }}
        />
      )}

      {/* Act 1 content */}
      {frame < 40 && (
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
            opacity: act1Fade,
          }}
        >
          {/* "SCANNING" */}
          <div
            style={{
              opacity: scanningOpacity,
              fontSize: 60,
              fontWeight: 900,
              letterSpacing: "0.2em",
              color: "#FF3B3B",
              textTransform: "uppercase",
              textShadow: `0 0 ${30 + scanningGlow * 20}px rgba(255,59,59,${0.3 + scanningGlow * 0.3})`,
              marginBottom: 12,
            }}
          >
            SCANNING
          </div>

          {/* "12 SPORTSBOOKS" */}
          <div
            style={{
              opacity: subtitleOpacity,
              fontSize: 24,
              fontWeight: 500,
              letterSpacing: "0.15em",
              color: "rgba(255,255,255,0.4)",
              textTransform: "uppercase",
              marginBottom: 50,
            }}
          >
            12 SPORTSBOOKS
          </div>

          {/* 2x3 grid of book tiles lighting up */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 14,
              width: 380,
            }}
          >
            {BOOKS.map((book, i) => {
              const lightUpFrame = 15 + i * 3;
              const isLit = frame >= lightUpFrame;

              // Bright flash then settle
              const flashBright = isLit
                ? interpolate(
                    frame,
                    [lightUpFrame, lightUpFrame + 2, lightUpFrame + 6],
                    [1, 0.9, 0],
                    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
                  )
                : 0;

              const settledOpacity = isLit
                ? interpolate(frame, [lightUpFrame, lightUpFrame + 3], [0, 1], {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                  })
                : 0.15;

              // Sync flash at frame 35
              const syncBright = syncFlash;

              return (
                <div
                  key={book}
                  style={{
                    opacity: settledOpacity,
                    padding: "16px 0",
                    borderRadius: 10,
                    textAlign: "center",
                    fontSize: 22,
                    fontWeight: 800,
                    fontFamily: "monospace",
                    letterSpacing: "0.05em",
                    color: isLit
                      ? flashBright > 0.3
                        ? "#FFFFFF"
                        : "rgba(255,255,255,0.7)"
                      : "rgba(255,255,255,0.2)",
                    backgroundColor:
                      flashBright > 0.3
                        ? `rgba(255,255,255,${0.15 * flashBright})`
                        : isLit && syncBright > 0.2
                          ? `rgba(255,59,59,${0.15 * syncBright})`
                          : "rgba(255,255,255,0.03)",
                    border: `1.5px solid ${
                      flashBright > 0.3
                        ? `rgba(255,255,255,${0.6 * flashBright})`
                        : isLit
                          ? `rgba(255,59,59,${0.25 + syncBright * 0.4})`
                          : "rgba(255,255,255,0.06)"
                    }`,
                    boxShadow:
                      flashBright > 0.3
                        ? `0 0 30px rgba(255,255,255,${0.4 * flashBright})`
                        : isLit && syncBright > 0.2
                          ? `0 0 20px rgba(255,59,59,${0.3 * syncBright})`
                          : "none",
                  }}
                >
                  {book}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══ ACT 2: THE COMPARE ═══ */}

      {frame >= 40 && frame < 85 && (
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
            opacity: act2Fade,
          }}
        >
          {/* "COMPARING LINES" */}
          <div
            style={{
              opacity: compareTitleOpacity,
              transform: `scale(${frame < 40 ? 0 : compareTitleScale})`,
              fontSize: 48,
              fontWeight: 900,
              letterSpacing: "0.15em",
              color: "#ededed",
              textTransform: "uppercase",
              marginBottom: 40,
              textShadow: "0 0 30px rgba(255,59,59,0.2)",
            }}
          >
            COMPARING LINES
          </div>

          {/* Game header */}
          <div
            style={{
              opacity: interpolate(frame, [44, 46], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
              fontSize: 28,
              fontWeight: 700,
              color: "rgba(255,255,255,0.8)",
              marginBottom: 28,
              letterSpacing: "0.08em",
            }}
          >
            BOS <span style={{ color: "rgba(255,255,255,0.25)", margin: "0 8px" }}>vs</span> PHI
          </div>

          {/* 3x2 grid of odds cards */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 12,
              width: 420,
            }}
          >
            {ODDS_DATA.map((item, i) => {
              const cardFrame = 45 + i * 2;
              const isVisible = frame >= cardFrame;
              const isBest = i === BEST_INDEX && frame >= 65;

              const cardOpacity = isVisible
                ? interpolate(frame, [cardFrame, cardFrame + 2], [0, 1], {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                  })
                : 0;

              // Dim non-best cards after frame 65
              const dimmed = frame >= 65 && i !== BEST_INDEX;
              const finalOpacity = dimmed ? cardOpacity * 0.3 : cardOpacity;

              // Best card glow
              const bestGlow = isBest
                ? interpolate(frame, [65, 68], [0, 1], {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                  })
                : 0;

              // Flash on best card
              const bestFlash = isBest
                ? interpolate(frame, [65, 66, 68], [1, 0.6, 0], {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                  })
                : 0;

              return (
                <div
                  key={item.book}
                  style={{
                    opacity: finalOpacity,
                    padding: "18px 12px",
                    borderRadius: 12,
                    textAlign: "center",
                    backgroundColor: isBest
                      ? `rgba(255,59,59,${0.12 + bestFlash * 0.3})`
                      : "rgba(255,255,255,0.03)",
                    border: `2px solid ${
                      isBest
                        ? `rgba(255,59,59,${0.5 + bestGlow * 0.5})`
                        : "rgba(255,255,255,0.06)"
                    }`,
                    boxShadow: isBest
                      ? `0 0 ${20 + bestGlow * 30}px rgba(255,59,59,${0.2 + bestGlow * 0.3})`
                      : "none",
                  }}
                >
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: isBest ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.35)",
                      marginBottom: 6,
                      letterSpacing: "0.05em",
                    }}
                  >
                    {item.book}
                  </div>
                  <div
                    style={{
                      fontSize: 28,
                      fontWeight: 900,
                      fontFamily: "monospace",
                      color: isBest ? "#FF3B3B" : "rgba(255,255,255,0.4)",
                    }}
                  >
                    {item.odds}
                  </div>
                </div>
              );
            })}
          </div>

          {/* "BEST: BetRivers +100" */}
          {frame >= 68 && (
            <div
              style={{
                marginTop: 24,
                opacity: interpolate(frame, [68, 72], [0, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                }),
                fontSize: 20,
                fontWeight: 800,
                fontFamily: "monospace",
                color: "#FF3B3B",
                letterSpacing: "0.08em",
                textShadow: "0 0 20px rgba(255,59,59,0.3)",
              }}
            >
              BEST: BetRivers +100
            </div>
          )}
        </div>
      )}

      {/* Red zip line (frame 75-85) */}
      {frame >= 75 && frame < 86 && (
        <div
          style={{
            position: "absolute",
            left: cx - zipLineWidth / 2,
            top: H / 2 - 1.5,
            width: zipLineWidth,
            height: 3,
            background: "linear-gradient(90deg, transparent, #FF3B3B, transparent)",
            opacity: zipLineOpacity,
            boxShadow: "0 0 30px rgba(255,59,59,0.5)",
            zIndex: 5,
          }}
        />
      )}

      {/* ═══ ACT 3: THE EDGE ═══ */}

      {/* Red/white flash */}
      {frame >= 85 && frame < 89 && (
        <AbsoluteFill
          style={{
            backgroundColor: "#FF3B3B",
            opacity: edgeFlash,
            zIndex: 10,
          }}
        />
      )}

      {frame >= 85 && (
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
            justifyContent: "flex-start",
            paddingTop: 50,
          }}
        >
          {/* "EDGE FOUND" */}
          <div
            style={{
              opacity: edgeOpacity,
              transform: `scale(${edgeFinalScale})`,
              fontSize: 56,
              fontWeight: 900,
              letterSpacing: "0.2em",
              color: "#FF3B3B",
              textTransform: "uppercase",
              textShadow:
                "0 0 40px rgba(255,59,59,0.5), 0 0 80px rgba(255,59,59,0.2)",
              marginBottom: 32,
            }}
          >
            EDGE FOUND
          </div>

          {/* Parlay card legs */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 10,
              width: 580,
              paddingLeft: 40,
              paddingRight: 40,
            }}
          >
            {PARLAY_LEGS.map((leg, i) => {
              const legStart = 90 + i * 6;

              const legSpring = spring({
                frame: frame - legStart,
                fps,
                config: { damping: 10, stiffness: 180, mass: 0.8 },
              });
              const slideX = frame < legStart ? 400 : interpolate(legSpring, [0, 1], [400, 0]);
              const legOpacity = interpolate(frame, [legStart, legStart + 4], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              });

              return (
                <div
                  key={i}
                  style={{
                    opacity: legOpacity,
                    transform: `translateX(${slideX}px)`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    backgroundColor: "rgba(255,255,255,0.03)",
                    borderLeft: "4px solid #FF3B3B",
                    borderRadius: 8,
                    padding: "14px 20px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    {/* Sport badge */}
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 800,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                        color: "#FFFFFF",
                        backgroundColor: "#FF3B3B",
                        padding: "5px 14px",
                        borderRadius: 6,
                        fontFamily: "monospace",
                      }}
                    >
                      {leg.sport}
                    </div>
                    {/* Pick */}
                    <span
                      style={{
                        fontSize: 22,
                        fontWeight: 700,
                        color: "rgba(255,255,255,0.9)",
                      }}
                    >
                      {leg.pick}
                    </span>
                  </div>
                  {/* Odds */}
                  <span
                    style={{
                      fontSize: 24,
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

          {/* Combined odds slam */}
          {frame >= 110 && (
            <div
              style={{
                marginTop: 28,
                opacity: combinedOpacity,
                transform: `scale(${combinedScale})`,
                fontSize: 72,
                fontWeight: 900,
                fontFamily: "monospace",
                color: "#FF3B3B",
                letterSpacing: "-0.02em",
                lineHeight: 1,
                textShadow:
                  "0 0 40px rgba(255,59,59,0.4), 0 4px 20px rgba(0,0,0,0.5)",
              }}
            >
              +487
            </div>
          )}

          {/* +EV badge */}
          {frame >= 120 && (
            <div
              style={{
                marginTop: 20,
                opacity: evOpacity,
                transform: `scale(${evScale})`,
              }}
            >
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 10,
                  backgroundColor: "rgba(34,197,94,0.12)",
                  border: "1.5px solid rgba(34,197,94,0.4)",
                  borderRadius: 12,
                  padding: "12px 28px",
                  boxShadow: `0 0 ${20 + evGlow * 30}px rgba(34,197,94,${0.15 + evGlow * 0.25})`,
                }}
              >
                <span
                  style={{
                    fontSize: 18,
                    fontWeight: 900,
                    letterSpacing: "0.12em",
                    color: "#22C55E",
                    textTransform: "uppercase",
                  }}
                >
                  +EV
                </span>
                <span
                  style={{
                    fontSize: 32,
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

      {/* Watermark */}
      {frame >= 135 && (
        <div
          style={{
            position: "absolute",
            bottom: 30,
            left: 0,
            right: 0,
            textAlign: "center",
            opacity: watermarkOpacity,
            zIndex: 15,
          }}
        >
          <span
            style={{
              fontSize: 18,
              fontWeight: 600,
              letterSpacing: "0.25em",
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.25)",
            }}
          >
            BayParlays.com
          </span>
        </div>
      )}
    </AbsoluteFill>
  );
}

/* ─── Player Wrapper ─── */

export function HowItWorksPlayer() {
  return (
    <Player
      component={HowItWorksComposition}
      inputProps={{}}
      durationInFrames={150}
      fps={30}
      compositionWidth={720}
      compositionHeight={720}
      style={{
        width: "100%",
        maxWidth: 560,
        borderRadius: 12,
        overflow: "hidden",
        border: "1px solid rgba(255,255,255,0.08)",
        boxShadow: "0 0 60px rgba(255,59,59,0.08)",
      }}
      controls={false}
      autoPlay
      loop
    />
  );
}
