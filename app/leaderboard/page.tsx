"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { AppNav } from "@/app/components/AppNav";
import { ResultsTabs } from "@/app/components/ResultsTabs";
import { useAuth } from "@/app/components/AuthProvider";
import { Lock, Trophy, Crown, Medal } from "lucide-react";

/* ─── Types ─── */

interface LeaderboardEntry {
  userId: string;
  displayName: string;
  profit: number;
  roi: number;
  winRate: number;
  wins: number;
  losses: number;
  totalWagered: number;
}

/* ─── Helpers ─── */

function formatCurrency(n: number): string {
  const prefix = n < 0 ? "-" : "+";
  return n === 0 ? "$0" : `${prefix}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function rankAccent(rank: number): { color: string; bg: string; border: string; label: string } {
  if (rank === 1) return { color: "#fbbf24", bg: "rgba(251,191,36,0.08)", border: "rgba(251,191,36,0.25)", label: "Gold" };
  if (rank === 2) return { color: "#94a3b8", bg: "rgba(148,163,184,0.06)", border: "rgba(148,163,184,0.2)", label: "Silver" };
  if (rank === 3) return { color: "#d97706", bg: "rgba(217,119,6,0.06)", border: "rgba(217,119,6,0.2)", label: "Bronze" };
  return { color: "rgba(0,0,0,0.4)", bg: "transparent", border: "rgba(0,0,0,0.06)", label: "" };
}

function RankIcon({ rank }: { rank: number }) {
  if (rank === 1) return <Crown size={16} style={{ color: "#fbbf24" }} />;
  if (rank === 2) return <Medal size={16} style={{ color: "#94a3b8" }} />;
  if (rank === 3) return <Medal size={16} style={{ color: "#d97706" }} />;
  return <span className="text-xs font-mono" style={{ color: "rgba(0,0,0,0.4)" }}>#{rank}</span>;
}

/* ─── Component ─── */

export default function LeaderboardPage() {
  const { user, loading: authLoading, tier } = useAuth();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const isVipOrAdmin = tier === "vip" || tier === "admin" || tier === "owner";

  useEffect(() => {
    if (!user || !isVipOrAdmin) return;

    async function fetchLeaderboard() {
      try {
        const res = await fetch("/api/leaderboard");
        const data = await res.json();
        setEntries(data.leaderboard || []);
      } catch {
        // Silent fail
      } finally {
        setLoading(false);
      }
    }

    fetchLeaderboard();
  }, [user, isVipOrAdmin]);

  // Find logged-in user's rank
  const userRankIndex = entries.findIndex((e) => e.userId === user?.id);
  const userEntry = userRankIndex >= 0 ? entries[userRankIndex] : null;
  const userRank = userRankIndex >= 0 ? userRankIndex + 1 : null;

  // Auth loading
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#FAFAF7" }}>
        <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: "rgba(0,0,0,0.25)", borderTopColor: "transparent" }} />
      </div>
    );
  }

  // Not signed in
  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6" style={{ background: "#FAFAF7" }}>
        <div
          className="w-20 h-20 rounded-2xl flex items-center justify-center mb-6"
          style={{ background: "rgba(0,0,0,0.04)", border: "1px solid rgba(0,0,0,0.08)" }}
        >
          <Lock size={32} style={{ color: "rgba(0,0,0,0.3)" }} />
        </div>
        <h2
          className="text-3xl mb-3"
          style={{ fontFamily: "'DM Serif Display', serif", color: "#0a0a0a" }}
        >
          Sign in to view the leaderboard
        </h2>
        <p className="text-sm mb-8" style={{ color: "rgba(0,0,0,0.45)" }}>
          See how you stack up against the competition.
        </p>
        <Link
          href="/login"
          className="px-8 py-3 text-sm font-semibold rounded-full transition-colors duration-200"
          style={{ background: "#0a0a0a", color: "#FFFFFF" }}
        >
          Sign In
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: "#FAFAF7" }}>
      <AppNav />
      <div className="pt-20">
        <ResultsTabs />
      </div>

      {/* ─── VIP Gate ─── */}
      {!isVipOrAdmin ? (
        <div className="pt-10 px-4 md:pt-16 md:px-6">
          <div className="max-w-[1100px] mx-auto">
            <motion.div
              className="text-center mb-12"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <div
                className="w-20 h-20 rounded-2xl flex items-center justify-center mb-6 mx-auto"
                style={{ background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.18)" }}
              >
                <Trophy size={36} style={{ color: "#fbbf24" }} />
              </div>
              <h1
                className="text-4xl md:text-6xl mb-4"
                style={{ fontFamily: "'DM Serif Display', serif", color: "#0a0a0a" }}
              >
                Leaderboard
              </h1>
              <p className="text-base md:text-lg mb-3 max-w-2xl mx-auto" style={{ color: "rgba(0,0,0,0.55)", lineHeight: 1.6 }}>
                Where every VIP&apos;s sim record stacks against the rest. Rankings reset weekly and update as games settle.
              </p>
              <p className="text-sm max-w-2xl mx-auto" style={{ color: "rgba(0,0,0,0.4)", lineHeight: 1.6 }}>
                You see your sim record on{" "}
                <Link href="/my-stats" className="underline" style={{ color: "rgba(0,0,0,0.6)" }}>My Stats</Link>.
                The leaderboard is the same data — graded against everyone else.
              </p>
            </motion.div>

            {/* Preview — what you see when you unlock */}
            <motion.div
              className="rounded-2xl p-6 md:p-8 mb-10"
              style={{
                background: "#FFFFFF",
                border: "1px solid rgba(0,0,0,0.08)",
              }}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.15 }}
            >
              <div
                className="text-[11px] uppercase tracking-widest mb-5 font-semibold"
                style={{ color: "rgba(251,191,36,0.9)" }}
              >
                What you see when you unlock
              </div>
              <div className="grid md:grid-cols-2 gap-5">
                <RankCriteria
                  label="Sim ROI"
                  description="Profit divided by total wagered. The ranking metric — a $200 profit on $400 wagered (50% ROI) outranks a $500 profit on $5,000 wagered (10%)."
                />
                <RankCriteria
                  label="Win Rate"
                  description="How often your bets cash. Shown alongside ROI but doesn't drive ranking — parlays at high odds can be profitable below 30%."
                />
                <RankCriteria
                  label="Total Profit"
                  description="Net sim dollars won. Big number, but volume-biased — high rollers can lead on profit while losing on ROI."
                />
                <RankCriteria
                  label="W / L Record"
                  description="Bets won and lost in sim. Color-coded so you can scan who's hot, who's cold, who's grinding."
                />
              </div>
            </motion.div>

            <motion.div
              className="text-center pb-12"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4, delay: 0.3 }}
            >
              <Link
                href="/subscribe"
                className="inline-block px-10 py-3.5 text-sm font-semibold rounded-full transition-all duration-200"
                style={{ background: "#0a0a0a", color: "#FFFFFF" }}
              >
                Upgrade to VIP
              </Link>
              <p className="text-xs mt-4" style={{ color: "rgba(0,0,0,0.35)" }}>
                Includes priority picks, advanced analytics, Discord, and Remotion cards.
              </p>
            </motion.div>
          </div>
        </div>
      ) : (
        <>
          {/* ─── Header ─── */}
          <header className="pt-10 pb-8 px-4 md:pt-14 md:pb-14 md:px-6">
            <div className="max-w-[1400px] mx-auto">
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
                <h1
                  className="text-5xl md:text-7xl font-normal leading-[1.05] mb-5"
                  style={{ fontFamily: "'DM Serif Display', serif", color: "#0a0a0a" }}
                >
                  Leaderboard
                </h1>
                <p
                  className="text-lg md:text-xl max-w-2xl"
                  style={{ color: "rgba(0,0,0,0.5)", lineHeight: 1.6 }}
                >
                  Top sim performers this week. Ranked by <strong style={{ color: "#0a0a0a" }}>Sim ROI</strong> — profit divided by total wagered. ROI rewards efficiency, not just volume.
                </p>
                <div
                  className="mt-5 flex items-center gap-2 flex-wrap text-[11px] uppercase tracking-widest"
                  style={{ color: "rgba(0,0,0,0.4)" }}
                >
                  <span
                    className="px-2.5 py-1 rounded-full"
                    style={{ background: "rgba(0,0,0,0.04)", border: "1px solid rgba(0,0,0,0.08)" }}
                  >
                    All VIPs
                  </span>
                  <span style={{ color: "rgba(0,0,0,0.25)" }}>·</span>
                  <Link
                    href="/my-stats"
                    className="px-2.5 py-1 rounded-full transition-colors hover:bg-black/5"
                    style={{ border: "1px solid rgba(0,0,0,0.08)" }}
                  >
                    Your sim record &rarr;
                  </Link>
                  <span style={{ color: "rgba(0,0,0,0.25)" }}>·</span>
                  <Link
                    href="/results"
                    className="px-2.5 py-1 rounded-full transition-colors hover:bg-black/5"
                    style={{ border: "1px solid rgba(0,0,0,0.08)" }}
                  >
                    AI Track Record &rarr;
                  </Link>
                </div>
              </motion.div>
            </div>
          </header>

          {/* ─── Table ─── */}
          <main className="px-4 pb-20 md:px-6 md:pb-32">
            <div className="max-w-[1400px] mx-auto">
              {loading ? (
                <TableSkeleton />
              ) : entries.length === 0 ? (
                <motion.div
                  className="text-center py-20"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.5 }}
                >
                  <Trophy size={48} style={{ color: "rgba(255,255,255,0.1)", margin: "0 auto 16px" }} />
                  <p className="text-lg" style={{ color: "rgba(0,0,0,0.4)", fontFamily: "'DM Serif Display', serif" }}>
                    No sim data yet
                  </p>
                  <p className="text-sm mt-2" style={{ color: "rgba(0,0,0,0.3)" }}>
                    Start placing sim bets to appear on the leaderboard.
                  </p>
                </motion.div>
              ) : (
                <>
                  {/* Desktop Table */}
                  <div className="hidden md:block">
                    <div
                      className="rounded-xl overflow-hidden"
                      style={{ border: "1px solid rgba(0,0,0,0.06)" }}
                    >
                      {/* Header Row */}
                      <div
                        className="grid grid-cols-[60px_1fr_100px_100px_120px_120px] px-6 py-4"
                        style={{ background: "#FFFFFF", borderBottom: "1px solid rgba(0,0,0,0.06)" }}
                      >
                        <span className="text-[11px] uppercase tracking-wider font-medium" style={{ color: "rgba(0,0,0,0.4)" }}>Rank</span>
                        <span className="text-[11px] uppercase tracking-wider font-medium" style={{ color: "rgba(0,0,0,0.4)" }}>User</span>
                        <span className="text-[11px] uppercase tracking-wider font-medium text-right" style={{ color: "rgba(0,0,0,0.4)" }}>Sim ROI</span>
                        <span className="text-[11px] uppercase tracking-wider font-medium text-right" style={{ color: "rgba(0,0,0,0.4)" }}>Win Rate</span>
                        <span className="text-[11px] uppercase tracking-wider font-medium text-right" style={{ color: "rgba(0,0,0,0.4)" }}>Total Profit</span>
                        <span className="text-[11px] uppercase tracking-wider font-medium text-right" style={{ color: "rgba(0,0,0,0.4)" }}>W / L</span>
                      </div>

                      {/* Rows */}
                      {entries.map((entry, idx) => {
                        const rank = idx + 1;
                        const accent = rankAccent(rank);
                        const isUser = entry.userId === user?.id;

                        return (
                          <motion.div
                            key={entry.userId}
                            className="grid grid-cols-[60px_1fr_100px_100px_120px_120px] px-6 py-4 items-center transition-colors duration-150"
                            style={{
                              background: isUser ? "rgba(0,0,0,0.04)" : rank <= 3 ? accent.bg : "transparent",
                              borderBottom: "1px solid rgba(0,0,0,0.04)",
                              borderLeft: isUser ? "2px solid #0a0a0a" : rank <= 3 ? `2px solid ${accent.color}` : "2px solid transparent",
                            }}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.3, delay: idx * 0.03 }}
                          >
                            <div className="flex items-center gap-2">
                              <RankIcon rank={rank} />
                            </div>
                            <div className="flex items-center gap-3">
                              <span
                                className="text-sm font-mono"
                                style={{ color: isUser ? "#0a0a0a" : rank <= 3 ? accent.color : "rgba(0,0,0,0.6)" }}
                              >
                                {entry.displayName}
                              </span>
                              {isUser && (
                                <span
                                  className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full"
                                  style={{ background: "rgba(0,0,0,0.08)", color: "#0a0a0a", border: "1px solid rgba(0,0,0,0.18)" }}
                                >
                                  You
                                </span>
                              )}
                            </div>
                            <span
                              className="text-sm font-mono text-right font-semibold"
                              style={{ color: entry.roi > 0 ? "#22c55e" : entry.roi < 0 ? "#ef4444" : "rgba(0,0,0,0.45)" }}
                            >
                              {entry.roi > 0 ? "+" : ""}{entry.roi}%
                            </span>
                            <span className="text-sm font-mono text-right" style={{ color: "rgba(0,0,0,0.55)" }}>
                              {entry.winRate}%
                            </span>
                            <span
                              className="text-sm font-mono text-right font-semibold"
                              style={{ color: entry.profit > 0 ? "#22c55e" : entry.profit < 0 ? "#ef4444" : "rgba(0,0,0,0.45)" }}
                            >
                              {formatCurrency(entry.profit)}
                            </span>
                            <span className="text-sm font-mono text-right" style={{ color: "rgba(0,0,0,0.45)" }}>
                              <span style={{ color: "#22c55e" }}>{entry.wins}</span>
                              {" / "}
                              <span style={{ color: "#ef4444" }}>{entry.losses}</span>
                            </span>
                          </motion.div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Mobile Cards */}
                  <div className="md:hidden space-y-3">
                    {entries.map((entry, idx) => {
                      const rank = idx + 1;
                      const accent = rankAccent(rank);
                      const isUser = entry.userId === user?.id;

                      return (
                        <motion.div
                          key={entry.userId}
                          className="rounded-xl p-4"
                          style={{
                            background: isUser ? "rgba(0,0,0,0.04)" : rank <= 3 ? accent.bg : "rgba(0,0,0,0.04)",
                            border: isUser ? "1px solid rgba(0,0,0,0.18)" : `1px solid ${accent.border}`,
                          }}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.3, delay: idx * 0.04 }}
                        >
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-3">
                              <div className="flex items-center justify-center w-8 h-8 rounded-lg" style={{ background: rank <= 3 ? accent.bg : "rgba(0,0,0,0.04)" }}>
                                <RankIcon rank={rank} />
                              </div>
                              <span
                                className="text-sm font-mono"
                                style={{ color: isUser ? "#0a0a0a" : rank <= 3 ? accent.color : "rgba(0,0,0,0.6)" }}
                              >
                                {entry.displayName}
                              </span>
                              {isUser && (
                                <span
                                  className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full"
                                  style={{ background: "rgba(0,0,0,0.08)", color: "#0a0a0a" }}
                                >
                                  You
                                </span>
                              )}
                            </div>
                            <span
                              className="text-base font-mono font-bold"
                              style={{ color: entry.roi > 0 ? "#22c55e" : entry.roi < 0 ? "#ef4444" : "rgba(0,0,0,0.45)" }}
                            >
                              {entry.roi > 0 ? "+" : ""}{entry.roi}%
                            </span>
                          </div>
                          <div className="flex items-center gap-4">
                            <div>
                              <span className="text-[10px] uppercase tracking-wider block mb-0.5" style={{ color: "rgba(0,0,0,0.4)" }}>Win Rate</span>
                              <span className="text-xs font-mono" style={{ color: "rgba(0,0,0,0.55)" }}>{entry.winRate}%</span>
                            </div>
                            <div>
                              <span className="text-[10px] uppercase tracking-wider block mb-0.5" style={{ color: "rgba(0,0,0,0.4)" }}>Profit</span>
                              <span className="text-xs font-mono" style={{ color: entry.profit > 0 ? "#22c55e" : "#ef4444" }}>{formatCurrency(entry.profit)}</span>
                            </div>
                            <div>
                              <span className="text-[10px] uppercase tracking-wider block mb-0.5" style={{ color: "rgba(0,0,0,0.4)" }}>Record</span>
                              <span className="text-xs font-mono" style={{ color: "rgba(0,0,0,0.45)" }}>
                                <span style={{ color: "#22c55e" }}>{entry.wins}</span>
                                {" / "}
                                <span style={{ color: "#ef4444" }}>{entry.losses}</span>
                              </span>
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>

                  {/* ─── Your Rank Section ─── */}
                  {userEntry && userRank && (
                    <motion.div
                      className="mt-12 rounded-xl p-6 md:p-8"
                      style={{
                        background: "rgba(0,0,0,0.04)",
                        border: "1px solid rgba(0,0,0,0.08)",
                      }}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.5, delay: 0.5 }}
                    >
                      <h2
                        className="text-xl md:text-2xl mb-6"
                        style={{ fontFamily: "'DM Serif Display', serif", color: "#0a0a0a" }}
                      >
                        Your Rank
                      </h2>
                      <div className="flex flex-wrap items-center gap-8 md:gap-12">
                        <div>
                          <span className="text-[10px] uppercase tracking-wider block mb-1" style={{ color: "rgba(0,0,0,0.4)" }}>Position</span>
                          <span className="text-3xl font-mono font-bold" style={{ color: "#0a0a0a" }}>#{userRank}</span>
                          <span className="text-sm ml-2" style={{ color: "rgba(0,0,0,0.4)" }}>of {entries.length}</span>
                        </div>
                        <div>
                          <span className="text-[10px] uppercase tracking-wider block mb-1" style={{ color: "rgba(0,0,0,0.4)" }}>ROI</span>
                          <span
                            className="text-2xl font-mono font-bold"
                            style={{ color: userEntry.roi > 0 ? "#22c55e" : "#ef4444" }}
                          >
                            {userEntry.roi > 0 ? "+" : ""}{userEntry.roi}%
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] uppercase tracking-wider block mb-1" style={{ color: "rgba(0,0,0,0.4)" }}>Win Rate</span>
                          <span className="text-2xl font-mono" style={{ color: "rgba(0,0,0,0.6)" }}>{userEntry.winRate}%</span>
                        </div>
                        <div>
                          <span className="text-[10px] uppercase tracking-wider block mb-1" style={{ color: "rgba(0,0,0,0.4)" }}>Total Profit</span>
                          <span
                            className="text-2xl font-mono font-bold"
                            style={{ color: userEntry.profit > 0 ? "#22c55e" : "#ef4444" }}
                          >
                            {formatCurrency(userEntry.profit)}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] uppercase tracking-wider block mb-1" style={{ color: "rgba(0,0,0,0.4)" }}>Record</span>
                          <span className="text-2xl font-mono" style={{ color: "rgba(0,0,0,0.45)" }}>
                            <span style={{ color: "#22c55e" }}>{userEntry.wins}</span>
                            {" / "}
                            <span style={{ color: "#ef4444" }}>{userEntry.losses}</span>
                          </span>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {!userEntry && (
                    <motion.div
                      className="mt-12 rounded-xl p-6 md:p-8 text-center"
                      style={{
                        background: "rgba(0,0,0,0.04)",
                        border: "1px solid rgba(0,0,0,0.06)",
                      }}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.5, delay: 0.5 }}
                    >
                      <p className="text-base" style={{ color: "rgba(0,0,0,0.45)" }}>
                        You haven&apos;t placed any sim bets yet.
                      </p>
                      <Link
                        href="/simulator"
                        className="inline-block mt-4 px-8 py-3 text-sm font-semibold rounded-full transition-colors duration-200"
                        style={{ background: "#0a0a0a", color: "#FFFFFF" }}
                      >
                        Start Simulating
                      </Link>
                    </motion.div>
                  )}
                </>
              )}
            </div>
          </main>
        </>
      )}

      {/* ─── Footer ─── */}
      <footer className="px-6 py-12" style={{ borderTop: "1px solid rgba(0,0,0,0.06)" }}>
        <div className="max-w-[1400px] mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm" style={{ color: "rgba(0,0,0,0.4)" }}>
            BayParlays. AI-powered parlay optimization.
          </p>
          <div className="flex items-center gap-6">
            <Link href="/terms" className="text-xs transition-colors duration-200" style={{ color: "rgba(0,0,0,0.3)" }}>
              Terms
            </Link>
            <Link href="/privacy" className="text-xs transition-colors duration-200" style={{ color: "rgba(0,0,0,0.3)" }}>
              Privacy
            </Link>
            <p className="text-xs" style={{ color: "rgba(0,0,0,0.25)" }}>
              Not financial advice. Gamble responsibly.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ─── Pre-unlock criteria card ─── */

function RankCriteria({ label, description }: { label: string; description: string }) {
  return (
    <div className="flex items-start gap-3">
      <div
        className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center mt-0.5"
        style={{ background: "rgba(0,0,0,0.04)", border: "1px solid rgba(0,0,0,0.08)" }}
      >
        <Trophy size={13} style={{ color: "rgba(0,0,0,0.5)" }} />
      </div>
      <div className="flex-1">
        <div className="text-sm font-semibold mb-1" style={{ color: "#0a0a0a" }}>
          {label}
        </div>
        <div className="text-xs leading-relaxed" style={{ color: "rgba(0,0,0,0.55)" }}>
          {description}
        </div>
      </div>
    </div>
  );
}

/* ─── Skeleton ─── */

function TableSkeleton() {
  return (
    <div className="space-y-2">
      {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
        <div
          key={i}
          className="h-14 rounded-lg animate-pulse"
          style={{ background: "#FFFFFF", opacity: 1 - i * 0.08 }}
        />
      ))}
    </div>
  );
}
