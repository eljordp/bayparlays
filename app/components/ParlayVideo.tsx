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

const SPORTSBOOK_PILLS = ["DK", "FD", "MGM", "CZR", "BR", "ESPN"];

const RADAR_ODDS = ["-110", "+150", "-130", "+220", "-105", "+180", "+310", "-145"];

/* Seeded pseudo-random for deterministic animations */
function seededRandom(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 49297;
  return x - Math.floor(x);
}

/* ─── Celebration Particle ─── */
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

  const angle = (index / 14) * Math.PI * 2 + seededRandom(index * 7) * 1.2;
  const speed = 2.5 + seededRandom(index * 13) * 5;
  const size = 5 + seededRandom(index * 19) * 10;

  const progress = interpolate(elapsed, [0, 40], [0, 1], {
    extrapolateRight: "clamp",
  });

  const x = centerX + Math.cos(angle) * speed * progress * 120;
  const y =
    centerY +
    Math.sin(angle) * speed * progress * 120 +
    progress * progress * 60;
  const opacity = interpolate(elapsed, [0, 5, 25, 40], [0, 1, 0.7, 0], {
    extrapolateRight: "clamp",
  });
  const scale = interpolate(elapsed, [0, 6, 40], [0.1, 1.3, 0.2], {
    extrapolateRight: "clamp",
  });

  const colors = ["#22C55E", "#4ADE80", "#FFFFFF", "#FFD700", "#86EFAC", "#22C55E"];
  const color = colors[index % colors.length];

  // Mix of shapes: squares, diamonds, circles
  const shapeType = index % 3;
  const isSquare = shapeType === 0;
  const isDiamond = shapeType === 1;

  return (
    <div
      style={{
        position: "absolute",
        left: x - size / 2,
        top: y - size / 2,
        width: size,
        height: size,
        borderRadius: isSquare ? 2 : isDiamond ? 0 : "50%",
        backgroundColor: color,
        opacity,
        transform: `scale(${scale}) rotate(${isDiamond ? 45 : 0}deg)`,
        boxShadow: `0 0 ${size * 3}px ${color}60`,
      }}
    />
  );
}

/* ─── Composition ─── */

export function ParlayVideoComposition({
  legs,
  combinedOdds,
  payout,
}: ParlayVideoProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const W = 720;
  const H = 720;
  const cx = W / 2;
  const cy = H / 2;

  /* ═══════════════════════════════════════════════════
     ACT 1: THE SCAN (frames 0-50)
     ═══════════════════════════════════════════════════ */

  // Scanner beam (red line sweeping left to right)
  const scanLineX = interpolate(frame, [0, 8], [0, W], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const scanLineOpacity = interpolate(frame, [0, 2, 6, 8], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // "BayParlays" SLAM in (frame 8-15)
  const logoScale = spring({
    frame: frame - 8,
    fps,
    config: { damping: 8, stiffness: 220, mass: 1.0 },
  });
  const logoFinalScale = frame < 8 ? 0 : interpolate(logoScale, [0, 1], [2, 1]);
  const logoOpacity = interpolate(frame, [8, 10], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  // Fade out logo before Act 2
  const logoFadeOut = interpolate(frame, [40, 48], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Sportsbook pills (frame 15-25, light up every 2 frames)
  const pillsVisible = frame >= 15 && frame < 40;
  const pillsFadeOut = interpolate(frame, [25, 30], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Radar sweep (frame 25-40)
  const radarActive = frame >= 25 && frame < 42;
  const radarAngle = interpolate(frame, [25, 40], [0, Math.PI * 2.5], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const radarOpacity = interpolate(frame, [25, 27, 38, 42], [0, 0.8, 0.8, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Dramatic pause + red line expand (frame 40-50)
  const redLineWidth = interpolate(frame, [43, 48], [0, W * 0.8], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const redLineOpacity = interpolate(frame, [43, 45, 48, 50], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  /* ═══════════════════════════════════════════════════
     ACT 2: THE LOCK (frames 50-110)
     ═══════════════════════════════════════════════════ */

  // White flash at frame 50
  const flashOpacity = interpolate(frame, [50, 51, 52, 54], [0, 0.9, 0.3, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // "EDGE FOUND" text (frame 52+)
  const edgeFoundOpacity = interpolate(frame, [52, 54], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const edgeFoundFade = interpolate(frame, [52, 54, 56, 58], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Leg cards staggered (frame 55-90, staggered by 10)
  // Divider line (frame 85-95)
  const dividerProgress = interpolate(frame, [85, 95], [0, 100], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Combined odds SLAM (frame 95-110)
  const oddsSlam = spring({
    frame: frame - 95,
    fps,
    config: { damping: 6, stiffness: 160, mass: 1.4 },
  });
  const oddsSlamScale = frame < 95 ? 0 : interpolate(oddsSlam, [0, 1], [3, 1]);
  const oddsSlamOpacity = interpolate(frame, [95, 97], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Bet text (frame 105-110)
  const betTextOpacity = interpolate(frame, [105, 110], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  /* ═══════════════════════════════════════════════════
     ACT 3: THE WIN (frames 110-180)
     ═══════════════════════════════════════════════════ */

  // Dim everything (frame 110-115)
  const dimOverlay = interpolate(frame, [110, 113, 115, 116], [0, 0.4, 0.4, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Green flash (frame 115-120)
  const greenFlash = interpolate(frame, [115, 116, 118, 120], [0, 0.7, 0.3, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // "WINNER" text (frame 115+)
  const winnerScale = spring({
    frame: frame - 115,
    fps,
    config: { damping: 8, stiffness: 200, mass: 1.0 },
  });
  // Winner fades to make room
  const winnerFade = interpolate(frame, [115, 117, 130, 135], [0, 1, 1, 0.3], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Payout counter (frame 140-150)
  const payoutProgress = interpolate(frame, [140, 150], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const displayPayout = Math.round(payout * payoutProgress);
  const payoutOpacity = interpolate(frame, [140, 142], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Watermark (frame 165-180)
  const watermarkOpacity = interpolate(frame, [165, 175], [0, 0.6], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Payout glow pulse (frame 150+)
  const glowPulse = frame >= 150 ? 0.5 + 0.5 * Math.sin((frame - 150) * 0.15) : 0;

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

      {/* Scanner beam — red horizontal line */}
      {frame < 10 && (
        <div
          style={{
            position: "absolute",
            left: scanLineX - 2,
            top: 0,
            width: 4,
            height: H,
            background: "linear-gradient(180deg, transparent 10%, #FF3B3B 30%, #FF3B3B 70%, transparent 90%)",
            opacity: scanLineOpacity,
            boxShadow: "0 0 30px #FF3B3B, 0 0 60px rgba(255,59,59,0.4)",
          }}
        />
      )}

      {/* BayParlays logo SLAM */}
      {frame >= 8 && frame < 50 && (
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
            opacity: logoOpacity * logoFadeOut,
          }}
        >
          <div
            style={{
              fontSize: 72,
              fontWeight: 900,
              letterSpacing: "-0.03em",
              color: "#ededed",
              transform: `scale(${logoFinalScale})`,
              textShadow: frame < 12 ? "0 0 40px rgba(255,59,59,0.5)" : "none",
            }}
          >
            Bay<span style={{ color: "#FF3B3B" }}>Parlays</span>
          </div>

          {/* Sportsbook pills grid */}
          {pillsVisible && (
            <div
              style={{
                display: "flex",
                gap: 10,
                marginTop: 30,
                flexWrap: "wrap",
                justifyContent: "center",
                maxWidth: 400,
                opacity: pillsFadeOut,
              }}
            >
              {SPORTSBOOK_PILLS.map((book, i) => {
                const pillFrame = 15 + i * 2;
                const isLit = frame >= pillFrame;
                const pillOpacity = isLit
                  ? interpolate(frame, [pillFrame, pillFrame + 3], [0, 1], {
                      extrapolateLeft: "clamp",
                      extrapolateRight: "clamp",
                    })
                  : 0;

                return (
                  <div
                    key={book}
                    style={{
                      padding: "8px 18px",
                      borderRadius: 20,
                      fontSize: 16,
                      fontWeight: 700,
                      fontFamily: "monospace",
                      backgroundColor: isLit ? "rgba(255,59,59,0.15)" : "rgba(255,255,255,0.04)",
                      color: isLit ? "#FF3B3B" : "rgba(255,255,255,0.15)",
                      border: `1px solid ${isLit ? "rgba(255,59,59,0.3)" : "rgba(255,255,255,0.06)"}`,
                      opacity: pillOpacity + (isLit ? 0 : 0.3),
                      boxShadow: isLit ? "0 0 20px rgba(255,59,59,0.2)" : "none",
                      transition: "all 0.1s",
                    }}
                  >
                    {book}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Radar sweep */}
      {radarActive && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            opacity: radarOpacity,
          }}
        >
          {/* Radar circles */}
          {[100, 180, 260].map((r, i) => (
            <div
              key={i}
              style={{
                position: "absolute",
                left: cx - r,
                top: cy - r,
                width: r * 2,
                height: r * 2,
                borderRadius: "50%",
                border: "1px solid rgba(255,59,59,0.12)",
              }}
            />
          ))}

          {/* Sweep line */}
          <div
            style={{
              position: "absolute",
              left: cx,
              top: cy,
              width: 280,
              height: 3,
              background: "linear-gradient(90deg, #FF3B3B 0%, transparent 100%)",
              transformOrigin: "0 50%",
              transform: `rotate(${radarAngle}rad)`,
              boxShadow: "0 0 20px rgba(255,59,59,0.4)",
            }}
          />

          {/* Sweep trail (fading arc) */}
          <div
            style={{
              position: "absolute",
              left: cx - 280,
              top: cy - 280,
              width: 560,
              height: 560,
              borderRadius: "50%",
              background: `conic-gradient(from ${radarAngle}rad at 50% 50%, transparent 0deg, rgba(255,59,59,0.08) 30deg, transparent 60deg)`,
            }}
          />

          {/* Flashing odds near sweep */}
          {RADAR_ODDS.map((odd, i) => {
            const oddAngle = (i / RADAR_ODDS.length) * Math.PI * 2;
            const dist = 90 + seededRandom(i * 17) * 150;
            const angleDiff = Math.abs(((radarAngle % (Math.PI * 2)) - oddAngle + Math.PI * 3) % (Math.PI * 2) - Math.PI);
            const oddOpacity = angleDiff < 0.5 ? interpolate(angleDiff, [0, 0.5], [0.8, 0], { extrapolateRight: "clamp" }) : 0;

            return (
              <div
                key={i}
                style={{
                  position: "absolute",
                  left: cx + Math.cos(oddAngle) * dist - 20,
                  top: cy + Math.sin(oddAngle) * dist - 10,
                  fontSize: 18,
                  fontFamily: "monospace",
                  fontWeight: 700,
                  color: "#FF3B3B",
                  opacity: oddOpacity,
                  textShadow: "0 0 10px rgba(255,59,59,0.5)",
                }}
              >
                {odd}
              </div>
            );
          })}

          {/* Center dot */}
          <div
            style={{
              position: "absolute",
              left: cx - 4,
              top: cy - 4,
              width: 8,
              height: 8,
              borderRadius: "50%",
              backgroundColor: "#FF3B3B",
              boxShadow: "0 0 16px rgba(255,59,59,0.6)",
            }}
          />
        </div>
      )}

      {/* Red line expand from center (frame 43-50) */}
      {frame >= 43 && frame < 52 && (
        <div
          style={{
            position: "absolute",
            left: cx - redLineWidth / 2,
            top: cy - 1.5,
            width: redLineWidth,
            height: 3,
            background: "linear-gradient(90deg, transparent, #FF3B3B, transparent)",
            opacity: redLineOpacity,
            boxShadow: "0 0 30px rgba(255,59,59,0.4)",
          }}
        />
      )}

      {/* ═══ ACT 2: THE LOCK ═══ */}

      {/* White flash */}
      {frame >= 50 && frame < 55 && (
        <AbsoluteFill
          style={{
            backgroundColor: "#FFFFFF",
            opacity: flashOpacity,
            zIndex: 10,
          }}
        />
      )}

      {/* "EDGE FOUND" text */}
      {frame >= 52 && frame < 60 && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 11,
            opacity: edgeFoundFade,
          }}
        >
          <div
            style={{
              fontSize: 56,
              fontWeight: 900,
              letterSpacing: "0.25em",
              color: "#FF3B3B",
              textShadow: "0 0 40px rgba(255,59,59,0.5), 0 0 80px rgba(255,59,59,0.2)",
              opacity: edgeFoundOpacity,
            }}
          >
            EDGE FOUND
          </div>
        </div>
      )}

      {/* Leg cards (frame 55+) */}
      {frame >= 55 && (
        <div
          style={{
            position: "absolute",
            top: 40,
            left: 32,
            right: 32,
          }}
        >
          {/* Small "PARLAY LOCKED" header */}
          <div
            style={{
              opacity: interpolate(frame, [55, 58], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginBottom: 20,
            }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                backgroundColor: frame >= 115 ? "#22C55E" : "#FF3B3B",
                boxShadow: `0 0 12px ${frame >= 115 ? "rgba(34,197,94,0.6)" : "rgba(255,59,59,0.5)"}`,
              }}
            />
            <span
              style={{
                fontSize: 16,
                fontWeight: 800,
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                color: frame >= 115 ? "#22C55E" : "rgba(255,59,59,0.8)",
              }}
            >
              {frame >= 115 ? "WINNER" : "PARLAY LOCKED"}
            </span>
            <span
              style={{
                fontSize: 14,
                color: "rgba(255,255,255,0.2)",
                fontFamily: "monospace",
              }}
            >
              {legs.length}-LEG
            </span>
          </div>

          {/* Cards */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {legs.map((leg, i) => {
              const legStart = 55 + i * 10;

              // Slide in from left with bounce
              const slideSpring = spring({
                frame: frame - legStart,
                fps,
                config: { damping: 12, stiffness: 200, mass: 0.8 },
              });
              const slideX = frame < legStart ? -300 : interpolate(slideSpring, [0, 1], [-300, 0]);
              const legOpacity = interpolate(frame, [legStart, legStart + 4], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              });

              // Checkmark (Act 3: frame 120-140, staggered by 5)
              const checkStart = 120 + i * 5;
              const checkSpring = spring({
                frame: frame - checkStart,
                fps,
                config: { damping: 8, stiffness: 200, mass: 0.6 },
              });
              const checkScale = frame < checkStart ? 0 : interpolate(checkSpring, [0, 1], [0, 1]);
              const checkOpacity = interpolate(frame, [checkStart, checkStart + 3], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              });

              // Green border on win
              const isWon = frame >= checkStart;

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
                    borderLeft: `4px solid ${isWon ? "#22C55E" : "#FF3B3B"}`,
                    borderRadius: 8,
                    padding: "14px 18px",
                    position: "relative",
                  }}
                >
                  {/* Left side */}
                  <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0 }}>
                    {/* Green checkmark */}
                    {frame >= checkStart && (
                      <div
                        style={{
                          opacity: checkOpacity,
                          transform: `scale(${checkScale})`,
                          width: 28,
                          height: 28,
                          borderRadius: "50%",
                          backgroundColor: "#22C55E",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                          boxShadow: "0 0 16px rgba(34,197,94,0.5)",
                        }}
                      >
                        <svg width={16} height={16} viewBox="0 0 16 16" fill="none">
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
                        fontSize: 13,
                        fontWeight: 800,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                        color: "#FFFFFF",
                        backgroundColor: "#FF3B3B",
                        padding: "5px 14px",
                        borderRadius: 6,
                        fontFamily: "monospace",
                        flexShrink: 0,
                      }}
                    >
                      {leg.sport}
                    </div>

                    {/* Pick text */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                      <span
                        style={{
                          fontSize: 24,
                          fontWeight: 700,
                          color: "rgba(255,255,255,0.95)",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {leg.pick}
                      </span>
                    </div>
                  </div>

                  {/* Right: odds + book */}
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2, flexShrink: 0 }}>
                    <span
                      style={{
                        fontSize: 26,
                        fontWeight: 700,
                        color: "#FF3B3B",
                        fontFamily: "monospace",
                      }}
                    >
                      {formatOdds(leg.odds)}
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        color: "rgba(255,255,255,0.25)",
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

          {/* Divider line (frame 85-95) */}
          {frame >= 85 && (
            <div
              style={{
                marginTop: 20,
                height: 3,
                background: "linear-gradient(90deg, #FF3B3B, rgba(255,59,59,0.3))",
                width: `${dividerProgress}%`,
                borderRadius: 2,
                boxShadow: "0 0 12px rgba(255,59,59,0.3)",
              }}
            />
          )}

          {/* Combined odds SLAM (frame 95+) */}
          {frame >= 95 && (
            <div
              style={{
                marginTop: 24,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                opacity: oddsSlamOpacity,
              }}
            >
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 500,
                  letterSpacing: "0.15em",
                  textTransform: "uppercase",
                  color: "rgba(255,255,255,0.3)",
                  marginBottom: 8,
                }}
              >
                Combined Odds
              </div>
              <div
                style={{
                  fontSize: 88,
                  fontWeight: 900,
                  color: "#FF3B3B",
                  fontFamily: "monospace",
                  letterSpacing: "-0.03em",
                  lineHeight: 1,
                  transform: `scale(${oddsSlamScale})`,
                  textShadow: "0 0 40px rgba(255,59,59,0.3), 0 4px 20px rgba(0,0,0,0.5)",
                }}
              >
                {combinedOdds}
              </div>

              {/* $100 -> $587 */}
              {frame >= 105 && (
                <div
                  style={{
                    marginTop: 12,
                    fontSize: 22,
                    fontWeight: 600,
                    fontFamily: "monospace",
                    color: "rgba(255,255,255,0.5)",
                    opacity: betTextOpacity,
                  }}
                >
                  $100 &rarr; ${payout.toLocaleString()}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ═══ ACT 3: THE WIN ═══ */}

      {/* Dim overlay (frame 110-115) */}
      {frame >= 110 && frame < 117 && (
        <AbsoluteFill
          style={{
            backgroundColor: "#000000",
            opacity: dimOverlay,
          }}
        />
      )}

      {/* Green flash (frame 115-120) */}
      {frame >= 115 && frame < 121 && (
        <AbsoluteFill
          style={{
            backgroundColor: "#22C55E",
            opacity: greenFlash,
            zIndex: 12,
          }}
        />
      )}

      {/* "WINNER" massive text */}
      {frame >= 115 && frame < 140 && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 13,
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              fontSize: 100,
              fontWeight: 900,
              letterSpacing: "0.15em",
              color: "#22C55E",
              opacity: winnerFade,
              transform: `scale(${frame < 115 ? 0 : interpolate(winnerScale, [0, 1], [2.5, 1])})`,
              textShadow: "0 0 60px rgba(34,197,94,0.5), 0 0 120px rgba(34,197,94,0.2)",
            }}
          >
            WINNER
          </div>
        </div>
      )}

      {/* Payout counter (frame 140-165) */}
      {frame >= 140 && (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 100,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            zIndex: 14,
          }}
        >
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: "rgba(34,197,94,0.6)",
              marginBottom: 8,
              opacity: payoutOpacity,
            }}
          >
            PAYOUT
          </div>
          <div
            style={{
              fontSize: 80,
              fontWeight: 900,
              fontFamily: "monospace",
              color: "#22C55E",
              lineHeight: 1,
              opacity: payoutOpacity,
              textShadow: `0 0 ${40 + glowPulse * 30}px rgba(34,197,94,${0.3 + glowPulse * 0.3}), 0 0 80px rgba(34,197,94,0.15)`,
            }}
          >
            ${displayPayout.toLocaleString()}
          </div>
        </div>
      )}

      {/* Celebration particles (frame 150-180) */}
      {frame >= 150 &&
        Array.from({ length: 14 }).map((_, i) => (
          <CelebrationParticle
            key={i}
            index={i}
            frame={frame}
            startFrame={150}
            centerX={cx}
            centerY={cy}
          />
        ))}

      {/* Watermark (frame 165+) */}
      {frame >= 165 && (
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
              fontSize: 16,
              fontWeight: 600,
              letterSpacing: "0.25em",
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.2)",
            }}
          >
            BayParlays.com
          </span>
        </div>
      )}
    </AbsoluteFill>
  );
}
