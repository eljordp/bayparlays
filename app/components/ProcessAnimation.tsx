"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState, useCallback } from "react";

/* ─── Demo data ─── */

const SPORTSBOOKS = [
  "DraftKings",
  "FanDuel",
  "BetMGM",
  "Caesars",
  "PointsBet",
  "BetRivers",
  "Hard Rock",
  "ESPN BET",
  "Fliff",
  "Bet365",
  "WynnBET",
  "SuperBook",
];

const MATCHUPS = [
  {
    game: "LAL vs BOS",
    sport: "NBA",
    books: [
      { name: "DraftKings", odds: -110 },
      { name: "FanDuel", odds: -105 },
      { name: "BetMGM", odds: -108 },
    ],
    bestIdx: 1,
    pick: "BOS -3.5",
  },
  {
    game: "NYY vs HOU",
    sport: "MLB",
    books: [
      { name: "Caesars", odds: +145 },
      { name: "DraftKings", odds: +138 },
      { name: "FanDuel", odds: +152 },
    ],
    bestIdx: 2,
    pick: "NYY ML",
  },
  {
    game: "KC vs BUF",
    sport: "NFL",
    books: [
      { name: "BetMGM", odds: +120 },
      { name: "ESPN BET", odds: +115 },
      { name: "Bet365", odds: +128 },
    ],
    bestIdx: 2,
    pick: "BUF +1.5",
  },
];

const FINAL_PICKS = [
  { sport: "NBA", pick: "BOS -3.5", odds: -105 },
  { sport: "MLB", pick: "NYY ML", odds: +152 },
  { sport: "NFL", pick: "BUF +1.5", odds: +128 },
];

/* ─── Helpers ─── */

function formatOdds(odds: number): string {
  return odds > 0 ? `+${odds}` : `${odds}`;
}

/* ─── Phase components ─── */

function PhaseScanning({
  highlightIdx,
  progress,
}: {
  highlightIdx: number;
  progress: number;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Sportsbook pills grid */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 6,
          justifyContent: "center",
        }}
      >
        {SPORTSBOOKS.map((book, i) => {
          const isActive = i === highlightIdx;
          return (
            <motion.div
              key={book}
              animate={{
                backgroundColor: isActive
                  ? "rgba(255,59,59,0.15)"
                  : "rgba(255,255,255,0.04)",
                borderColor: isActive
                  ? "rgba(255,59,59,0.4)"
                  : "rgba(255,255,255,0.06)",
                scale: isActive ? 1.05 : 1,
              }}
              transition={{ duration: 0.15 }}
              style={{
                padding: "5px 10px",
                borderRadius: 6,
                border: "1px solid rgba(255,255,255,0.06)",
                fontSize: 10,
                fontWeight: 600,
                color: isActive ? "#FF3B3B" : "rgba(255,255,255,0.35)",
                letterSpacing: "0.02em",
              }}
            >
              {book}
            </motion.div>
          );
        })}
      </div>

      {/* Floating odds background */}
      <div
        style={{
          position: "relative",
          height: 50,
          overflow: "hidden",
          maskImage:
            "linear-gradient(to bottom, transparent, black 20%, black 80%, transparent)",
          WebkitMaskImage:
            "linear-gradient(to bottom, transparent, black 20%, black 80%, transparent)",
        }}
      >
        <motion.div
          animate={{ y: [-20, -60] }}
          transition={{ duration: 2, ease: "linear" }}
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "4px 12px",
            justifyContent: "center",
            fontFamily:
              'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
            fontSize: 10,
            color: "rgba(255,255,255,0.08)",
            lineHeight: 1.8,
          }}
        >
          {Array.from({ length: 40 }, (_, i) => {
            const odds = [
              -110, +150, -105, +220, -115, +180, -102, +135, +310, -108,
            ];
            return (
              <span key={i}>{formatOdds(odds[i % odds.length])}</span>
            );
          })}
        </motion.div>
      </div>

      {/* Progress bar */}
      <div
        style={{
          height: 3,
          backgroundColor: "rgba(255,255,255,0.04)",
          borderRadius: 2,
          overflow: "hidden",
        }}
      >
        <motion.div
          style={{
            height: "100%",
            width: `${progress}%`,
            background: "linear-gradient(90deg, #FF3B3B, #ff6b6b)",
            borderRadius: 2,
          }}
        />
      </div>
    </div>
  );
}

function PhaseAnalyzing({
  revealedRows,
  highlightBest,
}: {
  revealedRows: number;
  highlightBest: boolean;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {MATCHUPS.map((matchup, i) => {
        if (i >= revealedRows) return null;
        return (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            style={{
              backgroundColor: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(255,255,255,0.05)",
              borderRadius: 10,
              padding: "10px 14px",
            }}
          >
            {/* Game header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 8,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  style={{
                    fontSize: 8,
                    fontWeight: 800,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    color: "rgba(255,59,59,0.6)",
                    backgroundColor: "rgba(255,59,59,0.06)",
                    padding: "2px 6px",
                    borderRadius: 3,
                    fontFamily:
                      'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
                  }}
                >
                  {matchup.sport}
                </span>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "rgba(255,255,255,0.7)",
                  }}
                >
                  {matchup.game}
                </span>
              </div>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: "rgba(255,255,255,0.25)",
                }}
              >
                {matchup.pick}
              </span>
            </div>

            {/* Odds row */}
            <div style={{ display: "flex", gap: 6 }}>
              {matchup.books.map((book, j) => {
                const isBest = highlightBest && j === matchup.bestIdx;
                return (
                  <motion.div
                    key={j}
                    animate={{
                      backgroundColor: isBest
                        ? "rgba(255,59,59,0.12)"
                        : "rgba(255,255,255,0.03)",
                      borderColor: isBest
                        ? "rgba(255,59,59,0.3)"
                        : "rgba(255,255,255,0.04)",
                    }}
                    transition={{ duration: 0.3 }}
                    style={{
                      flex: 1,
                      padding: "6px 8px",
                      borderRadius: 6,
                      border: "1px solid rgba(255,255,255,0.04)",
                      textAlign: "center",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 8,
                        color: "rgba(255,255,255,0.2)",
                        marginBottom: 2,
                        letterSpacing: "0.05em",
                      }}
                    >
                      {book.name}
                    </div>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        fontFamily:
                          'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
                        color: isBest ? "#FF3B3B" : "rgba(255,255,255,0.4)",
                      }}
                    >
                      {formatOdds(book.odds)}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

function PhaseBuilding({ lockedLegs }: { lockedLegs: number }) {
  return (
    <div
      style={{
        backgroundColor: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 14,
        padding: 16,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {FINAL_PICKS.map((pick, i) => {
          if (i >= lockedLegs) return null;
          return (
            <motion.div
              key={i}
              initial={{ x: 30, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{
                type: "spring",
                stiffness: 400,
                damping: 20,
              }}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "9px 12px",
                borderRadius: 8,
                backgroundColor: "rgba(255,255,255,0.02)",
              }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: 10 }}
              >
                {/* Locked checkmark */}
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{
                    type: "spring",
                    stiffness: 500,
                    damping: 15,
                    delay: 0.1,
                  }}
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: "50%",
                    backgroundColor: "rgba(255,59,59,0.12)",
                    border: "1.5px solid rgba(255,59,59,0.3)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path
                      d="M2 5L4.5 7.5L8 3"
                      stroke="#FF3B3B"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </motion.div>

                <div>
                  <span
                    style={{
                      fontSize: 8,
                      fontWeight: 700,
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      color: "rgba(255,255,255,0.25)",
                      marginRight: 6,
                    }}
                  >
                    {pick.sport}
                  </span>
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: "rgba(255,255,255,0.85)",
                    }}
                  >
                    {pick.pick}
                  </span>
                </div>
              </div>

              <span
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: "#FF3B3B",
                  fontFamily:
                    'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
                }}
              >
                {formatOdds(pick.odds)}
              </span>
            </motion.div>
          );
        })}
      </div>

      {/* Combined odds */}
      {lockedLegs >= 3 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
          style={{
            marginTop: 14,
            paddingTop: 12,
            borderTop: "1px solid rgba(255,255,255,0.06)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span
            style={{
              fontSize: 10,
              fontWeight: 500,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.25)",
            }}
          >
            Combined
          </span>
          <motion.span
            initial={{ scale: 0.5 }}
            animate={{ scale: 1 }}
            transition={{
              type: "spring",
              stiffness: 300,
              damping: 12,
            }}
            style={{
              fontSize: 22,
              fontWeight: 900,
              color: "#FF3B3B",
              fontFamily:
                'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
              letterSpacing: "-0.02em",
            }}
          >
            +487
          </motion.span>
        </motion.div>
      )}
    </div>
  );
}

function PhaseWinner({ countUp }: { countUp: number }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        paddingTop: 20,
      }}
    >
      {/* Flash ring */}
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: [0.8, 1.1, 1], opacity: [0, 1, 1] }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        style={{
          width: 80,
          height: 80,
          borderRadius: "50%",
          border: "3px solid rgba(34,197,94,0.3)",
          backgroundColor: "rgba(34,197,94,0.06)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
          <motion.path
            d="M10 18L16 24L26 12"
            stroke="#22c55e"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.4, delay: 0.2 }}
          />
        </svg>
      </motion.div>

      {/* WINNER text */}
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{
          type: "spring",
          stiffness: 300,
          damping: 15,
          delay: 0.2,
        }}
        style={{
          fontSize: 18,
          fontWeight: 900,
          letterSpacing: "0.25em",
          color: "#22c55e",
          textTransform: "uppercase",
        }}
      >
        Winner
      </motion.div>

      {/* Payout counter */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        style={{
          fontSize: 36,
          fontWeight: 900,
          fontFamily:
            'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
          color: "#22c55e",
          letterSpacing: "-0.02em",
        }}
      >
        ${countUp.toLocaleString()}
      </motion.div>

      {/* Subtitle */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
        style={{
          fontSize: 11,
          color: "rgba(255,255,255,0.25)",
          letterSpacing: "0.08em",
        }}
      >
        from $100 wager
      </motion.div>

      {/* Green glow pulse */}
      <motion.div
        animate={{
          boxShadow: [
            "0 0 0px rgba(34,197,94,0)",
            "0 0 60px rgba(34,197,94,0.15)",
            "0 0 0px rgba(34,197,94,0)",
          ],
        }}
        transition={{ duration: 1.5, ease: "easeInOut" }}
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: 20,
          pointerEvents: "none",
        }}
      />
    </div>
  );
}

/* ─── Header labels ─── */

const PHASE_LABELS: Record<number, string> = {
  0: "Scanning 12+ sportsbooks...",
  1: "Finding +EV edges...",
  2: "Parlay locked",
  3: "Winner",
};

const PHASE_DOTS: Record<number, string> = {
  0: "rgba(255,59,59,0.5)",
  1: "rgba(255,59,59,0.5)",
  2: "rgba(255,59,59,0.8)",
  3: "rgba(34,197,94,0.8)",
};

/* ─── Main Component ─── */

export function ProcessAnimation() {
  const [phase, setPhase] = useState(0);

  // Phase-specific state
  const [scanIdx, setScanIdx] = useState(0);
  const [scanProgress, setScanProgress] = useState(0);
  const [analyzeRows, setAnalyzeRows] = useState(0);
  const [analyzeBest, setAnalyzeBest] = useState(false);
  const [buildLegs, setBuildLegs] = useState(0);
  const [winCountUp, setWinCountUp] = useState(100);

  const resetAll = useCallback(() => {
    setScanIdx(0);
    setScanProgress(0);
    setAnalyzeRows(0);
    setAnalyzeBest(false);
    setBuildLegs(0);
    setWinCountUp(100);
  }, []);

  // Phase timer — advance every 2 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setPhase((prev) => {
        const next = (prev + 1) % 4;
        if (next === 0) resetAll();
        return next;
      });
    }, 2000);

    return () => clearInterval(interval);
  }, [resetAll]);

  // Per-phase micro-animations
  useEffect(() => {
    if (phase === 0) {
      // Scanning: cycle through sportsbooks rapidly
      const scanInterval = setInterval(() => {
        setScanIdx((prev) => (prev + 1) % SPORTSBOOKS.length);
        setScanProgress((prev) => Math.min(prev + 5, 100));
      }, 120);
      return () => clearInterval(scanInterval);
    }

    if (phase === 1) {
      // Analyzing: reveal rows then highlight
      const t1 = setTimeout(() => setAnalyzeRows(1), 200);
      const t2 = setTimeout(() => setAnalyzeRows(2), 500);
      const t3 = setTimeout(() => setAnalyzeRows(3), 800);
      const t4 = setTimeout(() => setAnalyzeBest(true), 1200);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
        clearTimeout(t4);
      };
    }

    if (phase === 2) {
      // Building: slide legs in
      const t1 = setTimeout(() => setBuildLegs(1), 200);
      const t2 = setTimeout(() => setBuildLegs(2), 600);
      const t3 = setTimeout(() => setBuildLegs(3), 1000);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
      };
    }

    if (phase === 3) {
      // Winner: count up
      const target = 587;
      const steps = 20;
      const stepTime = 50;
      let step = 0;
      const countInterval = setInterval(() => {
        step++;
        const progress = Math.min(step / steps, 1);
        // Ease out
        const eased = 1 - Math.pow(1 - progress, 3);
        setWinCountUp(Math.round(100 + (target - 100) * eased));
        if (step >= steps) clearInterval(countInterval);
      }, stepTime);
      return () => clearInterval(countInterval);
    }
  }, [phase]);

  return (
    <div
      style={{
        width: "100%",
        maxWidth: 400,
        height: 500,
        borderRadius: 20,
        backgroundColor: "#0c0c0c",
        border: "1px solid rgba(255,255,255,0.06)",
        overflow: "hidden",
        position: "relative",
        fontFamily: "system-ui, -apple-system, sans-serif",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* ─── Subtle background glow ─── */}
      <div
        style={{
          position: "absolute",
          top: "-20%",
          right: "-20%",
          width: 300,
          height: 300,
          background:
            "radial-gradient(circle, rgba(255,59,59,0.04) 0%, transparent 70%)",
          borderRadius: "50%",
          pointerEvents: "none",
        }}
      />

      {/* ─── Header ─── */}
      <div
        style={{
          padding: "20px 22px 16px",
          borderBottom: "1px solid rgba(255,255,255,0.04)",
        }}
      >
        {/* Top row: BayParlays branding + step indicator */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 14,
          }}
        >
          <span
            style={{
              fontSize: 13,
              fontWeight: 800,
              letterSpacing: "-0.01em",
              color: "rgba(255,255,255,0.15)",
            }}
          >
            Bay
            <span style={{ color: "rgba(255,59,59,0.3)" }}>Parlays</span>
          </span>

          {/* Step dots */}
          <div style={{ display: "flex", gap: 4 }}>
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  backgroundColor:
                    i <= phase
                      ? PHASE_DOTS[phase]
                      : "rgba(255,255,255,0.06)",
                  transition: "background-color 0.3s ease",
                }}
              />
            ))}
          </div>
        </div>

        {/* Phase label */}
        <AnimatePresence mode="wait">
          <motion.div
            key={phase}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <motion.div
              animate={{
                scale: [1, 1.3, 1],
                opacity: [0.6, 1, 0.6],
              }}
              transition={{
                duration: 1,
                repeat: Infinity,
                ease: "easeInOut",
              }}
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                backgroundColor: PHASE_DOTS[phase],
              }}
            />
            <span
              style={{
                fontSize: 14,
                fontWeight: 700,
                color:
                  phase === 3
                    ? "#22c55e"
                    : "rgba(255,255,255,0.75)",
              }}
            >
              {PHASE_LABELS[phase]}
            </span>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ─── Phase content ─── */}
      <div
        style={{
          flex: 1,
          padding: "16px 22px 22px",
          overflow: "hidden",
          position: "relative",
        }}
      >
        <AnimatePresence mode="wait">
          {phase === 0 && (
            <motion.div
              key="scanning"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <PhaseScanning
                highlightIdx={scanIdx}
                progress={scanProgress}
              />
            </motion.div>
          )}

          {phase === 1 && (
            <motion.div
              key="analyzing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <PhaseAnalyzing
                revealedRows={analyzeRows}
                highlightBest={analyzeBest}
              />
            </motion.div>
          )}

          {phase === 2 && (
            <motion.div
              key="building"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <PhaseBuilding lockedLegs={buildLegs} />
            </motion.div>
          )}

          {phase === 3 && (
            <motion.div
              key="winner"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              style={{ height: "100%", position: "relative" }}
            >
              <PhaseWinner countUp={winCountUp} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
