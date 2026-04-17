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

/* ─── Composition ─── */

export function ParlayVideoComposition({
  legs,
  combinedOdds,
  evPercent,
  payout,
  format = "square",
}: ParlayVideoProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  /* ─── Logo fade (0-20) ─── */
  const logoOpacity = interpolate(frame, [0, 20], [0, 1], {
    extrapolateRight: "clamp",
  });

  /* ─── "Today's Pick" label slide (15-30) ─── */
  const labelOpacity = interpolate(frame, [15, 30], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const labelX = interpolate(frame, [15, 30], [40, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  /* ─── Divider line draw (90-120) ─── */
  const dividerWidth = interpolate(frame, [90, 120], [0, 100], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  /* ─── Combined odds spring bounce (100-130) ─── */
  const oddsScale = spring({
    frame: frame - 100,
    fps,
    config: { damping: 8, stiffness: 120, mass: 0.8 },
  });
  const oddsOpacity = interpolate(frame, [100, 115], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  /* ─── EV bar fill (110-140) ─── */
  const evBarWidth = interpolate(frame, [110, 140], [0, Math.min(evPercent * 4, 100)], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  /* ─── Watermark fade (130-150) ─── */
  const watermarkOpacity = interpolate(frame, [130, 150], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  /* ─── Payout + confidence (120-140) ─── */
  const payoutOpacity = interpolate(frame, [120, 135], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const isStory = format === "story";
  const paddingX = isStory ? 60 : 60;
  const topPadding = isStory ? 180 : 80;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#0a0a0a",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      {/* ─── Background grid pattern ─── */}
      <AbsoluteFill
        style={{
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)
          `,
          backgroundSize: "40px 40px",
        }}
      />

      {/* ─── Subtle radial glow ─── */}
      <div
        style={{
          position: "absolute",
          top: "10%",
          right: "-10%",
          width: 600,
          height: 600,
          background: "radial-gradient(circle, rgba(255,59,59,0.06) 0%, transparent 70%)",
          borderRadius: "50%",
          pointerEvents: "none",
        }}
      />

      {/* ─── Content container ─── */}
      <div
        style={{
          position: "absolute",
          top: topPadding,
          left: paddingX,
          right: paddingX,
          bottom: isStory ? 120 : 60,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* ─── Logo ─── */}
        <div
          style={{
            opacity: logoOpacity,
            marginBottom: isStory ? 60 : 40,
          }}
        >
          <span
            style={{
              fontSize: isStory ? 52 : 44,
              fontWeight: 900,
              letterSpacing: "-0.02em",
              color: "#ededed",
            }}
          >
            Bay
            <span style={{ color: "#FF3B3B" }}>Parlays</span>
          </span>
        </div>

        {/* ─── "Today's Pick" label ─── */}
        <div
          style={{
            opacity: labelOpacity,
            transform: `translateX(${labelX}px)`,
            marginBottom: isStory ? 40 : 30,
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              backgroundColor: "#FF3B3B",
              boxShadow: "0 0 12px rgba(255,59,59,0.4)",
            }}
          />
          <span
            style={{
              fontSize: isStory ? 16 : 14,
              fontWeight: 600,
              letterSpacing: "0.15em",
              textTransform: "uppercase" as const,
              color: "rgba(255,59,59,0.7)",
            }}
          >
            Today&apos;s Pick
          </span>
          <span
            style={{
              fontSize: isStory ? 14 : 12,
              color: "rgba(255,255,255,0.2)",
              fontFamily: "monospace",
            }}
          >
            {legs.length}-Leg Parlay
          </span>
        </div>

        {/* ─── Legs ─── */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: isStory ? 12 : 10,
            flex: 1,
          }}
        >
          {legs.map((leg, i) => {
            const legStartFrame = 25 + i * 15;

            /* Sport badge slides from left */
            const badgeX = interpolate(
              frame,
              [legStartFrame, legStartFrame + 12],
              [-30, 0],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
            );
            const badgeOpacity = interpolate(
              frame,
              [legStartFrame, legStartFrame + 12],
              [0, 1],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
            );

            /* Pick text fades in */
            const pickOpacity = interpolate(
              frame,
              [legStartFrame + 5, legStartFrame + 18],
              [0, 1],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
            );

            /* Odds number counts up */
            const oddsProgress = interpolate(
              frame,
              [legStartFrame + 3, legStartFrame + 20],
              [0, 1],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
            );
            const displayOdds = Math.round(leg.odds * oddsProgress);

            /* Book name fades in */
            const bookOpacity = interpolate(
              frame,
              [legStartFrame + 10, legStartFrame + 22],
              [0, 1],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
            );

            return (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  backgroundColor: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.06)",
                  borderRadius: 16,
                  padding: isStory ? "18px 22px" : "16px 20px",
                }}
              >
                {/* Left: badge + pick */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    flex: 1,
                    minWidth: 0,
                  }}
                >
                  {/* Sport badge */}
                  <div
                    style={{
                      opacity: badgeOpacity,
                      transform: `translateX(${badgeX}px)`,
                      fontSize: isStory ? 12 : 11,
                      fontWeight: 800,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase" as const,
                      color: "rgba(255,59,59,0.8)",
                      backgroundColor: "rgba(255,59,59,0.08)",
                      border: "1px solid rgba(255,59,59,0.15)",
                      padding: "4px 10px",
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
                      opacity: pickOpacity,
                      display: "flex",
                      flexDirection: "column",
                      gap: 2,
                      minWidth: 0,
                    }}
                  >
                    <span
                      style={{
                        fontSize: isStory ? 18 : 16,
                        fontWeight: 600,
                        color: "rgba(255,255,255,0.9)",
                        whiteSpace: "nowrap" as const,
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
                        whiteSpace: "nowrap" as const,
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
                    gap: 2,
                    flexShrink: 0,
                  }}
                >
                  <span
                    style={{
                      opacity: oddsProgress > 0 ? 1 : 0,
                      fontSize: isStory ? 18 : 16,
                      fontWeight: 700,
                      color: "#FF3B3B",
                      fontFamily: "monospace",
                    }}
                  >
                    {formatOdds(displayOdds)}
                  </span>
                  <span
                    style={{
                      opacity: bookOpacity,
                      fontSize: isStory ? 11 : 10,
                      color: "rgba(255,255,255,0.3)",
                      textTransform: "uppercase" as const,
                      letterSpacing: "0.05em",
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
            marginTop: isStory ? 30 : 24,
            marginBottom: isStory ? 30 : 24,
            height: 1,
            background: `linear-gradient(90deg, rgba(255,59,59,0.3) 0%, rgba(255,255,255,0.06) 100%)`,
            width: `${dividerWidth}%`,
          }}
        />

        {/* ─── Bottom stats row ─── */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: 20,
          }}
        >
          {/* Combined odds */}
          <div
            style={{
              opacity: oddsOpacity,
              transform: `scale(${oddsScale})`,
            }}
          >
            <div
              style={{
                fontSize: isStory ? 11 : 10,
                fontWeight: 500,
                letterSpacing: "0.15em",
                textTransform: "uppercase" as const,
                color: "rgba(255,255,255,0.3)",
                marginBottom: 4,
              }}
            >
              Combined Odds
            </div>
            <div
              style={{
                fontSize: isStory ? 48 : 40,
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

          {/* Payout */}
          <div style={{ opacity: payoutOpacity, textAlign: "center" as const }}>
            <div
              style={{
                fontSize: isStory ? 11 : 10,
                fontWeight: 500,
                letterSpacing: "0.15em",
                textTransform: "uppercase" as const,
                color: "rgba(255,255,255,0.3)",
                marginBottom: 4,
              }}
            >
              $100 Pays
            </div>
            <div
              style={{
                fontSize: isStory ? 32 : 28,
                fontWeight: 800,
                color: "#ededed",
                fontFamily: "monospace",
                lineHeight: 1,
              }}
            >
              ${payout.toLocaleString()}
            </div>
          </div>

          {/* EV bar */}
          <div style={{ flex: 1, maxWidth: 220 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 8,
              }}
            >
              <span
                style={{
                  fontSize: isStory ? 11 : 10,
                  fontWeight: 500,
                  letterSpacing: "0.15em",
                  textTransform: "uppercase" as const,
                  color: "rgba(255,255,255,0.3)",
                }}
              >
                EV Score
              </span>
              <span
                style={{
                  fontSize: isStory ? 16 : 14,
                  fontWeight: 700,
                  color: "#FF3B3B",
                  fontFamily: "monospace",
                  opacity: evBarWidth > 0 ? 1 : 0,
                }}
              >
                +{evPercent.toFixed(1)}%
              </span>
            </div>
            <div
              style={{
                height: isStory ? 8 : 6,
                backgroundColor: "rgba(255,255,255,0.06)",
                borderRadius: 4,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${evBarWidth}%`,
                  background: "linear-gradient(90deg, #FF3B3B, #FF5252)",
                  borderRadius: 4,
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ─── Watermark ─── */}
      <div
        style={{
          position: "absolute",
          bottom: isStory ? 60 : 20,
          left: 0,
          right: 0,
          textAlign: "center" as const,
          opacity: watermarkOpacity,
        }}
      >
        <span
          style={{
            fontSize: isStory ? 14 : 12,
            fontWeight: 500,
            letterSpacing: "0.2em",
            textTransform: "uppercase" as const,
            color: "rgba(255,255,255,0.15)",
          }}
        >
          BayParlays.com
        </span>
      </div>
    </AbsoluteFill>
  );
}
