"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { AppNav } from "@/app/components/AppNav";
import { ResultsTabs } from "@/app/components/ResultsTabs";
import { StatCard, StatCardSkeleton } from "@/app/components/StatCard";
import {
  ChevronDown,
  ChevronUp,
  BarChart3,
  Trophy,
  DollarSign,
  Hash,
  Flame,
  Zap,
  Clock,
  TrendingUp,
} from "lucide-react";

/* ─── Types ─── */

interface Streak {
  type: "W" | "L";
  count: number;
}

type ParlayCategory = "ev" | "payout" | "confidence";

interface Stats {
  totalParlays: number;
  won: number;
  lost: number;
  pending: number;
  winRate: number;
  totalProfit: number;
  roi: number;
  unitStake?: number;
  profitAtUnit?: number;
  stakedAtUnit?: number;
  bestPayoutAtUnit?: number;
  currentStreak: Streak;
  bestPayout: number;
  last7Days: { won: number; lost: number; profit: number; profitAtUnit?: number };
  resolvedSample?: number;
  smallSample?: boolean;
  avgClv?: number | null;
  clvSample?: number;
}

interface SportBreakdown {
  sport: string;
  won: number;
  lost: number;
  winRate: number;
}

interface CategoryBreakdown {
  category: ParlayCategory;
  won: number;
  lost: number;
  winRate: number;
}

interface MarketBreakdown {
  market: string;
  won: number;
  lost: number;
  winRate: number;
}

// Tier breakdown — hit rate + ROI for cumulative top-N tiers across history.
// The curve from Top 3 → All 1000 is the truthful answer to "is the AI's
// confidence ranking real?" — if the gap is wide, the ranking has signal.
interface TierBreakdown {
  tier: number;
  sample: number;
  won: number;
  lost: number;
  winRate: number;
  profit: number;
  roi: number;
}

interface RecentParlay {
  id: string;
  created_at: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  legs: any[];
  combined_odds: string;
  combined_decimal?: number;
  status: string;
  payout: number;
  profit: number;
  ev_percent: number;
  category?: ParlayCategory | null;
  impliedHitRate?: number | null;
}

interface ResultsData {
  stats: Stats;
  sportBreakdown: SportBreakdown[];
  categoryBreakdown: CategoryBreakdown[];
  marketBreakdown: MarketBreakdown[];
  tierBreakdown?: TierBreakdown[];
  recentParlays: RecentParlay[];
}

const MARKET_LABEL: Record<string, string> = {
  moneyline: "Moneyline",
  spread: "Spread",
  total: "Totals",
};

const CATEGORY_LABEL: Record<ParlayCategory, string> = {
  ev: "Best EV",
  payout: "Highest Payout",
  confidence: "Most Confident",
};

const CATEGORY_DESC: Record<ParlayCategory, string> = {
  ev: "math-first picks with the biggest edge",
  payout: "longshots hunting the big cash",
  confidence: "safe favorites most likely to hit",
};

/* ─── Helpers ─── */

// Recompute per-bet profit/payout at $10/pick from the parlay's decimal odds —
// the parlays table defaults stakes to $100, so the raw .profit / .payout
// fields read as "+$987" / "-$100" and contradict the page's $10/unit framing.
const TRACK_UNIT_STAKE = 10;

function profitAtUnit(p: {
  status?: string;
  combined_decimal?: number | null;
}): number {
  if (p.status === "won")
    return TRACK_UNIT_STAKE * ((p.combined_decimal ?? 1) - 1);
  if (p.status === "lost") return -TRACK_UNIT_STAKE;
  return 0;
}

function payoutAtUnit(p: { combined_decimal?: number | null }): number {
  return TRACK_UNIT_STAKE * (p.combined_decimal ?? 1);
}

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

/* ─── Component ─── */

export default function ResultsPage() {
  const [data, setData] = useState<ResultsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedParlay, setExpandedParlay] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  async function fetchResults() {
    try {
      const res = await fetch("/api/track/results", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to fetch results");
      const json: ResultsData = await res.json();
      setData(json);
      setLastUpdated(new Date());
      setError(null);
    } catch {
      setError("Unable to load track record.");
    } finally {
      setLoading(false);
    }
  }

  async function refreshResults() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      // Trigger server-side score resolution first, then re-fetch stats.
      await fetch("/api/track/check-scores", { cache: "no-store" }).catch(() => null);
      await fetchResults();
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    // First paint: show whatever's in the DB immediately, then
    // kick off a resolver run so stale `pending` parlays get flipped.
    fetchResults();
    fetch("/api/track/check-scores", { cache: "no-store" })
      .then(() => fetchResults())
      .catch(() => null);
  }, []);

  const stats = data?.stats;
  const sportBreakdown = data?.sportBreakdown ?? [];
  const categoryBreakdown = data?.categoryBreakdown ?? [];
  const marketBreakdown = data?.marketBreakdown ?? [];
  const tierBreakdown = data?.tierBreakdown ?? [];
  const maxCategoryWinRate = Math.max(...categoryBreakdown.map((c) => c.winRate), 1);
  const maxMarketWinRate = Math.max(...marketBreakdown.map((m) => m.winRate), 1);
  const recentParlays = data?.recentParlays ?? [];
  const maxSportWinRate = Math.max(...sportBreakdown.map((s) => s.winRate), 1);

  return (
    <div className="min-h-screen" style={{ background: "#FAFAF7" }}>
      <AppNav />
      <div className="pt-20">
        <ResultsTabs />
      </div>

      {/* ─── Header ─── */}
      <header className="pt-8 pb-8 px-4 md:pt-14 md:pb-14 md:px-6">
        <div className="max-w-[1400px] mx-auto">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <h1
              className="text-5xl md:text-7xl font-normal leading-[1.05] mb-5"
              style={{ fontFamily: "'DM Serif Display', serif", color: "#0a0a0a" }}
            >
              AI Track Record
            </h1>
            <p
              className="text-lg md:text-xl max-w-2xl"
              style={{ color: "rgba(0,0,0,0.5)", lineHeight: 1.6 }}
            >
              Every parlay our AI generated, graded against real game outcomes. Only 5%+ EV parlays tracked. No cherry-picking, no hiding losses.
            </p>
            <div
              className="mt-5 flex items-center gap-2 flex-wrap text-[11px] uppercase tracking-widest"
              style={{ color: "rgba(0,0,0,0.4)" }}
            >
              <span
                className="px-2.5 py-1 rounded-full"
                style={{
                  background: "rgba(0,0,0,0.04)",
                  border: "1px solid rgba(0,0,0,0.08)",
                }}
              >
                AI picks
              </span>
              <span style={{ color: "rgba(0,0,0,0.25)" }}>·</span>
              <Link
                href="/my-stats"
                className="px-2.5 py-1 rounded-full transition-colors hover:bg-black/5"
                style={{ border: "1px solid rgba(0,0,0,0.08)" }}
              >
                Your sim bets &rarr;
              </Link>
              <span style={{ color: "rgba(0,0,0,0.25)" }}>·</span>
              <Link
                href="/leaderboard"
                className="px-2.5 py-1 rounded-full transition-colors hover:bg-black/5"
                style={{ border: "1px solid rgba(0,0,0,0.08)" }}
              >
                Leaderboard &rarr;
              </Link>
            </div>
            {stats?.smallSample && (
              <div
                className="mt-5 inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs"
                style={{
                  background: "rgba(234,179,8,0.08)",
                  border: "1px solid rgba(234,179,8,0.25)",
                  color: "#eab308",
                }}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#eab308" }} />
                Early track record — {stats.resolvedSample ?? 0} resolved {stats.resolvedSample === 1 ? "bet" : "bets"}. Sample too small for real conclusions yet.
              </div>
            )}
            <div className="mt-4 flex items-center gap-3 flex-wrap">
              <button
                onClick={refreshResults}
                disabled={refreshing}
                className="text-xs font-semibold px-4 py-2 rounded-full transition-all disabled:opacity-50"
                style={{
                  background: refreshing ? "rgba(0,0,0,0.06)" : "rgba(0,0,0,0.08)",
                  color: "#0a0a0a",
                  border: "1px solid rgba(0,0,0,0.25)",
                }}
              >
                {refreshing ? "Refreshing…" : "Refresh Now"}
              </button>
              <span className="text-xs uppercase tracking-widest" style={{ color: "rgba(0,0,0,0.4)" }}>
                {lastUpdated
                  ? `Updated ${lastUpdated.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`
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
              <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <StatsSkeletons />
                <div className="mt-16">
                  <BarSkeletons />
                </div>
                <div className="mt-16 space-y-3">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <ParlayRowSkeleton key={i} />
                  ))}
                </div>
              </motion.div>
            )}

            {/* Error / Empty */}
            {!loading && (error || !data) && (
              <motion.div
                key="empty"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="flex flex-col items-center justify-center py-32"
              >
                <div
                  className="w-20 h-20 rounded-2xl flex items-center justify-center mb-6"
                  style={{ background: "rgba(0,0,0,0.04)", border: "1px solid rgba(0,0,0,0.08)" }}
                >
                  <BarChart3 size={32} style={{ color: "rgba(0,0,0,0.3)" }} />
                </div>
                <p className="text-xl font-medium mb-2" style={{ color: "rgba(0,0,0,0.6)" }}>
                  {error || "No tracked parlays yet."}
                </p>
                <p className="text-sm" style={{ color: "rgba(0,0,0,0.4)" }}>
                  Check back soon.
                </p>
              </motion.div>
            )}

            {/* Data loaded */}
            {!loading && !error && data && stats && (() => {
              const profit = stats.profitAtUnit ?? stats.totalProfit;
              const unit = stats.unitStake ?? 10;
              const resolvedCount = stats.won + stats.lost;
              const stakedAtUnit = stats.stakedAtUnit ?? resolvedCount * unit;
              const roiAtUnit = stakedAtUnit > 0 ? (profit / stakedAtUnit) * 100 : 0;
              const profitable = profit > 0;
              const last7Profit = stats.last7Days.profitAtUnit ?? stats.last7Days.profit;
              const last7Profitable = last7Profit > 0;

              return (
              <motion.div key="content" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                {/* ─── Why low WR is fine — the conversion saver ─── */}
                {profitable && (
                  <motion.div
                    className="mb-6 rounded-2xl p-5 md:p-6 flex flex-col md:flex-row items-start gap-4 md:gap-6"
                    style={{
                      background: "rgba(34,197,94,0.06)",
                      border: "1px solid rgba(34,197,94,0.18)",
                    }}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4 }}
                  >
                    <div
                      className="flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center"
                      style={{ background: "rgba(34,197,94,0.12)" }}
                    >
                      <TrendingUp size={20} style={{ color: "#15803d" }} />
                    </div>
                    <div className="flex-1">
                      <div
                        className="text-base md:text-lg font-semibold mb-1"
                        style={{ color: "#0a0a0a" }}
                      >
                        Yes, the win rate is below 50%. We&apos;re still profitable — here&apos;s why.
                      </div>
                      <div
                        className="text-sm leading-relaxed"
                        style={{ color: "rgba(0,0,0,0.65)" }}
                      >
                        Parlays don&apos;t pay 1-to-1. A typical AI parlay pays
                        {" "}<strong style={{ color: "#0a0a0a" }}>3x to 5x</strong>{" "}
                        on a $10 stake, so we only need to hit{" "}
                        <strong style={{ color: "#0a0a0a" }}>~22-25%</strong>{" "}
                        of the time to be profitable. We&apos;re hitting{" "}
                        <strong style={{ color: "#15803d" }}>{stats.winRate.toFixed(1)}%</strong>{" "}
                        and netting{" "}
                        <strong style={{ color: "#15803d" }}>
                          {formatMoney(profit)}
                        </strong>{" "}
                        across {resolvedCount.toLocaleString()} graded parlays at ${unit}/pick.
                        That&apos;s a{" "}
                        <strong style={{ color: "#15803d" }}>
                          {roiAtUnit > 0 ? "+" : ""}{roiAtUnit.toFixed(1)}% ROI
                        </strong>{" "}
                        — money won on every dollar risked.
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* ─── Stats Dashboard ─── */}
                <motion.div
                  className="grid grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4"
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.1 }}
                >
                  <StatCard
                    icon={<DollarSign size={16} />}
                    label="Total Profit"
                    value={formatMoney(profit)}
                    tone={profitable ? "good" : profit < 0 ? "bad" : "muted"}
                    sublabel={`${roiAtUnit >= 0 ? "+" : ""}${roiAtUnit.toFixed(1)}% ROI · $${unit}/pick`}
                    tooltip={`Pure profit if you bet $${unit} on every AI parlay. ROI is profit divided by money risked. Anything positive means the AI beats the book over time.`}
                    delay={0}
                  />
                  <StatCard
                    icon={<Trophy size={16} />}
                    label="Win Rate"
                    value={`${stats.winRate.toFixed(1)}%`}
                    tone={profitable ? "good" : "bad"}
                    sublabel={`${stats.won}W - ${stats.lost}L · break-even ~22%`}
                    tooltip="How often parlays hit. Parlays pay 3-5x, so anything above ~22% is profitable. Single-game bets need 52.4% — parlays are a different math game."
                    delay={0.05}
                  />
                  {typeof stats.avgClv === "number" && (stats.clvSample ?? 0) > 0 && (
                    <StatCard
                      icon={<BarChart3 size={16} />}
                      label="Avg CLV"
                      value={`${stats.avgClv > 0 ? "+" : ""}${stats.avgClv.toFixed(2)}%`}
                      tone={stats.avgClv > 0 ? "good" : "bad"}
                      sublabel={`${stats.clvSample} graded · ${stats.avgClv > 0 ? "beating close" : "losing to close"}`}
                      tooltip="Closing Line Value — how much better our price was vs the line right before tipoff. Positive CLV is the only real proof a model has edge. Pros track this above all else."
                      delay={0.1}
                    />
                  )}
                  <StatCard
                    icon={<Clock size={16} />}
                    label="Last 7 Days"
                    value={`${stats.last7Days.won}-${stats.last7Days.lost}`}
                    tone={last7Profitable ? "good" : last7Profit < 0 ? "bad" : "muted"}
                    sublabel={`${formatMoney(last7Profit)} · recent form`}
                    tooltip="Wins and losses in the last 7 days. Color follows profit, not record — a 3-9 week can still be net positive if the wins paid big."
                    delay={0.15}
                  />
                  <StatCard
                    icon={<Flame size={16} />}
                    label="Current Streak"
                    value={`${stats.currentStreak.type}${stats.currentStreak.count}`}
                    tone="muted"
                    sublabel={
                      stats.currentStreak.type === "W"
                        ? "Winning streak"
                        : "Losing streak · normal in parlay land"
                    }
                    tooltip="Streaks are noise. Parlays cluster — you can lose 5 in a row at +400 odds and still be profitable on the month. Don't read too much into a streak."
                    delay={0.2}
                  />
                  <StatCard
                    icon={<Hash size={16} />}
                    label="Total Parlays"
                    value={stats.totalParlays.toLocaleString()}
                    tone="neutral"
                    sublabel={`${stats.pending} pending · ${resolvedCount.toLocaleString()} graded`}
                    tooltip="Every AI-generated parlay we've tracked. Pending = games still in progress. Graded = result is in and counted in the profit math."
                    delay={0.25}
                  />
                  <StatCard
                    icon={<Zap size={16} />}
                    label="Best Payout"
                    value={`$${(stats.bestPayoutAtUnit ?? stats.bestPayout).toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                    tone="neutral"
                    sublabel={`Top parlay return · $${unit} stake`}
                    tooltip={`The biggest single-parlay payout, scaled to a $${unit} bet. This is the upside on a single ticket — what one big hit looks like.`}
                    delay={0.3}
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
                      style={{ fontFamily: "'DM Serif Display', serif", color: "#0a0a0a" }}
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
                          transition={{ duration: 0.4, delay: 0.35 + idx * 0.06 }}
                        >
                          <div
                            className="w-16 md:w-20 text-sm font-semibold flex-shrink-0"
                            style={{ color: "rgba(0,0,0,0.7)" }}
                          >
                            {sport.sport}
                          </div>
                          <div
                            className="text-xs flex-shrink-0 w-16 text-right"
                            style={{ color: "rgba(0,0,0,0.45)", fontFamily: "var(--font-geist-mono)" }}
                          >
                            {sport.won}-{sport.lost}
                          </div>
                          <div className="flex-1 h-7 rounded overflow-hidden" style={{ background: "rgba(0,0,0,0.04)" }}>
                            <motion.div
                              className="h-full rounded"
                              initial={{ width: 0 }}
                              animate={{ width: `${(sport.winRate / maxSportWinRate) * 100}%` }}
                              transition={{ duration: 0.8, delay: 0.4 + idx * 0.06, ease: "easeOut" }}
                              style={{
                                background: sport.winRate >= 50
                                  ? "linear-gradient(90deg, #0a0a0a, rgba(0,0,0,0.7))"
                                  : "linear-gradient(90deg, rgba(0,0,0,0.3), rgba(0,0,0,0.5))",
                                minWidth: "2px",
                              }}
                            />
                          </div>
                          <div
                            className="w-14 text-right text-sm font-bold flex-shrink-0"
                            style={{
                              color: sport.winRate >= 50 ? "#22c55e" : "#ef4444",
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

                {/* ─── By Category ─── */}
                {categoryBreakdown.length > 0 && (
                  <motion.div
                    className="mt-16 md:mt-20"
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.35 }}
                  >
                    <h2
                      className="text-2xl md:text-3xl mb-3"
                      style={{ fontFamily: "'DM Serif Display', serif", color: "#0a0a0a" }}
                    >
                      By Strategy
                    </h2>
                    <p className="text-xs mb-8 max-w-2xl" style={{ color: "rgba(0,0,0,0.45)", lineHeight: 1.6 }}>
                      Three flavors the AI generates each day. Most Confident hits more often but pays less. Best EV is the math play. Highest Payout is the lottery.
                    </p>
                    <div className="space-y-4">
                      {categoryBreakdown.map((cat, idx) => (
                        <motion.div
                          key={cat.category}
                          className="flex items-center gap-4 md:gap-6"
                          initial={{ opacity: 0, x: -12 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ duration: 0.4, delay: 0.4 + idx * 0.06 }}
                        >
                          <div
                            className="w-28 md:w-36 text-sm font-semibold flex-shrink-0"
                            style={{ color: "rgba(0,0,0,0.7)" }}
                          >
                            {CATEGORY_LABEL[cat.category]}
                            <div className="text-[10px] font-normal mt-0.5" style={{ color: "rgba(0,0,0,0.4)" }}>
                              {CATEGORY_DESC[cat.category]}
                            </div>
                          </div>
                          <div
                            className="text-xs flex-shrink-0 w-16 text-right"
                            style={{ color: "rgba(0,0,0,0.45)", fontFamily: "var(--font-geist-mono)" }}
                          >
                            {cat.won}-{cat.lost}
                          </div>
                          <div className="flex-1 h-7 rounded overflow-hidden" style={{ background: "rgba(0,0,0,0.04)" }}>
                            <motion.div
                              className="h-full rounded"
                              initial={{ width: 0 }}
                              animate={{ width: `${(cat.winRate / maxCategoryWinRate) * 100}%` }}
                              transition={{ duration: 0.8, delay: 0.45 + idx * 0.06, ease: "easeOut" }}
                              style={{
                                background: cat.winRate >= 50
                                  ? "linear-gradient(90deg, #22c55e, #34d399)"
                                  : "linear-gradient(90deg, rgba(0,0,0,0.3), rgba(0,0,0,0.5))",
                                minWidth: "2px",
                              }}
                            />
                          </div>
                          <div
                            className="w-14 text-right text-sm font-bold flex-shrink-0"
                            style={{
                              color: cat.winRate >= 50 ? "#22c55e" : "#ef4444",
                              fontFamily: "var(--font-geist-mono)",
                            }}
                          >
                            {cat.winRate.toFixed(0)}%
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </motion.div>
                )}

                {/* ─── By Market ─── */}
                {marketBreakdown.length > 0 && (
                  <motion.div
                    className="mt-16 md:mt-20"
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.38 }}
                  >
                    <h2
                      className="text-2xl md:text-3xl mb-3"
                      style={{ fontFamily: "'DM Serif Display', serif", color: "#0a0a0a" }}
                    >
                      By Market
                    </h2>
                    <p className="text-xs mb-8 max-w-2xl" style={{ color: "rgba(0,0,0,0.45)", lineHeight: 1.6 }}>
                      Moneyline vs spread vs totals. Useful for spotting where the model has edge and where it doesn&apos;t — no hiding weak markets.
                    </p>
                    <div className="space-y-4">
                      {marketBreakdown.map((mk, idx) => (
                        <motion.div
                          key={mk.market}
                          className="flex items-center gap-4 md:gap-6"
                          initial={{ opacity: 0, x: -12 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ duration: 0.4, delay: 0.4 + idx * 0.06 }}
                        >
                          <div
                            className="w-24 md:w-32 text-sm font-semibold flex-shrink-0"
                            style={{ color: "rgba(0,0,0,0.7)" }}
                          >
                            {MARKET_LABEL[mk.market] ?? mk.market}
                          </div>
                          <div
                            className="text-xs flex-shrink-0 w-16 text-right"
                            style={{ color: "rgba(0,0,0,0.45)", fontFamily: "var(--font-geist-mono)" }}
                          >
                            {mk.won}-{mk.lost}
                          </div>
                          <div className="flex-1 h-7 rounded overflow-hidden" style={{ background: "rgba(0,0,0,0.04)" }}>
                            <motion.div
                              className="h-full rounded"
                              initial={{ width: 0 }}
                              animate={{ width: `${(mk.winRate / maxMarketWinRate) * 100}%` }}
                              transition={{ duration: 0.8, delay: 0.45 + idx * 0.06, ease: "easeOut" }}
                              style={{
                                background: mk.winRate >= 50
                                  ? "linear-gradient(90deg, #22c55e, #34d399)"
                                  : "linear-gradient(90deg, rgba(0,0,0,0.3), rgba(0,0,0,0.5))",
                                minWidth: "2px",
                              }}
                            />
                          </div>
                          <div
                            className="w-14 text-right text-sm font-bold flex-shrink-0"
                            style={{
                              color: mk.winRate >= 50 ? "#22c55e" : "#ef4444",
                              fontFamily: "var(--font-geist-mono)",
                            }}
                          >
                            {mk.winRate.toFixed(0)}%
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </motion.div>
                )}

                {/* ─── By Tier ─── */}
                {/* The most important breakdown on this page. If the AI's
                    Top 3 win at a higher rate than its All-tier picks,
                    the confidence ranking is real. If the rates are flat,
                    it isn't. We show the full curve so the answer is
                    visible, not hidden behind a single headline number. */}
                {tierBreakdown.length > 0 && tierBreakdown.some((t) => t.sample > 0) && (
                  <motion.div
                    className="mt-16 md:mt-20"
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.42 }}
                  >
                    <h2
                      className="text-2xl md:text-3xl mb-3"
                      style={{ fontFamily: "'DM Serif Display', serif", color: "#0a0a0a" }}
                    >
                      By Tier
                    </h2>
                    <p className="text-xs mb-8 max-w-2xl" style={{ color: "rgba(0,0,0,0.45)", lineHeight: 1.6 }}>
                      Hit rate and ROI if you only bet the AI&apos;s Top N picks each slate. The wider the gap between Top 3 and All, the more real the AI&apos;s confidence ranking is. Flat curve means the ranking is noise.
                    </p>
                    <div
                      className="rounded-xl overflow-hidden"
                      style={{ border: "1px solid rgba(0,0,0,0.08)" }}
                    >
                      <div
                        className="grid text-xs uppercase tracking-wider px-5 py-3"
                        style={{
                          gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr",
                          background: "rgba(0,0,0,0.04)",
                          color: "rgba(0,0,0,0.5)",
                          fontWeight: 600,
                        }}
                      >
                        <div>Tier</div>
                        <div className="text-right">Sample</div>
                        <div className="text-right">Record</div>
                        <div className="text-right">Win Rate</div>
                        <div className="text-right">ROI</div>
                      </div>
                      {tierBreakdown.map((t, idx) => {
                        const hasSample = t.sample > 0;
                        return (
                          <motion.div
                            key={t.tier}
                            className="grid items-center px-5 py-4 text-sm"
                            style={{
                              gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr",
                              borderTop: idx === 0 ? "none" : "1px solid rgba(0,0,0,0.06)",
                              fontFamily: "var(--font-geist-mono)",
                              opacity: hasSample ? 1 : 0.4,
                            }}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: hasSample ? 1 : 0.4 }}
                            transition={{ duration: 0.3, delay: 0.45 + idx * 0.04 }}
                          >
                            <div style={{ fontWeight: 600, color: "#0a0a0a", fontFamily: "inherit" }}>
                              Top {t.tier}
                            </div>
                            <div className="text-right" style={{ color: "rgba(0,0,0,0.55)" }}>
                              {t.sample}
                            </div>
                            <div className="text-right" style={{ color: "rgba(0,0,0,0.55)" }}>
                              {hasSample ? `${t.won}-${t.lost}` : "—"}
                            </div>
                            <div
                              className="text-right"
                              style={{
                                color: hasSample
                                  ? t.winRate >= 50
                                    ? "#22c55e"
                                    : "#ef4444"
                                  : "rgba(0,0,0,0.4)",
                                fontWeight: 600,
                              }}
                            >
                              {hasSample ? `${t.winRate.toFixed(0)}%` : "—"}
                            </div>
                            <div
                              className="text-right"
                              style={{
                                color: hasSample
                                  ? t.roi >= 0
                                    ? "#22c55e"
                                    : "#ef4444"
                                  : "rgba(0,0,0,0.4)",
                                fontWeight: 600,
                              }}
                            >
                              {hasSample ? `${t.roi >= 0 ? "+" : ""}${t.roi.toFixed(1)}%` : "—"}
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  </motion.div>
                )}

                {/* ─── Recent Parlays Feed ─── */}
                <motion.div
                  className="mt-16 md:mt-20"
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.4 }}
                >
                  <h2
                    className="text-2xl md:text-3xl mb-3"
                    style={{ fontFamily: "'DM Serif Display', serif", color: "#0a0a0a" }}
                  >
                    Recent Parlays
                  </h2>
                  <p
                    className="text-xs mb-8 max-w-2xl"
                    style={{ color: "rgba(0,0,0,0.45)", lineHeight: 1.6 }}
                  >
                    <span className="font-semibold" style={{ color: "rgba(0,0,0,0.6)" }}>Hit %</span> is the book&apos;s implied probability this parlay cashes.
                    Higher odds = lower hit %. A parlay at +500 hits ~17% of the time, +100 hits ~50%. High hit rates don&apos;t mean profitable — the book&apos;s vig eats you long-term unless you&apos;re finding EV.
                  </p>

                  {/* Table header - desktop */}
                  <div
                    className="hidden md:grid items-center gap-4 px-6 py-3 text-xs uppercase tracking-wider font-medium"
                    style={{
                      gridTemplateColumns: "140px 60px 90px 70px 90px 100px 40px",
                      color: "rgba(0,0,0,0.4)",
                      borderBottom: "1px solid rgba(0,0,0,0.06)",
                    }}
                  >
                    <span>Date</span>
                    <span className="text-center">Legs</span>
                    <span className="text-right">Odds</span>
                    <span className="text-right">EV</span>
                    <span className="text-center">Status</span>
                    <span className="text-right">Profit</span>
                    <span />
                  </div>

                  <div className="space-y-1">
                    {recentParlays.map((parlay, idx) => {
                      const sc = statusColor(parlay.status);
                      const isExpanded = expandedParlay === parlay.id;

                      return (
                        <motion.div
                          key={parlay.id}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.3, delay: 0.45 + idx * 0.03 }}
                        >
                          {/* Row */}
                          <button
                            onClick={() => setExpandedParlay(isExpanded ? null : parlay.id)}
                            className="w-full text-left transition-colors duration-150 rounded-lg"
                            style={{
                              background: isExpanded ? "rgba(0,0,0,0.04)" : "transparent",
                            }}
                            onMouseEnter={(e) => {
                              if (!isExpanded) e.currentTarget.style.background = "rgba(0,0,0,0.04)";
                            }}
                            onMouseLeave={(e) => {
                              if (!isExpanded) e.currentTarget.style.background = "transparent";
                            }}
                          >
                            {/* Desktop row */}
                            <div
                              className="hidden md:grid items-center gap-4 px-6 py-4"
                              style={{ gridTemplateColumns: "140px 60px 90px 70px 90px 100px 40px" }}
                            >
                              <div>
                                <div className="text-sm" style={{ color: "rgba(0,0,0,0.7)" }}>
                                  {formatDate(parlay.created_at)}
                                </div>
                                <div className="text-xs mt-0.5" style={{ color: "rgba(0,0,0,0.4)" }}>
                                  {formatTime(parlay.created_at)}
                                </div>
                              </div>
                              <div
                                className="text-sm text-center font-medium"
                                style={{ color: "rgba(0,0,0,0.6)", fontFamily: "var(--font-geist-mono)" }}
                              >
                                {parlay.legs.length}
                              </div>
                              <div
                                className="text-sm text-right font-semibold"
                                style={{ color: "#0a0a0a", fontFamily: "var(--font-geist-mono)" }}
                              >
                                {parlay.combined_odds}
                                {parlay.impliedHitRate != null && (
                                  <div
                                    className="text-[10px] font-normal mt-0.5"
                                    style={{ color: "rgba(0,0,0,0.4)" }}
                                  >
                                    {parlay.impliedHitRate.toFixed(1)}% hit
                                  </div>
                                )}
                              </div>
                              <div
                                className="text-sm text-right font-medium"
                                style={{
                                  color: parlay.ev_percent > 0 ? "#22c55e" : "rgba(0,0,0,0.45)",
                                  fontFamily: "var(--font-geist-mono)",
                                }}
                              >
                                {parlay.ev_percent > 0 ? "+" : ""}
                                {parlay.ev_percent.toFixed(1)}%
                              </div>
                              <div className="flex justify-center">
                                <span
                                  className="text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full"
                                  style={{ color: sc.text, background: sc.bg, border: `1px solid ${sc.border}` }}
                                >
                                  {parlay.status}
                                </span>
                              </div>
                              {(() => {
                                const p10 = profitAtUnit(parlay);
                                return (
                                  <div
                                    className="text-sm text-right font-bold"
                                    style={{
                                      color: p10 > 0 ? "#22c55e" : p10 < 0 ? "#ef4444" : "rgba(0,0,0,0.45)",
                                      fontFamily: "var(--font-geist-mono)",
                                    }}
                                  >
                                    {p10 > 0 ? "+" : p10 < 0 ? "-" : ""}
                                    {parlay.status === "pending" || p10 === 0 ? "--" : `$${Math.abs(p10).toFixed(0)}`}
                                  </div>
                                );
                              })()}
                              <div className="flex justify-end" style={{ color: "rgba(0,0,0,0.4)" }}>
                                {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                              </div>
                            </div>

                            {/* Mobile row */}
                            <div className="md:hidden px-4 py-4">
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-3">
                                  <span
                                    className="text-xs font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full"
                                    style={{ color: sc.text, background: sc.bg, border: `1px solid ${sc.border}` }}
                                  >
                                    {parlay.status}
                                  </span>
                                  <span className="text-xs" style={{ color: "rgba(0,0,0,0.4)" }}>
                                    {formatDate(parlay.created_at)}
                                  </span>
                                </div>
                                <div style={{ color: "rgba(0,0,0,0.4)" }}>
                                  {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                </div>
                              </div>
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                  <div>
                                    <span className="text-xs" style={{ color: "rgba(0,0,0,0.4)" }}>
                                      {parlay.legs.length} legs
                                    </span>
                                    <span className="mx-2" style={{ color: "rgba(255,255,255,0.1)" }}>
                                      |
                                    </span>
                                    <span
                                      className="text-sm font-semibold"
                                      style={{ color: "#0a0a0a", fontFamily: "var(--font-geist-mono)" }}
                                    >
                                      {parlay.combined_odds}
                                    </span>
                                    {parlay.impliedHitRate != null && (
                                      <span
                                        className="text-[10px] ml-2"
                                        style={{ color: "rgba(0,0,0,0.4)", fontFamily: "var(--font-geist-mono)" }}
                                      >
                                        ({parlay.impliedHitRate.toFixed(1)}%)
                                      </span>
                                    )}
                                  </div>
                                </div>
                                {(() => {
                                  const p10 = profitAtUnit(parlay);
                                  return (
                                    <span
                                      className="text-sm font-bold"
                                      style={{
                                        color: p10 > 0 ? "#22c55e" : p10 < 0 ? "#ef4444" : "rgba(0,0,0,0.45)",
                                        fontFamily: "var(--font-geist-mono)",
                                      }}
                                    >
                                      {p10 > 0 ? "+" : p10 < 0 ? "-" : ""}
                                      {parlay.status === "pending" || p10 === 0 ? "--" : `$${Math.abs(p10).toFixed(0)}`}
                                    </span>
                                  );
                                })()}
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
                                    background: "rgba(0,0,0,0.04)",
                                    border: "1px solid rgba(0,0,0,0.06)",
                                  }}
                                >
                                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                                  {parlay.legs.map((leg: any, li: number) => (
                                    <div
                                      key={li}
                                      className="flex items-center justify-between px-4 md:px-6 py-3"
                                      style={{
                                        borderBottom:
                                          li < parlay.legs.length - 1
                                            ? "1px solid rgba(0,0,0,0.04)"
                                            : "none",
                                      }}
                                    >
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                          {leg.sport && (
                                            <span
                                              className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded"
                                              style={{
                                                background: "rgba(0,0,0,0.06)",
                                                color: "#0a0a0a",
                                                border: "1px solid rgba(0,0,0,0.08)",
                                              }}
                                            >
                                              {leg.sport}
                                            </span>
                                          )}
                                          <span className="text-xs truncate" style={{ color: "rgba(0,0,0,0.45)" }}>
                                            {leg.game || leg.matchup || ""}
                                          </span>
                                        </div>
                                        <div className="text-sm font-medium mt-1" style={{ color: "#0a0a0a" }}>
                                          {leg.pick || leg.selection || ""}
                                          {(leg.market || leg.type) && (
                                            <span className="ml-2 font-normal" style={{ color: "rgba(0,0,0,0.4)" }}>
                                              {leg.market || leg.type}
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-4 flex-shrink-0">
                                        {leg.odds && (
                                          <span
                                            className="text-sm font-bold"
                                            style={{ color: "#0a0a0a", fontFamily: "var(--font-geist-mono)" }}
                                          >
                                            {typeof leg.odds === "number"
                                              ? leg.odds > 0
                                                ? `+${leg.odds}`
                                                : leg.odds
                                              : leg.odds}
                                          </span>
                                        )}
                                        {leg.result && (
                                          <span
                                            className="text-[10px] font-bold uppercase"
                                            style={{
                                              color:
                                                leg.result.toLowerCase() === "won" || leg.result.toLowerCase() === "win"
                                                  ? "#22c55e"
                                                  : leg.result.toLowerCase() === "lost" || leg.result.toLowerCase() === "loss"
                                                  ? "#ef4444"
                                                  : "#eab308",
                                            }}
                                          >
                                            {leg.result}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  ))}

                                  {/* Payout row — at $10/pick */}
                                  {parlay.combined_decimal && parlay.combined_decimal > 1 && (
                                    <div
                                      className="flex items-center justify-between px-4 md:px-6 py-3"
                                      style={{ borderTop: "1px solid rgba(0,0,0,0.06)", background: "rgba(255,255,255,0.01)" }}
                                    >
                                      <span className="text-xs uppercase tracking-wider" style={{ color: "rgba(0,0,0,0.4)" }}>
                                        ${TRACK_UNIT_STAKE} pays
                                      </span>
                                      <span
                                        className="text-sm font-bold"
                                        style={{ color: "#0a0a0a", fontFamily: "var(--font-geist-mono)" }}
                                      >
                                        ${payoutAtUnit(parlay).toFixed(2)}
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

                  {recentParlays.length === 0 && (
                    <div className="py-16 text-center">
                      <Clock size={28} style={{ color: "rgba(0,0,0,0.25)", margin: "0 auto 12px" }} />
                      <p className="text-sm" style={{ color: "rgba(0,0,0,0.4)" }}>
                        No tracked parlays yet. Check back soon.
                      </p>
                    </div>
                  )}
                </motion.div>
              </motion.div>
              );
            })()}
          </AnimatePresence>
        </div>
      </main>

      {/* ─── Footer ─── */}
      <footer className="px-6 py-12" style={{ borderTop: "1px solid rgba(0,0,0,0.06)" }}>
        <div className="max-w-[1400px] mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm" style={{ color: "rgba(0,0,0,0.4)" }}>
            BayParlays. AI-powered parlay optimization.
          </p>
          <p className="text-xs" style={{ color: "rgba(0,0,0,0.25)" }}>
            Not financial advice. Gamble responsibly.
          </p>
        </div>
      </footer>
    </div>
  );
}

/* ─── Skeletons ─── */

function StatsSkeletons() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <StatCardSkeleton key={i} />
      ))}
    </div>
  );
}

function BarSkeletons() {
  return (
    <div className="space-y-4">
      <div className="w-24 h-7 rounded mb-6" style={{ background: "rgba(0,0,0,0.06)" }} />
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="flex items-center gap-4 animate-pulse">
          <div className="w-16 h-4 rounded" style={{ background: "rgba(0,0,0,0.06)" }} />
          <div className="w-12 h-4 rounded" style={{ background: "rgba(0,0,0,0.04)" }} />
          <div className="flex-1 h-7 rounded" style={{ background: "rgba(0,0,0,0.04)" }} />
          <div className="w-10 h-4 rounded" style={{ background: "rgba(0,0,0,0.06)" }} />
        </div>
      ))}
    </div>
  );
}

function ParlayRowSkeleton() {
  return (
    <div className="flex items-center gap-4 px-6 py-4 animate-pulse">
      <div className="w-28 h-5 rounded" style={{ background: "rgba(0,0,0,0.06)" }} />
      <div className="w-8 h-5 rounded" style={{ background: "rgba(0,0,0,0.04)" }} />
      <div className="w-16 h-5 rounded" style={{ background: "rgba(0,0,0,0.06)" }} />
      <div className="w-12 h-5 rounded" style={{ background: "rgba(0,0,0,0.04)" }} />
      <div className="w-16 h-6 rounded-full" style={{ background: "rgba(0,0,0,0.06)" }} />
      <div className="flex-1" />
      <div className="w-16 h-5 rounded" style={{ background: "rgba(0,0,0,0.06)" }} />
    </div>
  );
}
