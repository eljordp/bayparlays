"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Logo } from "@/app/components/Logo";
import { NavUser } from "@/app/components/NavUser";
import { useAuth } from "@/app/components/AuthProvider";
import {
  ChevronDown,
  ChevronUp,
  Menu,
  X,
  BarChart3,
  Trophy,
  DollarSign,
  Hash,
  Flame,
  Zap,
  Clock,
  Lock,
  Loader2,
} from "lucide-react";

/* ─── Types ─── */

type Category = "ev" | "payout" | "confidence";

interface Streak {
  type: "W" | "L";
  count: number;
}

interface Stats {
  totalBets: number;
  won: number;
  lost: number;
  pending: number;
  winRate: number;
  totalProfit: number;
  totalWagered: number;
  roi: number;
  currentStreak: Streak;
  bestPayout: number;
  bestProfit: number;
  last7Days: { won: number; lost: number; profit: number };
}

interface SportBreakdown {
  sport: string;
  won: number;
  lost: number;
  winRate: number;
}

interface CategoryBreakdown {
  category: Category;
  won: number;
  lost: number;
  winRate: number;
}

interface RecentBet {
  id: string;
  created_at: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  legs: any[];
  combined_odds: string;
  combined_decimal?: number;
  status: string;
  stake: number;
  payout: number;
  profit: number;
  category: Category | null;
}

// Implied hit probability from combined decimal odds
function impliedHitRate(decimalOdds: number | undefined): number | null {
  if (!decimalOdds || decimalOdds <= 1) return null;
  return Math.round((1 / decimalOdds) * 10000) / 100;
}

interface MyStatsData {
  stats: Stats;
  sportBreakdown: SportBreakdown[];
  categoryBreakdown: CategoryBreakdown[];
  recentBets: RecentBet[];
}

/* ─── Category meta ─── */

const CATEGORY_META: Record<
  Category,
  { label: string; color: string; bg: string; border: string }
> = {
  ev: {
    label: "Best EV",
    color: "#22C55E",
    bg: "rgba(34,197,94,0.10)",
    border: "rgba(34,197,94,0.20)",
  },
  payout: {
    label: "Highest Payout",
    color: "#FF3B3B",
    bg: "rgba(255,59,59,0.10)",
    border: "rgba(255,59,59,0.20)",
  },
  confidence: {
    label: "Most Confident",
    color: "#60A5FA",
    bg: "rgba(96,165,250,0.10)",
    border: "rgba(96,165,250,0.20)",
  },
};

/* ─── Helpers ─── */

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatMoney(n: number): string {
  const abs = Math.abs(n);
  const formatted = abs >= 1000 ? `${(abs / 1000).toFixed(1)}K` : abs.toFixed(0);
  if (n > 0) return `+$${formatted}`;
  if (n < 0) return `-$${formatted}`;
  return "$0";
}

function statusColor(status: string): { text: string; bg: string; border: string } {
  const s = status.toLowerCase();
  if (s === "won" || s === "win")
    return { text: "#22c55e", bg: "rgba(34,197,94,0.1)", border: "rgba(34,197,94,0.25)" };
  if (s === "lost" || s === "loss")
    return { text: "#ef4444", bg: "rgba(239,68,68,0.1)", border: "rgba(239,68,68,0.25)" };
  return { text: "#eab308", bg: "rgba(234,179,8,0.08)", border: "rgba(234,179,8,0.2)" };
}

/* ─── Nav Links ─── */

const NAV_LINKS = [
  { href: "/parlays", label: "Parlays" },
  { href: "/odds", label: "Odds" },
  { href: "/builder", label: "Builder" },
  { href: "/results", label: "Results" },
  { href: "/simulator", label: "Simulator" },
  { href: "/my-stats", label: "My Stats" },
];

/* ─── Page ─── */

export default function MyStatsPage() {
  const { user, loading: authLoading } = useAuth();

  const [data, setData] = useState<MyStatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [expandedBet, setExpandedBet] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchStats = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetch(`/api/my-stats?user_id=${user.id}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Failed to fetch stats");
      const json: MyStatsData = await res.json();
      setData(json);
      setLastUpdated(new Date());
      setError(null);
    } catch {
      setError("Unable to load your track record.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  async function refreshStats() {
    if (refreshing || !user) return;
    setRefreshing(true);
    try {
      await fetch("/api/sim/resolve", { cache: "no-store" }).catch(() => null);
      await fetchStats();
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    if (!user) return;
    // First paint: show whatever's in the DB immediately, then
    // kick off a resolver run so stale `pending` sim bets get flipped.
    fetchStats();
    fetch("/api/sim/resolve", { cache: "no-store" })
      .then(() => fetchStats())
      .catch(() => null);
  }, [user, fetchStats]);

  /* ─── Auth/Locked states ─── */

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-white/30 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-[#ededed] flex flex-col items-center justify-center px-6">
        <Lock className="w-10 h-10 text-white/20 mb-6" />
        <h1
          className="text-3xl md:text-4xl mb-4 text-center"
          style={{ fontFamily: "'DM Serif Display', serif" }}
        >
          Sign in to view your track record
        </h1>
        <p className="text-white/40 mb-8 text-center max-w-md">
          Your sim bets, resolved against real scores. See how you&apos;re trending.
        </p>
        <Link
          href="/login"
          className="bg-[#FF3B3B] text-[#0a0a0a] px-8 py-3 text-sm font-semibold rounded-full hover:bg-[#FF5252] transition-colors"
        >
          Sign In
        </Link>
      </div>
    );
  }

  const stats = data?.stats;
  const sportBreakdown = data?.sportBreakdown ?? [];
  const categoryBreakdown = data?.categoryBreakdown ?? [];
  const recentBets = data?.recentBets ?? [];
  const maxSportWinRate = Math.max(...sportBreakdown.map((s) => s.winRate), 1);
  const maxCategoryWinRate = Math.max(
    ...categoryBreakdown.map((c) => c.winRate),
    1,
  );

  return (
    <div className="min-h-screen" style={{ background: "#0a0a0a" }}>
      {/* ─── Nav ─── */}
      <nav
        className="fixed top-0 left-0 right-0 z-50"
        style={{
          background: "rgba(10,10,10,0.85)",
          backdropFilter: "blur(20px)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <div className="max-w-[1400px] mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-10">
            <Link href="/" className="flex items-center">
              <Logo />
            </Link>
            <div className="hidden md:flex items-center gap-8">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-sm transition-colors duration-200"
                  style={{
                    color:
                      link.href === "/my-stats"
                        ? "#FF3B3B"
                        : "rgba(255,255,255,0.5)",
                    fontWeight: link.href === "/my-stats" ? 600 : 400,
                  }}
                  onMouseEnter={(e) => {
                    if (link.href !== "/my-stats")
                      e.currentTarget.style.color = "rgba(255,255,255,0.9)";
                  }}
                  onMouseLeave={(e) => {
                    if (link.href !== "/my-stats")
                      e.currentTarget.style.color = "rgba(255,255,255,0.5)";
                  }}
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <NavUser />
            <button
              className="md:hidden flex items-center justify-center w-10 h-10 rounded-lg transition-colors duration-200"
              style={{ color: "rgba(255,255,255,0.7)" }}
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>

        {/* Mobile dropdown */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="md:hidden overflow-hidden"
              style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
            >
              <div className="px-6 py-4 flex flex-col gap-1">
                {NAV_LINKS.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className="py-3 px-4 rounded-lg text-sm font-medium transition-colors duration-150"
                    style={{
                      color:
                        link.href === "/my-stats"
                          ? "#FF3B3B"
                          : "rgba(255,255,255,0.6)",
                      background:
                        link.href === "/my-stats"
                          ? "rgba(255,59,59,0.08)"
                          : "transparent",
                    }}
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>

      {/* ─── Header ─── */}
      <header className="pt-28 pb-8 px-4 md:pt-36 md:pb-14 md:px-6">
        <div className="max-w-[1400px] mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <h1
              className="text-5xl md:text-7xl font-normal leading-[1.05] mb-5"
              style={{
                fontFamily: "'DM Serif Display', serif",
                color: "#ededed",
              }}
            >
              My Track Record
            </h1>
            <p
              className="text-lg md:text-xl max-w-2xl"
              style={{ color: "rgba(255,255,255,0.45)", lineHeight: 1.6 }}
            >
              Your sim bets, resolved against real scores.
            </p>
            <div className="mt-4 flex items-center gap-3 flex-wrap">
              <button
                onClick={refreshStats}
                disabled={refreshing}
                className="text-xs font-semibold px-4 py-2 rounded-full transition-all disabled:opacity-50"
                style={{
                  background: refreshing
                    ? "rgba(255,59,59,0.08)"
                    : "rgba(255,59,59,0.12)",
                  color: "#FF3B3B",
                  border: "1px solid rgba(255,59,59,0.25)",
                }}
              >
                {refreshing ? "Refreshing…" : "Refresh Now"}
              </button>
              <span
                className="text-xs uppercase tracking-widest"
                style={{ color: "rgba(255,255,255,0.25)" }}
              >
                {lastUpdated
                  ? `Updated ${lastUpdated.toLocaleTimeString("en-US", {
                      hour: "numeric",
                      minute: "2-digit",
                    })}`
                  : "Updated in real-time"}
              </span>
            </div>
          </motion.div>
        </div>
      </header>

      {/* ─── Main Content ─── */}
      <main className="px-4 pb-20 md:px-6 md:pb-32">
        <div className="max-w-[1400px] mx-auto">
          <AnimatePresence mode="wait">
            {/* Loading */}
            {loading && (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <StatsSkeletons />
                <div className="mt-16">
                  <BarSkeletons />
                </div>
                <div className="mt-16 space-y-3">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <BetRowSkeleton key={i} />
                  ))}
                </div>
              </motion.div>
            )}

            {/* Error */}
            {!loading && error && (
              <motion.div
                key="error"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="flex flex-col items-center justify-center py-32"
              >
                <div
                  className="w-20 h-20 rounded-2xl flex items-center justify-center mb-6"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  <BarChart3
                    size={32}
                    style={{ color: "rgba(255,255,255,0.2)" }}
                  />
                </div>
                <p
                  className="text-xl font-medium mb-2"
                  style={{ color: "rgba(255,255,255,0.6)" }}
                >
                  {error}
                </p>
                <p
                  className="text-sm"
                  style={{ color: "rgba(255,255,255,0.3)" }}
                >
                  Try refreshing.
                </p>
              </motion.div>
            )}

            {/* Empty state — no bets yet */}
            {!loading && !error && data && stats && stats.totalBets === 0 && (
              <motion.div
                key="empty"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="flex flex-col items-center justify-center py-32"
              >
                <div
                  className="w-20 h-20 rounded-2xl flex items-center justify-center mb-6"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  <BarChart3
                    size={32}
                    style={{ color: "rgba(255,255,255,0.2)" }}
                  />
                </div>
                <p
                  className="text-xl font-medium mb-2"
                  style={{ color: "rgba(255,255,255,0.6)" }}
                >
                  No sim bets yet.
                </p>
                <p
                  className="text-sm mb-6"
                  style={{ color: "rgba(255,255,255,0.3)" }}
                >
                  Place your first one in the Simulator.
                </p>
                <Link
                  href="/simulator"
                  className="text-xs font-semibold px-4 py-2 rounded-full transition-all"
                  style={{
                    background: "rgba(255,59,59,0.12)",
                    color: "#FF3B3B",
                    border: "1px solid rgba(255,59,59,0.25)",
                  }}
                >
                  Go to Simulator
                </Link>
              </motion.div>
            )}

            {/* Data loaded */}
            {!loading && !error && data && stats && stats.totalBets > 0 && (
              <motion.div
                key="content"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                {/* ─── Stats Dashboard ─── */}
                <motion.div
                  className="grid grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4"
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.1 }}
                >
                  <StatCard
                    icon={<Flame size={16} />}
                    label="Current Streak"
                    value={`${stats.currentStreak.type}${stats.currentStreak.count}`}
                    valueColor={
                      stats.currentStreak.type === "W" ? "#22c55e" : "#ef4444"
                    }
                    sublabel={
                      stats.currentStreak.count === 0
                        ? "No resolved bets"
                        : stats.currentStreak.type === "W"
                        ? "Winning"
                        : "Losing"
                    }
                    delay={0}
                  />
                  <StatCard
                    icon={<Trophy size={16} />}
                    label="Win Rate"
                    value={`${stats.winRate.toFixed(1)}%`}
                    valueColor={stats.winRate >= 50 ? "#22c55e" : "#ef4444"}
                    sublabel={`${stats.won}W - ${stats.lost}L`}
                    delay={0.05}
                  />
                  <StatCard
                    icon={<Clock size={16} />}
                    label="Last 7 Days"
                    value={`${stats.last7Days.won}-${stats.last7Days.lost}`}
                    valueColor={
                      stats.last7Days.won >= stats.last7Days.lost
                        ? "#22c55e"
                        : "#ef4444"
                    }
                    sublabel={formatMoney(stats.last7Days.profit)}
                    delay={0.1}
                  />
                  <StatCard
                    icon={<Hash size={16} />}
                    label="Total Bets"
                    value={String(stats.totalBets)}
                    valueColor="#ededed"
                    sublabel={`${stats.pending} pending`}
                    delay={0.15}
                  />
                  <StatCard
                    icon={<DollarSign size={16} />}
                    label="Total Profit"
                    value={formatMoney(stats.totalProfit)}
                    valueColor={
                      stats.totalProfit >= 0 ? "#22c55e" : "#ef4444"
                    }
                    sublabel={`${stats.roi >= 0 ? "+" : ""}${stats.roi.toFixed(
                      1,
                    )}% ROI`}
                    delay={0.2}
                  />
                  <StatCard
                    icon={<Zap size={16} />}
                    label="Best Payout"
                    value={`$${stats.bestPayout.toLocaleString(undefined, {
                      maximumFractionDigits: 0,
                    })}`}
                    valueColor="#FF3B3B"
                    sublabel={`${formatMoney(stats.bestProfit)} profit`}
                    delay={0.25}
                  />
                </motion.div>

                {/* ─── Sport Breakdown ─── */}
                {sportBreakdown.length > 0 && (
                  <motion.div
                    className="mt-16 md:mt-20"
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.3 }}
                  >
                    <h2
                      className="text-2xl md:text-3xl mb-8"
                      style={{
                        fontFamily: "'DM Serif Display', serif",
                        color: "#ededed",
                      }}
                    >
                      By Sport
                    </h2>
                    <div className="space-y-4">
                      {sportBreakdown.map((sport, idx) => (
                        <motion.div
                          key={sport.sport}
                          className="flex items-center gap-4 md:gap-6"
                          initial={{ opacity: 0, x: -12 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{
                            duration: 0.4,
                            delay: 0.35 + idx * 0.06,
                          }}
                        >
                          <div
                            className="w-16 md:w-20 text-sm font-semibold flex-shrink-0"
                            style={{ color: "rgba(255,255,255,0.7)" }}
                          >
                            {sport.sport}
                          </div>
                          <div
                            className="text-xs flex-shrink-0 w-16 text-right"
                            style={{
                              color: "rgba(255,255,255,0.35)",
                              fontFamily: "var(--font-geist-mono)",
                            }}
                          >
                            {sport.won}-{sport.lost}
                          </div>
                          <div
                            className="flex-1 h-7 rounded overflow-hidden"
                            style={{ background: "rgba(255,255,255,0.04)" }}
                          >
                            <motion.div
                              className="h-full rounded"
                              initial={{ width: 0 }}
                              animate={{
                                width: `${
                                  (sport.winRate / maxSportWinRate) * 100
                                }%`,
                              }}
                              transition={{
                                duration: 0.8,
                                delay: 0.4 + idx * 0.06,
                                ease: "easeOut",
                              }}
                              style={{
                                background:
                                  sport.winRate >= 50
                                    ? "linear-gradient(90deg, #FF3B3B, #FF5252)"
                                    : "linear-gradient(90deg, rgba(255,59,59,0.4), rgba(255,59,59,0.6))",
                                minWidth: "2px",
                              }}
                            />
                          </div>
                          <div
                            className="w-14 text-right text-sm font-bold flex-shrink-0"
                            style={{
                              color:
                                sport.winRate >= 50 ? "#22c55e" : "#ef4444",
                              fontFamily: "var(--font-geist-mono)",
                            }}
                          >
                            {sport.winRate.toFixed(0)}%
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </motion.div>
                )}

                {/* ─── Category Breakdown ─── */}
                {categoryBreakdown.length > 0 && (
                  <motion.div
                    className="mt-16 md:mt-20"
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.35 }}
                  >
                    <h2
                      className="text-2xl md:text-3xl mb-8"
                      style={{
                        fontFamily: "'DM Serif Display', serif",
                        color: "#ededed",
                      }}
                    >
                      By Category
                    </h2>
                    <div className="space-y-4">
                      {categoryBreakdown.map((cat, idx) => {
                        const meta = CATEGORY_META[cat.category];
                        return (
                          <motion.div
                            key={cat.category}
                            className="flex items-center gap-4 md:gap-6"
                            initial={{ opacity: 0, x: -12 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{
                              duration: 0.4,
                              delay: 0.4 + idx * 0.06,
                            }}
                          >
                            <div
                              className="w-28 md:w-36 text-sm font-semibold flex-shrink-0"
                              style={{ color: meta.color }}
                            >
                              {meta.label}
                            </div>
                            <div
                              className="text-xs flex-shrink-0 w-16 text-right"
                              style={{
                                color: "rgba(255,255,255,0.35)",
                                fontFamily: "var(--font-geist-mono)",
                              }}
                            >
                              {cat.won}-{cat.lost}
                            </div>
                            <div
                              className="flex-1 h-7 rounded overflow-hidden"
                              style={{ background: "rgba(255,255,255,0.04)" }}
                            >
                              <motion.div
                                className="h-full rounded"
                                initial={{ width: 0 }}
                                animate={{
                                  width: `${
                                    (cat.winRate / maxCategoryWinRate) * 100
                                  }%`,
                                }}
                                transition={{
                                  duration: 0.8,
                                  delay: 0.45 + idx * 0.06,
                                  ease: "easeOut",
                                }}
                                style={{
                                  background: `linear-gradient(90deg, ${meta.color}, ${meta.color}cc)`,
                                  minWidth: "2px",
                                }}
                              />
                            </div>
                            <div
                              className="w-14 text-right text-sm font-bold flex-shrink-0"
                              style={{
                                color:
                                  cat.winRate >= 50 ? "#22c55e" : "#ef4444",
                                fontFamily: "var(--font-geist-mono)",
                              }}
                            >
                              {cat.winRate.toFixed(0)}%
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  </motion.div>
                )}

                {/* ─── Recent Bets Feed ─── */}
                <motion.div
                  className="mt-16 md:mt-20"
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.4 }}
                >
                  <h2
                    className="text-2xl md:text-3xl mb-3"
                    style={{
                      fontFamily: "'DM Serif Display', serif",
                      color: "#ededed",
                    }}
                  >
                    Recent Bets
                  </h2>
                  <p
                    className="text-xs mb-8 max-w-2xl"
                    style={{ color: "rgba(255,255,255,0.35)", lineHeight: 1.6 }}
                  >
                    <span className="font-semibold" style={{ color: "rgba(255,255,255,0.55)" }}>Hit %</span> = the book&apos;s implied probability this parlay cashes.
                    A +500 parlay hits ~17% of the time, +100 hits ~50%. Chasing high hit rates with juiced favorites is a trap — the book&apos;s vig grinds you down. Look for picks where the AI&apos;s estimate exceeds the book&apos;s.
                  </p>

                  {/* Table header - desktop */}
                  <div
                    className="hidden md:grid items-center gap-4 px-6 py-3 text-xs uppercase tracking-wider font-medium"
                    style={{
                      gridTemplateColumns:
                        "140px 80px 90px 70px 90px 100px 40px",
                      color: "rgba(255,255,255,0.25)",
                      borderBottom: "1px solid rgba(255,255,255,0.06)",
                    }}
                  >
                    <span>Date</span>
                    <span className="text-center">Legs</span>
                    <span className="text-right">Odds</span>
                    <span className="text-right">Stake</span>
                    <span className="text-center">Status</span>
                    <span className="text-right">Profit</span>
                    <span />
                  </div>

                  <div className="space-y-1">
                    {recentBets.map((bet, idx) => {
                      const sc = statusColor(bet.status);
                      const isExpanded = expandedBet === bet.id;
                      const catMeta = bet.category
                        ? CATEGORY_META[bet.category]
                        : null;

                      return (
                        <motion.div
                          key={bet.id}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{
                            duration: 0.3,
                            delay: 0.45 + idx * 0.03,
                          }}
                        >
                          {/* Row */}
                          <button
                            onClick={() =>
                              setExpandedBet(isExpanded ? null : bet.id)
                            }
                            className="w-full text-left transition-colors duration-150 rounded-lg"
                            style={{
                              background: isExpanded
                                ? "rgba(255,255,255,0.03)"
                                : "transparent",
                            }}
                            onMouseEnter={(e) => {
                              if (!isExpanded)
                                e.currentTarget.style.background =
                                  "rgba(255,255,255,0.02)";
                            }}
                            onMouseLeave={(e) => {
                              if (!isExpanded)
                                e.currentTarget.style.background = "transparent";
                            }}
                          >
                            {/* Desktop row */}
                            <div
                              className="hidden md:grid items-center gap-4 px-6 py-4"
                              style={{
                                gridTemplateColumns:
                                  "140px 80px 90px 70px 90px 100px 40px",
                              }}
                            >
                              <div>
                                <div
                                  className="text-sm"
                                  style={{ color: "rgba(255,255,255,0.7)" }}
                                >
                                  {formatDate(bet.created_at)}
                                </div>
                                <div
                                  className="text-xs mt-0.5"
                                  style={{ color: "rgba(255,255,255,0.25)" }}
                                >
                                  {formatTime(bet.created_at)}
                                </div>
                              </div>
                              <div className="flex items-center justify-center gap-1.5">
                                <span
                                  className="text-sm font-medium"
                                  style={{
                                    color: "rgba(255,255,255,0.6)",
                                    fontFamily: "var(--font-geist-mono)",
                                  }}
                                >
                                  {bet.legs.length}
                                </span>
                                {catMeta && (
                                  <span
                                    className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                                    style={{
                                      color: catMeta.color,
                                      background: catMeta.bg,
                                      border: `1px solid ${catMeta.border}`,
                                    }}
                                  >
                                    {bet.category === "ev"
                                      ? "EV"
                                      : bet.category === "payout"
                                      ? "PAY"
                                      : "CONF"}
                                  </span>
                                )}
                              </div>
                              <div
                                className="text-sm text-right font-semibold"
                                style={{
                                  color: "#FF3B3B",
                                  fontFamily: "var(--font-geist-mono)",
                                }}
                              >
                                {bet.combined_odds}
                                {impliedHitRate(bet.combined_decimal) != null && (
                                  <div
                                    className="text-[10px] font-normal mt-0.5"
                                    style={{ color: "rgba(255,255,255,0.3)" }}
                                  >
                                    {impliedHitRate(bet.combined_decimal)!.toFixed(1)}% hit
                                  </div>
                                )}
                              </div>
                              <div
                                className="text-sm text-right font-medium"
                                style={{
                                  color: "rgba(255,255,255,0.5)",
                                  fontFamily: "var(--font-geist-mono)",
                                }}
                              >
                                ${bet.stake}
                              </div>
                              <div className="flex justify-center">
                                <span
                                  className="text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full"
                                  style={{
                                    color: sc.text,
                                    background: sc.bg,
                                    border: `1px solid ${sc.border}`,
                                  }}
                                >
                                  {bet.status}
                                </span>
                              </div>
                              <div
                                className="text-sm text-right font-bold"
                                style={{
                                  color:
                                    bet.profit > 0
                                      ? "#22c55e"
                                      : bet.profit < 0
                                      ? "#ef4444"
                                      : "rgba(255,255,255,0.4)",
                                  fontFamily: "var(--font-geist-mono)",
                                }}
                              >
                                {bet.status === "pending"
                                  ? "--"
                                  : bet.profit > 0
                                  ? `+$${Math.abs(bet.profit).toLocaleString(
                                      undefined,
                                      { maximumFractionDigits: 2 },
                                    )}`
                                  : bet.profit < 0
                                  ? `-$${Math.abs(bet.profit).toLocaleString(
                                      undefined,
                                      { maximumFractionDigits: 2 },
                                    )}`
                                  : "$0"}
                              </div>
                              <div
                                className="flex justify-end"
                                style={{ color: "rgba(255,255,255,0.25)" }}
                              >
                                {isExpanded ? (
                                  <ChevronUp size={16} />
                                ) : (
                                  <ChevronDown size={16} />
                                )}
                              </div>
                            </div>

                            {/* Mobile row */}
                            <div className="md:hidden px-4 py-4">
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span
                                    className="text-xs font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full"
                                    style={{
                                      color: sc.text,
                                      background: sc.bg,
                                      border: `1px solid ${sc.border}`,
                                    }}
                                  >
                                    {bet.status}
                                  </span>
                                  {catMeta && (
                                    <span
                                      className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                                      style={{
                                        color: catMeta.color,
                                        background: catMeta.bg,
                                        border: `1px solid ${catMeta.border}`,
                                      }}
                                    >
                                      {catMeta.label}
                                    </span>
                                  )}
                                  <span
                                    className="text-xs"
                                    style={{ color: "rgba(255,255,255,0.3)" }}
                                  >
                                    {formatDate(bet.created_at)}
                                  </span>
                                </div>
                                <div style={{ color: "rgba(255,255,255,0.25)" }}>
                                  {isExpanded ? (
                                    <ChevronUp size={16} />
                                  ) : (
                                    <ChevronDown size={16} />
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                  <div>
                                    <span
                                      className="text-xs"
                                      style={{
                                        color: "rgba(255,255,255,0.3)",
                                      }}
                                    >
                                      {bet.legs.length} legs
                                    </span>
                                    <span
                                      className="mx-2"
                                      style={{
                                        color: "rgba(255,255,255,0.1)",
                                      }}
                                    >
                                      |
                                    </span>
                                    <span
                                      className="text-sm font-semibold"
                                      style={{
                                        color: "#FF3B3B",
                                        fontFamily: "var(--font-geist-mono)",
                                      }}
                                    >
                                      {bet.combined_odds}
                                    </span>
                                    {impliedHitRate(bet.combined_decimal) != null && (
                                      <span
                                        className="text-[10px] ml-2"
                                        style={{
                                          color: "rgba(255,255,255,0.3)",
                                          fontFamily: "var(--font-geist-mono)",
                                        }}
                                      >
                                        ({impliedHitRate(bet.combined_decimal)!.toFixed(1)}%)
                                      </span>
                                    )}
                                    <span
                                      className="mx-2"
                                      style={{
                                        color: "rgba(255,255,255,0.1)",
                                      }}
                                    >
                                      |
                                    </span>
                                    <span
                                      className="text-xs"
                                      style={{
                                        color: "rgba(255,255,255,0.4)",
                                        fontFamily: "var(--font-geist-mono)",
                                      }}
                                    >
                                      ${bet.stake}
                                    </span>
                                  </div>
                                </div>
                                <span
                                  className="text-sm font-bold"
                                  style={{
                                    color:
                                      bet.profit > 0
                                        ? "#22c55e"
                                        : bet.profit < 0
                                        ? "#ef4444"
                                        : "rgba(255,255,255,0.4)",
                                    fontFamily: "var(--font-geist-mono)",
                                  }}
                                >
                                  {bet.status === "pending"
                                    ? "--"
                                    : bet.profit > 0
                                    ? `+$${Math.abs(bet.profit).toLocaleString(
                                        undefined,
                                        { maximumFractionDigits: 2 },
                                      )}`
                                    : bet.profit < 0
                                    ? `-$${Math.abs(bet.profit).toLocaleString(
                                        undefined,
                                        { maximumFractionDigits: 2 },
                                      )}`
                                    : "$0"}
                                </span>
                              </div>
                            </div>
                          </button>

                          {/* Expanded legs */}
                          <AnimatePresence>
                            {isExpanded && (
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: "auto" }}
                                exit={{ opacity: 0, height: 0 }}
                                transition={{ duration: 0.25 }}
                                className="overflow-hidden"
                              >
                                <div
                                  className="mx-4 md:mx-6 mb-3 rounded-xl overflow-hidden"
                                  style={{
                                    background: "rgba(255,255,255,0.02)",
                                    border: "1px solid rgba(255,255,255,0.05)",
                                  }}
                                >
                                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                                  {bet.legs.map((leg: any, li: number) => (
                                    <div
                                      key={li}
                                      className="flex items-center justify-between px-4 md:px-6 py-3"
                                      style={{
                                        borderBottom:
                                          li < bet.legs.length - 1
                                            ? "1px solid rgba(255,255,255,0.04)"
                                            : "none",
                                      }}
                                    >
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                          {leg.sport && (
                                            <span
                                              className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded"
                                              style={{
                                                background:
                                                  "rgba(255,59,59,0.08)",
                                                color: "#FF3B3B",
                                                border:
                                                  "1px solid rgba(255,59,59,0.15)",
                                              }}
                                            >
                                              {leg.sport}
                                            </span>
                                          )}
                                          <span
                                            className="text-xs truncate"
                                            style={{
                                              color: "rgba(255,255,255,0.4)",
                                            }}
                                          >
                                            {leg.game || leg.matchup || ""}
                                          </span>
                                        </div>
                                        <div
                                          className="text-sm font-medium mt-1"
                                          style={{ color: "#ededed" }}
                                        >
                                          {leg.pick || leg.selection || ""}
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-4 flex-shrink-0">
                                        {leg.odds !== undefined &&
                                          leg.odds !== null && (
                                            <span
                                              className="text-sm font-bold"
                                              style={{
                                                color: "#FF3B3B",
                                                fontFamily:
                                                  "var(--font-geist-mono)",
                                              }}
                                            >
                                              {typeof leg.odds === "number"
                                                ? leg.odds > 0
                                                  ? `+${leg.odds}`
                                                  : leg.odds
                                                : leg.odds}
                                            </span>
                                          )}
                                      </div>
                                    </div>
                                  ))}

                                  {/* Payout row */}
                                  {bet.payout > 0 && (
                                    <div
                                      className="flex items-center justify-between px-4 md:px-6 py-3"
                                      style={{
                                        borderTop:
                                          "1px solid rgba(255,255,255,0.06)",
                                        background: "rgba(255,255,255,0.01)",
                                      }}
                                    >
                                      <span
                                        className="text-xs uppercase tracking-wider"
                                        style={{
                                          color: "rgba(255,255,255,0.3)",
                                        }}
                                      >
                                        Potential Payout
                                      </span>
                                      <span
                                        className="text-sm font-bold"
                                        style={{
                                          color: "#ededed",
                                          fontFamily: "var(--font-geist-mono)",
                                        }}
                                      >
                                        $
                                        {bet.payout.toLocaleString(undefined, {
                                          maximumFractionDigits: 2,
                                        })}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </motion.div>
                      );
                    })}
                  </div>

                  {recentBets.length === 0 && (
                    <div className="py-16 text-center">
                      <Clock
                        size={28}
                        style={{
                          color: "rgba(255,255,255,0.15)",
                          margin: "0 auto 12px",
                        }}
                      />
                      <p
                        className="text-sm"
                        style={{ color: "rgba(255,255,255,0.3)" }}
                      >
                        No sim bets yet. Place your first one in the Simulator.
                      </p>
                    </div>
                  )}
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* ─── Footer ─── */}
      <footer
        className="px-6 py-12"
        style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
      >
        <div className="max-w-[1400px] mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm" style={{ color: "rgba(255,255,255,0.25)" }}>
            BayParlays. AI-powered parlay optimization.
          </p>
          <p className="text-xs" style={{ color: "rgba(255,255,255,0.15)" }}>
            Sim bets use simulated money only. No real bets are placed.
          </p>
        </div>
      </footer>
    </div>
  );
}

/* ─── Stat Card ─── */

function StatCard({
  icon,
  label,
  value,
  valueColor,
  sublabel,
  delay,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueColor: string;
  sublabel: string;
  delay: number;
}) {
  return (
    <motion.div
      className="rounded-xl p-5 md:p-6"
      style={{
        background: "rgba(255,255,255,0.025)",
        border: "1px solid rgba(255,255,255,0.06)",
      }}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.15 + delay }}
      whileHover={{
        borderColor: "rgba(255,255,255,0.12)",
        transition: { duration: 0.2 },
      }}
    >
      <div className="flex items-center gap-2 mb-4">
        <div style={{ color: "rgba(255,255,255,0.3)" }}>{icon}</div>
        <span
          className="text-xs uppercase tracking-wider font-medium"
          style={{ color: "rgba(255,255,255,0.35)" }}
        >
          {label}
        </span>
      </div>
      <div
        className="text-3xl md:text-4xl font-bold tracking-tight"
        style={{ color: valueColor, fontFamily: "var(--font-geist-mono)" }}
      >
        {value}
      </div>
      <div className="text-xs mt-2" style={{ color: "rgba(255,255,255,0.2)" }}>
        {sublabel}
      </div>
    </motion.div>
  );
}

/* ─── Skeletons ─── */

function StatsSkeletons() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div
          key={i}
          className="rounded-xl p-5 md:p-6 animate-pulse"
          style={{
            background: "rgba(255,255,255,0.025)",
            border: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <div
            className="w-20 h-3 rounded mb-4"
            style={{ background: "rgba(255,255,255,0.06)" }}
          />
          <div
            className="w-24 h-9 rounded mb-2"
            style={{ background: "rgba(255,255,255,0.08)" }}
          />
          <div
            className="w-16 h-3 rounded"
            style={{ background: "rgba(255,255,255,0.04)" }}
          />
        </div>
      ))}
    </div>
  );
}

function BarSkeletons() {
  return (
    <div className="space-y-4">
      <div
        className="w-24 h-7 rounded mb-6"
        style={{ background: "rgba(255,255,255,0.06)" }}
      />
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="flex items-center gap-4 animate-pulse">
          <div
            className="w-16 h-4 rounded"
            style={{ background: "rgba(255,255,255,0.06)" }}
          />
          <div
            className="w-12 h-4 rounded"
            style={{ background: "rgba(255,255,255,0.04)" }}
          />
          <div
            className="flex-1 h-7 rounded"
            style={{ background: "rgba(255,255,255,0.03)" }}
          />
          <div
            className="w-10 h-4 rounded"
            style={{ background: "rgba(255,255,255,0.05)" }}
          />
        </div>
      ))}
    </div>
  );
}

function BetRowSkeleton() {
  return (
    <div className="flex items-center gap-4 px-6 py-4 animate-pulse">
      <div
        className="w-28 h-5 rounded"
        style={{ background: "rgba(255,255,255,0.05)" }}
      />
      <div
        className="w-8 h-5 rounded"
        style={{ background: "rgba(255,255,255,0.04)" }}
      />
      <div
        className="w-16 h-5 rounded"
        style={{ background: "rgba(255,255,255,0.05)" }}
      />
      <div
        className="w-12 h-5 rounded"
        style={{ background: "rgba(255,255,255,0.04)" }}
      />
      <div
        className="w-16 h-6 rounded-full"
        style={{ background: "rgba(255,255,255,0.05)" }}
      />
      <div className="flex-1" />
      <div
        className="w-16 h-5 rounded"
        style={{ background: "rgba(255,255,255,0.05)" }}
      />
    </div>
  );
}
