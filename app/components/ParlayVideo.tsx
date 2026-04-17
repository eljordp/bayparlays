"use client";

import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from "remotion";

/* ─── Types ─── */

export interface ParlayLeg {
  sport: string;
  pick: string;
  odds: number;
  book: string;
  game: string;
}

export interface ParlayVideoProps {
  legs: ParlayLeg[];
  combinedOdds: string;
  evPercent: number;
  confidence: number;
  payout: number;
  format?: "square" | "story";
}

/* ─── Helpers ─── */

function formatOdds(odds: number): string {
  return odds > 0 ? `+${odds}` : `${odds}`;
}

const SPORTSBOOKS = [
  "DraftKings",
  "FanDuel",
  "BetMGM",
  "Caesars",
  "PointsBet",
  "BetRivers",
  "Hard Rock",
  "ESPNBet",
];

const FLOATING_ODDS = [
  "-110",
  "+150",
  "-130",
  "+220",
  "-105",
  "+180",
  "-145",
  "+310",
  "-115",
  "+165",
  "-125",
  "+240",
  "-140",
  "+195",
  "-108",
  "+275",
  "-120",
  "+155",
  "-135",
  "+200",
];

/* Seeded pseudo-random for deterministic animations */
function seededRandom(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 49297;
  return x - Math.floor(x);
}

/* ─── Particle component for celebration ─── */
function CelebrationParticle({
  index,
  frame,
  startFrame,
  centerX,
  centerY,
}: {
  index: number;
  frame: number;
  startFrame: number;
  centerX: number;
  centerY: number;
}) {
  const elapsed = frame - startFrame;
  if (elapsed < 0) return null;

  const angle = (index / 8) * Math.PI * 2 + seededRandom(index * 7) * 0.8;
  const speed = 3 + seededRandom(index * 13) * 4;
  const size = 4 + seededRandom(index * 19) * 6;

  const progress = interpolate(elapsed, [0, 50], [0, 1], {
    extrapolateRight: "clamp",
  });

  const x = centerX + Math.cos(angle) * speed * progress * 80;
  const y = centerY + Math.sin(angle) * speed * progress * 80 + progress * progress * 40;
  const opacity = interpolate(elapsed, [0, 10, 40, 50], [0, 1, 0.6, 0], {
    extrapolateRight: "clamp",
  });
  const scale = interpolate(elapsed, [0, 8, 50], [0.2, 1, 0.3], {
    extrapolateRight: "clamp",
  });

  const colors = ["#22C55E", "#4ADE80", "#86EFAC", "#FFFFFF", "#FF3B3B"];
  const color = colors[index % colors.length];

  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: size,
        height: size,
        borderRadius: "50%",
        backgroundColor: color,
        opacity,
        transform: `scale(${scale})`,
        boxShadow: `0 0 ${size * 2}px ${color}40`,
      }}
    />
  );
}

/* ─── Floating odds column ─── */
function FloatingOddsColumn({
  columnIndex,
  frame,
  canvasHeight,
  totalColumns,
}: {
  columnIndex: number;
  frame: number;
  canvasHeight: number;
  totalColumns: number;
}) {
  const columnOpacity = interpolate(frame, [0, 5, 35, 42], [0, 0.25, 0.25, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const columnWidth = 1080 / totalColumns;
  const x = columnIndex * columnWidth + columnWidth * 0.3;

  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: 0,
        bottom: 0,
        opacity: columnOpacity,
        overflow: "hidden",
        width: columnWidth,
      }}
    >
      {Array.from({ length: 8 }).map((_, rowIdx) => {
        const seed = columnIndex * 100 + rowIdx;
        const speed = 1.5 + seededRandom(seed) * 2.5;
        const startY = -60 + seededRandom(seed + 1) * 200 - 100;
        const yPos = startY + frame * speed * 3;
        const wrappedY = ((yPos % (canvasHeight + 100)) + canvasHeight + 100) % (canvasHeight + 100) - 50;
        const oddsText = FLOATING_ODDS[(columnIndex * 8 + rowIdx) % FLOATING_ODDS.length];

        return (
          <div
            key={rowIdx}
            style={{
              position: "absolute",
              left: seededRandom(seed + 2) * (columnWidth * 0.4),
              top: wrappedY,
              fontSize: 14,
              fontFamily: "monospace",
              color: "rgba(255,59,59,0.15)",
              whiteSpace: "nowrap",
              userSelect: "none",
            }}
          >
            {oddsText}
          </div>
        );
      })}
    </div>
  );
}

/* ─── Composition ─── */

export function ParlayVideoComposition({
  legs,
  combinedOdds,
  payout,
  format = "square",
}: ParlayVideoProps) {
  const frame = useCurrentFrame();
  const { fps, height } = useVideoConfig();

  const isStory = format === "story" || height > 1200;
  const canvasSize = isStory ? 1920 : 1080;

  /* ═══════════════════════════════════════════
     ACT 1: THE SCAN (frames 0-40)
     ═══════════════════════════════════════════ */

  // Logo fade
  const logoOpacity = interpolate(frame, [0, 15], [0, 1], {
    extrapolateRight: "clamp",
  });

  // "SCANNING ODDS" pulse
  const scanningOpacity = interpolate(frame, [3, 12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const scanningPulse =
    frame < 40
      ? 0.7 + 0.3 * Math.sin(frame * 0.3)
      : interpolate(frame, [40, 48], [1, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });

  // Sportsbook cycling text
  const bookCycleIndex = Math.floor(frame * 0.8) % SPORTSBOOKS.length;
  const currentBook = frame < 42 ? SPORTSBOOKS[bookCycleIndex] : "";

  // Progress bar
  const progressWidth = interpolate(frame, [5, 38], [0, 100], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const progressOpacity = interpolate(frame, [3, 8, 38, 44], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  /* ═══════════════════════════════════════════
     ACT 2: THE PICK (frames 40-90)
     ═══════════════════════════════════════════ */

  // "PARLAY LOCKED" text
  const lockedOpacity = interpolate(frame, [40, 48], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const lockedScale = spring({
    frame: frame - 40,
    fps,
    config: { damping: 12, stiffness: 200, mass: 0.6 },
  });

  // Divider line
  const dividerWidth = interpolate(frame, [72, 82], [0, 100], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Combined odds slam
  const combinedOddsDelay = 50 + legs.length * 12 + 6;
  const combinedOddsScale = spring({
    frame: frame - combinedOddsDelay,
    fps,
    config: { damping: 6, stiffness: 180, mass: 1.2 },
  });
  const combinedOddsOpacity = interpolate(
    frame,
    [combinedOddsDelay, combinedOddsDelay + 6],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  // Bet text
  const betTextOpacity = interpolate(
    frame,
    [combinedOddsDelay + 8, combinedOddsDelay + 16],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  /* ═══════════════════════════════════════════
     ACT 3: THE WIN (frames 90-150)
     ═══════════════════════════════════════════ */

  // Card green glow
  const glowOpacity = interpolate(frame, [100, 115], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Payout counter
  const payoutProgress = interpolate(frame, [122, 140], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const displayPayout = Math.round(payout * payoutProgress);

  // Watermark
  const watermarkOpacity = interpolate(frame, [135, 148], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  /* ─── Layout values ─── */
  const paddingX = isStory ? 70 : 60;
  const topArea = isStory ? 220 : 100;
  const centerY = canvasSize / 2;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#0a0a0a",
        fontFamily: "system-ui, -apple-system, sans-serif",
        overflow: "hidden",
      }}
    >
      {/* ─── Dot grid background ─── */}
      <AbsoluteFill
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(255,255,255,0.04) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />

      {/* ─── ACT 1: Floating odds columns ─── */}
      {Array.from({ length: 10 }).map((_, i) => (
        <FloatingOddsColumn
          key={i}
          columnIndex={i}
          frame={frame}
          canvasHeight={canvasSize}
          totalColumns={10}
        />
      ))}

      {/* ─── Subtle vignette ─── */}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.6) 100%)",
          pointerEvents: "none",
        }}
      />

      {/* ─── Logo (top-left, persists) ─── */}
      <div
        style={{
          position: "absolute",
          top: isStory ? 80 : 40,
          left: paddingX,
          opacity: logoOpacity,
        }}
      >
        <span
          style={{
            fontSize: isStory ? 48 : 40,
            fontWeight: 900,
            letterSpacing: "-0.02em",
            color: "#ededed",
          }}
        >
          Bay
          <span style={{ color: "#FF3B3B" }}>Parlays</span>
        </span>
      </div>

      {/* ═══ ACT 1: SCANNING ═══ */}
      {frame < 50 && (
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
          {/* "SCANNING ODDS" */}
          <div
            style={{
              opacity: scanningOpacity * scanningPulse,
              fontSize: isStory ? 56 : 48,
              fontWeight: 900,
              letterSpacing: "0.2em",
              color: "#FF3B3B",
              textTransform: "uppercase",
              marginBottom: 24,
            }}
          >
            SCANNING ODDS
          </div>

          {/* Cycling sportsbook name */}
          <div
            style={{
              opacity: scanningOpacity * (frame < 40 ? 1 : interpolate(frame, [40, 46], [1, 0], { extrapolateRight: "clamp" })),
              fontSize: isStory ? 24 : 20,
              fontFamily: "monospace",
              color: "rgba(255,255,255,0.5)",
              letterSpacing: "0.05em",
              height: 30,
              overflow: "hidden",
            }}
          >
            {currentBook}
          </div>

          {/* Progress bar */}
          <div
            style={{
              position: "absolute",
              bottom: isStory ? centerY - 140 : centerY + 80,
              left: paddingX + 40,
              right: paddingX + 40,
              opacity: progressOpacity,
            }}
          >
            <div
              style={{
                height: 3,
                backgroundColor: "rgba(255,255,255,0.06)",
                borderRadius: 2,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${progressWidth}%`,
                  background:
                    "linear-gradient(90deg, #FF3B3B 0%, #FF5252 60%, rgba(255,82,82,0.4) 100%)",
                  borderRadius: 2,
                  boxShadow: "0 0 12px rgba(255,59,59,0.3)",
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* ═══ ACT 2: THE PICK ═══ */}
      {frame >= 40 && (
        <div
          style={{
            position: "absolute",
            top: topArea,
            left: paddingX,
            right: paddingX,
            bottom: isStory ? 200 : 100,
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* "PARLAY LOCKED" header */}
          <div
            style={{
              opacity: lockedOpacity,
              transform: `scale(${lockedScale})`,
              transformOrigin: "left center",
              marginBottom: isStory ? 50 : 36,
              display: "flex",
              alignItems: "center",
              gap: 14,
            }}
          >
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                backgroundColor: frame >= 100 ? "#22C55E" : "#FF3B3B",
                boxShadow: `0 0 16px ${frame >= 100 ? "rgba(34,197,94,0.5)" : "rgba(255,59,59,0.4)"}`,
                transition: "background-color 0.3s",
              }}
            />
            <span
              style={{
                fontSize: isStory ? 18 : 15,
                fontWeight: 700,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: frame >= 100 ? "#22C55E" : "rgba(255,59,59,0.8)",
              }}
            >
              {frame >= 118 ? "WINNER" : "PARLAY LOCKED"}
            </span>
            <span
              style={{
                fontSize: isStory ? 14 : 12,
                color: "rgba(255,255,255,0.2)",
                fontFamily: "monospace",
              }}
            >
              {legs.length}-LEG
            </span>
          </div>

          {/* ─── Leg cards ─── */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: isStory ? 14 : 10,
            }}
          >
            {legs.map((leg, i) => {
              const legStartFrame = 48 + i * 12;

              // Slide in from right
              const slideX = interpolate(
                frame,
                [legStartFrame, legStartFrame + 14],
                [120, 0],
                { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
              );
              const legOpacity = interpolate(
                frame,
                [legStartFrame, legStartFrame + 10],
                [0, 1],
                { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
              );

              // Checkmark pop (Act 3)
              const checkStartFrame = 102 + i * 6;
              const checkScale = spring({
                frame: frame - checkStartFrame,
                fps,
                config: { damping: 8, stiffness: 200, mass: 0.5 },
              });
              const checkOpacity = interpolate(
                frame,
                [checkStartFrame, checkStartFrame + 4],
                [0, 1],
                { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
              );

              // Green border glow on win
              const legGlow = interpolate(
                frame,
                [checkStartFrame, checkStartFrame + 10],
                [0, 1],
                { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
              );

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
                    border: `1px solid ${legGlow > 0 ? `rgba(34,197,94,${0.15 * legGlow})` : "rgba(255,255,255,0.06)"}`,
                    borderRadius: 14,
                    padding: isStory ? "20px 24px" : "16px 20px",
                    position: "relative",
                    overflow: "hidden",
                  }}
                >
                  {/* Green shimmer on win */}
                  {legGlow > 0 && (
                    <div
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        background: `linear-gradient(135deg, rgba(34,197,94,${0.03 * legGlow}), transparent 60%)`,
                        pointerEvents: "none",
                      }}
                    />
                  )}

                  {/* Left: badge + pick */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 14,
                      flex: 1,
                      minWidth: 0,
                      position: "relative",
                    }}
                  >
                    {/* Checkmark */}
                    {frame >= checkStartFrame && (
                      <div
                        style={{
                          opacity: checkOpacity,
                          transform: `scale(${checkScale})`,
                          width: isStory ? 28 : 24,
                          height: isStory ? 28 : 24,
                          borderRadius: "50%",
                          backgroundColor: "#22C55E",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                          boxShadow: "0 0 12px rgba(34,197,94,0.4)",
                        }}
                      >
                        <svg
                          width={isStory ? 16 : 14}
                          height={isStory ? 16 : 14}
                          viewBox="0 0 16 16"
                          fill="none"
                        >
                          <path
                            d="M3 8.5L6.5 12L13 4"
                            stroke="white"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </div>
                    )}

                    {/* Sport badge */}
                    <div
                      style={{
                        fontSize: isStory ? 12 : 11,
                        fontWeight: 800,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                        color: "#FFFFFF",
                        backgroundColor: "#FF3B3B",
                        padding: "5px 12px",
                        borderRadius: 6,
                        fontFamily: "monospace",
                        flexShrink: 0,
                      }}
                    >
                      {leg.sport}
                    </div>

                    {/* Pick + game */}
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 3,
                        minWidth: 0,
                      }}
                    >
                      <span
                        style={{
                          fontSize: isStory ? 20 : 17,
                          fontWeight: 600,
                          color: "rgba(255,255,255,0.92)",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {leg.pick}
                      </span>
                      <span
                        style={{
                          fontSize: isStory ? 12 : 11,
                          color: "rgba(255,255,255,0.3)",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {leg.game}
                      </span>
                    </div>
                  </div>

                  {/* Right: odds + book */}
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "flex-end",
                      gap: 3,
                      flexShrink: 0,
                    }}
                  >
                    <span
                      style={{
                        fontSize: isStory ? 22 : 19,
                        fontWeight: 700,
                        color: "#FF3B3B",
                        fontFamily: "monospace",
                      }}
                    >
                      {formatOdds(leg.odds)}
                    </span>
                    <span
                      style={{
                        fontSize: isStory ? 11 : 10,
                        color: "rgba(255,255,255,0.3)",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                      }}
                    >
                      {leg.book}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* ─── Divider ─── */}
          <div
            style={{
              marginTop: isStory ? 32 : 24,
              marginBottom: isStory ? 32 : 24,
              height: 1,
              background:
                "linear-gradient(90deg, rgba(255,59,59,0.4) 0%, rgba(255,255,255,0.06) 100%)",
              width: `${dividerWidth}%`,
            }}
          />

          {/* ─── Combined odds + bet ─── */}
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              justifyContent: "space-between",
            }}
          >
            <div
              style={{
                opacity: combinedOddsOpacity,
                transform: `scale(${combinedOddsScale})`,
                transformOrigin: "left bottom",
              }}
            >
              <div
                style={{
                  fontSize: isStory ? 11 : 10,
                  fontWeight: 500,
                  letterSpacing: "0.15em",
                  textTransform: "uppercase",
                  color: "rgba(255,255,255,0.3)",
                  marginBottom: 6,
                }}
              >
                Combined Odds
              </div>
              <div
                style={{
                  fontSize: isStory ? 56 : 48,
                  fontWeight: 900,
                  color: "#FF3B3B",
                  fontFamily: "monospace",
                  letterSpacing: "-0.02em",
                  lineHeight: 1,
                }}
              >
                {combinedOdds}
              </div>
            </div>

            <div
              style={{
                opacity: betTextOpacity,
                textAlign: "right",
              }}
            >
              <div
                style={{
                  fontSize: isStory ? 12 : 11,
                  color: "rgba(255,255,255,0.3)",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  fontFamily: "monospace",
                }}
              >
                $100 bet
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ ACT 3: THE WIN ═══ */}

      {/* Green glow on the card area */}
      {frame >= 100 && (
        <div
          style={{
            position: "absolute",
            top: topArea - 20,
            left: paddingX - 20,
            right: paddingX - 20,
            bottom: isStory ? 180 : 80,
            borderRadius: 20,
            border: `1px solid rgba(34,197,94,${0.2 * glowOpacity})`,
            boxShadow: `0 0 40px rgba(34,197,94,${0.08 * glowOpacity}), inset 0 0 40px rgba(34,197,94,${0.02 * glowOpacity})`,
            pointerEvents: "none",
            opacity: glowOpacity,
          }}
        />
      )}

      {/* "WINNER" text blast */}
      {frame >= 118 && (
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
            pointerEvents: "none",
          }}
        >
          {/* Background flash */}
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "rgba(34,197,94,0.05)",
              opacity: interpolate(frame, [118, 125, 135], [1, 0.5, 0], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
            }}
          />
        </div>
      )}

      {/* Payout display */}
      {frame >= 122 && (
        <div
          style={{
            position: "absolute",
            bottom: isStory ? 300 : 160,
            left: 0,
            right: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <div
            style={{
              fontSize: isStory ? 12 : 10,
              fontWeight: 500,
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              color: "rgba(34,197,94,0.6)",
              marginBottom: 8,
              opacity: interpolate(frame, [122, 128], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
            }}
          >
            PAYOUT
          </div>
          <div
            style={{
              fontSize: isStory ? 72 : 60,
              fontWeight: 900,
              fontFamily: "monospace",
              color: "#22C55E",
              lineHeight: 1,
              textShadow: "0 0 40px rgba(34,197,94,0.3)",
              opacity: interpolate(frame, [122, 126], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
            }}
          >
            ${displayPayout.toLocaleString()}
          </div>
        </div>
      )}

      {/* Celebration particles */}
      {frame >= 120 &&
        Array.from({ length: 8 }).map((_, i) => (
          <CelebrationParticle
            key={i}
            index={i}
            frame={frame}
            startFrame={120}
            centerX={540}
            centerY={isStory ? 1200 : 700}
          />
        ))}

      {/* ─── Watermark ─── */}
      <div
        style={{
          position: "absolute",
          bottom: isStory ? 60 : 24,
          left: 0,
          right: 0,
          textAlign: "center",
          opacity: watermarkOpacity,
        }}
      >
        <span
          style={{
            fontSize: isStory ? 14 : 12,
            fontWeight: 500,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.15)",
          }}
        >
          BayParlays.com
        </span>
      </div>
    </AbsoluteFill>
  );
}
