"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";

interface BettingSlipProps {
  legs: {
    sport: string;
    pick: string;
    odds: number;
    result: "win" | "loss" | "pending" | "WIN" | "PENDING";
    book?: string;
    // Game identifier (e.g. "Lakers vs Warriors") and commence time
    // (ISO string). Both optional for back-compat with old callers; when
    // present they get rendered as a small subtitle so playoff series
    // with repeated matchups don't all look the same.
    game?: string;
    commenceTime?: string;
  }[];
  stake: number;
  payout: number;
  status: "pending" | "won" | "lost";
  animated?: boolean;
}

// Compact game-time formatter. Skips year on near-future dates so the
// label stays narrow inside the slip cell. ISO → "Wed 7:10pm" /
// "May 6 7:10pm" (later in the week or beyond).
function formatGameTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return "";
    const now = new Date();
    const sameDay =
      d.toDateString() === now.toDateString();
    const within7d =
      d.getTime() - now.getTime() < 7 * 24 * 60 * 60 * 1000;
    const time = d.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
    if (sameDay) return `Today ${time}`;
    if (within7d) {
      return d.toLocaleDateString(undefined, { weekday: "short" }) +
        " " + time;
    }
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    }) + " " + time;
  } catch {
    return "";
  }
}

/* ─── Confetti dots ─── */
function ConfettiDots() {
  const dots = Array.from({ length: 24 }, (_, i) => {
    const angle = Math.random() * 360;
    const distance = 60 + Math.random() * 140;
    const size = 3 + Math.random() * 5;
    const delay = Math.random() * 0.3;
    const duration = 0.6 + Math.random() * 0.6;
    const colors = ["#22c55e", "#4ade80", "#86efac", "#FF3B3B", "#ffffff"];
    const color = colors[i % colors.length];

    return (
      <motion.div
        key={i}
        initial={{ opacity: 0, x: 0, y: 0, scale: 0 }}
        animate={{
          opacity: [0, 1, 1, 0],
          x: Math.cos((angle * Math.PI) / 180) * distance,
          y: Math.sin((angle * Math.PI) / 180) * distance,
          scale: [0, 1.2, 1, 0.5],
        }}
        transition={{
          duration: duration,
          delay: delay,
          ease: "easeOut",
        }}
        style={{
          position: "absolute",
          width: size,
          height: size,
          borderRadius: "50%",
          backgroundColor: color,
          top: "50%",
          left: "50%",
          pointerEvents: "none",
        }}
      />
    );
  });

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        pointerEvents: "none",
        zIndex: 20,
      }}
    >
      <div style={{ position: "absolute", top: "60%", left: "50%" }}>
        {dots}
      </div>
    </div>
  );
}

/* ─── Format odds display ─── */
function formatOdds(odds: number): string {
  return odds > 0 ? `+${odds}` : `${odds}`;
}

/* ─── Main Component ─── */
export function BettingSlip({
  legs,
  stake,
  payout,
  status,
  animated = false,
}: BettingSlipProps) {
  const [revealedLegs, setRevealedLegs] = useState<number>(
    animated ? 0 : legs.length
  );
  const [showWinner, setShowWinner] = useState(!animated && status === "won");
  const [showConfetti, setShowConfetti] = useState(false);

  useEffect(() => {
    if (!animated) return;

    const timers: ReturnType<typeof setTimeout>[] = [];

    legs.forEach((_, i) => {
      timers.push(
        setTimeout(() => {
          setRevealedLegs(i + 1);
        }, 600 + i * 700)
      );
    });

    if (status === "won") {
      timers.push(
        setTimeout(() => {
          setShowWinner(true);
          setShowConfetti(true);
        }, 600 + legs.length * 700 + 400)
      );
      timers.push(
        setTimeout(() => {
          setShowConfetti(false);
        }, 600 + legs.length * 700 + 2000)
      );
    }

    return () => timers.forEach(clearTimeout);
  }, [animated, legs, status]);

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        maxWidth: 380,
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      {/* ─── Perforated top edge ─── */}
      <div
        style={{
          height: 12,
          background: "#FFFFFF",
          borderRadius: "16px 16px 0 0",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            bottom: -4,
            left: 12,
            right: 12,
            height: 8,
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          {Array.from({ length: 20 }, (_, i) => (
            <div
              key={i}
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                backgroundColor: "#FAFAF7",
              }}
            />
          ))}
        </div>
      </div>

      {/* ─── Main card ─── */}
      <div
        style={{
          backgroundColor: "#FFFFFF",
          padding: "0 20px 20px",
          position: "relative",
        }}
      >
        {/* Confetti overlay */}
        <AnimatePresence>{showConfetti && <ConfettiDots />}</AnimatePresence>

        {/* ─── Header bar ─── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            paddingBottom: 14,
            borderBottom: "1px solid rgba(0,0,0,0.06)",
            marginBottom: 16,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span
              style={{
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: "0.15em",
                textTransform: "uppercase",
                color: "#FAFAF7",
                backgroundColor: "#0a0a0a",
                padding: "3px 8px",
                borderRadius: 4,
                fontFamily:
                  'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
              }}
            >
              PARLAY
            </span>
            <span
              style={{
                fontSize: 12,
                color: "rgba(0,0,0,0.45)",
                fontFamily:
                  'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
              }}
            >
              {legs.length} Legs
            </span>
          </div>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.05em",
              color: "rgba(0,0,0,0.3)",
            }}
          >
            Bay
            <span style={{ color: "rgba(0,0,0,0.45)" }}>Parlays</span>
          </span>
        </div>

        {/* ─── Legs ─── */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 2,
            marginBottom: 16,
          }}
        >
          {legs.map((leg, i) => {
            const isRevealed = i < revealedLegs;
            const resultUp = leg.result.toUpperCase();
            const isWin = resultUp === "WIN" && isRevealed;

            return (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "10px 12px",
                  borderRadius: 8,
                  backgroundColor: "rgba(0,0,0,0.02)",
                  position: "relative",
                }}
              >
                {/* Left: status + pick info */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    flex: 1,
                    minWidth: 0,
                  }}
                >
                  {/* Check / pending indicator */}
                  <div
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: "50%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      backgroundColor: isWin
                        ? "rgba(34,197,94,0.15)"
                        : "rgba(0,0,0,0.04)",
                      border: isWin
                        ? "1.5px solid rgba(34,197,94,0.3)"
                        : "1.5px solid rgba(0,0,0,0.08)",
                    }}
                  >
                    {isWin ? (
                      <motion.svg
                        width="12"
                        height="12"
                        viewBox="0 0 12 12"
                        fill="none"
                        initial={animated ? { pathLength: 0, opacity: 0 } : {}}
                        animate={{ pathLength: 1, opacity: 1 }}
                        transition={{ duration: 0.3, ease: "easeOut" }}
                      >
                        <motion.path
                          d="M2.5 6L5 8.5L9.5 3.5"
                          stroke="#22c55e"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          initial={
                            animated ? { pathLength: 0 } : { pathLength: 1 }
                          }
                          animate={{ pathLength: 1 }}
                          transition={{ duration: 0.3, ease: "easeOut" }}
                        />
                      </motion.svg>
                    ) : (
                      <div
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: "50%",
                          backgroundColor: "rgba(0,0,0,0.25)",
                        }}
                      />
                    )}
                  </div>

                  {/* Pick details */}
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 1,
                      minWidth: 0,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 9,
                        fontWeight: 700,
                        letterSpacing: "0.1em",
                        textTransform: "uppercase",
                        color: "rgba(0,0,0,0.4)",
                      }}
                    >
                      {leg.sport}
                    </span>
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: isWin
                          ? "rgba(0,0,0,0.95)"
                          : "rgba(0,0,0,0.6)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {leg.pick}
                    </span>
                    {(leg.game || leg.commenceTime) && (
                      <span
                        style={{
                          fontSize: 10,
                          color: "rgba(0,0,0,0.4)",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          marginTop: 1,
                        }}
                      >
                        {leg.game}
                        {leg.game && leg.commenceTime && " · "}
                        {leg.commenceTime && (
                          <span style={{ color: "rgba(0,0,0,0.55)", fontWeight: 500 }}>
                            {formatGameTime(leg.commenceTime)}
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                </div>

                {/* Right: odds */}
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: isWin ? "#22c55e" : "rgba(0,0,0,0.45)",
                    fontFamily:
                      'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
                    flexShrink: 0,
                    marginLeft: 12,
                  }}
                >
                  {formatOdds(leg.odds)}
                </span>
              </div>
            );
          })}
        </div>

        {/* ─── Divider ─── */}
        <div
          style={{
            height: 1,
            background:
              "linear-gradient(90deg, rgba(0,0,0,0.08), rgba(0,0,0,0.02))",
            marginBottom: 16,
          }}
        />

        {/* ─── Bottom: stake + payout ─── */}
        <div>
          {/* Stake row */}
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
                fontSize: 11,
                fontWeight: 500,
                color: "rgba(0,0,0,0.4)",
                letterSpacing: "0.05em",
                textTransform: "uppercase",
              }}
            >
              Wager
            </span>
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "rgba(0,0,0,0.6)",
                fontFamily:
                  'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
              }}
            >
              ${stake.toLocaleString()}
            </span>
          </div>

          {/* To Win row */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: status === "won" ? 16 : 0,
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontWeight: 500,
                color: "rgba(0,0,0,0.4)",
                letterSpacing: "0.05em",
                textTransform: "uppercase",
              }}
            >
              To Win
            </span>
            <span
              style={{
                fontSize: 20,
                fontWeight: 800,
                color:
                  status === "won" ? "#22c55e" : "rgba(0,0,0,0.85)",
                fontFamily:
                  'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
                letterSpacing: "-0.02em",
              }}
            >
              ${payout.toLocaleString()}
            </span>
          </div>

          {/* ─── Status badges ─── */}
          {status === "won" && (
            <AnimatePresence>
              {showWinner && (
                <motion.div
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{
                    type: "spring",
                    stiffness: 300,
                    damping: 15,
                    mass: 0.8,
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    padding: "10px 0",
                    borderRadius: 10,
                    backgroundColor: "rgba(34,197,94,0.08)",
                    border: "1px solid rgba(34,197,94,0.2)",
                    position: "relative",
                    zIndex: 10,
                  }}
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 18 18"
                    fill="none"
                  >
                    <circle
                      cx="9"
                      cy="9"
                      r="8"
                      stroke="#22c55e"
                      strokeWidth="1.5"
                    />
                    <path
                      d="M5.5 9L8 11.5L12.5 6.5"
                      stroke="#22c55e"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: 900,
                      letterSpacing: "0.2em",
                      color: "#22c55e",
                      textTransform: "uppercase",
                    }}
                  >
                    Winner
                  </span>
                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: 800,
                      color: "#22c55e",
                      fontFamily:
                        'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
                    }}
                  >
                    +${payout.toLocaleString()}
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
          )}

          {status === "pending" && (
            <motion.div
              animate={{ opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                padding: "10px 0",
                marginTop: 8,
              }}
            >
              <div
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  backgroundColor: "#facc15",
                }}
              />
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  letterSpacing: "0.1em",
                  color: "rgba(0,0,0,0.45)",
                  textTransform: "uppercase",
                }}
              >
                In Progress...
              </span>
            </motion.div>
          )}

          {status === "lost" && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                padding: "10px 0",
                borderRadius: 10,
                backgroundColor: "rgba(239,68,68,0.06)",
                border: "1px solid rgba(239,68,68,0.15)",
              }}
            >
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 900,
                  letterSpacing: "0.2em",
                  color: "rgba(239,68,68,0.7)",
                  textTransform: "uppercase",
                }}
              >
                Lost
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ─── Perforated bottom edge ─── */}
      <div
        style={{
          height: 12,
          background: "#FFFFFF",
          borderRadius: "0 0 16px 16px",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: -4,
            left: 12,
            right: 12,
            height: 8,
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          {Array.from({ length: 20 }, (_, i) => (
            <div
              key={i}
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                backgroundColor: "#FAFAF7",
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
