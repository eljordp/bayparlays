"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { AppNav } from "@/app/components/AppNav";
import { ResultsTabs } from "@/app/components/ResultsTabs";
import { useAuth } from "@/app/components/AuthProvider";
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
  Lock,
  Loader2,
  TrendingUp,
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
  profit?: number;
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

/* ─── Game status (live feed for pending bets) ──────────────────────── */

interface GameStatusRow {
  key: string;
  homeTeam: string;
  awayTeam: string;
  state: "pre" | "in" | "post";
  statusDetail: string;
  startsAt: string | null;
  homeScore: number | null;
  awayScore: number | null;
  period: number | null;
  displayClock: string | null;
}

function normalizeGameKey(teamA: string, teamB: string): string {
  const norm = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const [a, b] = [norm(teamA), norm(teamB)].sort();
  return `${a}__${b}`;
}

function gameStringKey(game: string): string | null {
  if (!game) return null;
  const m = game.match(/^(.+?)\s+(?:vs|@|at)\s+(.+)$/i);
  if (!m) return null;
  return normalizeGameKey(m[1], m[2]);
}

function formatStartTime(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const diffMin = Math.round((d.getTime() - now) / 60000);
  if (diffMin <= 0) return "starting";
  if (diffMin < 60) return `in ${diffMin}m`;
  const h = Math.floor(diffMin / 60);
  const m = diffMin % 60;
  if (h < 12) return m > 0 ? `in ${h}h ${m}m` : `in ${h}h`;
  // Longer than 12 hours — show wall-clock in the local tz
  return d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

interface LegCountBreakdown {
  label: string;
  legs: number;
  won: number;
  lost: number;
  profit: number;
  winRate: number;
}

interface OddsRangeBreakdown {
  label: string;
  won: number;
  lost: number;
  profit: number;
  winRate: number;
}

interface Insight {
  tone: "good" | "bad" | "neutral";
  text: string;
}

interface PerLegStats {
  won: number;
  total: number;
  hitRate: number;
  sampledParlays: number;
}

interface MyStatsData {
  stats: Stats;
  sportBreakdown: SportBreakdown[];
  categoryBreakdown: CategoryBreakdown[];
  legCountBreakdown?: LegCountBreakdown[];
  oddsRangeBreakdown?: OddsRangeBreakdown[];
  perLeg?: PerLegStats;
  insights?: Insight[];
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
    color: "#0a0a0a",
    bg: "rgba(0,0,0,0.06)",
    border: "rgba(0,0,0,0.18)",
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

/* ─── Page ─── */

export default function MyStatsPage() {
  const { user, loading: authLoading } = useAuth();

  const [data, setData] = useState<MyStatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedBet, setExpandedBet] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [gameStatuses, setGameStatuses] = useState<Map<string, GameStatusRow>>(
    new Map(),
  );

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

  // Pull live game status for every unique sport that appears in the user's
  // bet history. One call covers today + yesterday across all sports.
  const fetchGameStatuses = useCallback(async () => {
    if (!data?.recentBets?.length) return;
    const sports = new Set<string>();
    for (const bet of data.recentBets) {
      for (const leg of (bet.legs ?? []) as Array<{ sport?: string }>) {
        if (leg.sport) sports.add(leg.sport.toUpperCase());
      }
    }
    if (sports.size === 0) return;
    try {
      const res = await fetch(
        `/api/track/game-status?sports=${Array.from(sports).join(",")}`,
        { cache: "no-store" },
      );
      if (!res.ok) return;
      const json: { games: GameStatusRow[] } = await res.json();
      const map = new Map<string, GameStatusRow>();
      for (const g of json.games) map.set(g.key, g);
      setGameStatuses(map);
    } catch {
      // Non-fatal — expanded view falls back to no status chip
    }
  }, [data]);

  useEffect(() => {
    fetchGameStatuses();
    // Refresh live statuses every 60s while the page is open — covers
    // in-progress games updating their clock/score.
    const id = setInterval(fetchGameStatuses, 60_000);
    return () => clearInterval(id);
  }, [fetchGameStatuses]);

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
        <Loader2 className="w-6 h-6 text-black/40 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-[#ededed] flex flex-col items-center justify-center px-6">
        <Lock className="w-10 h-10 text-black/30 mb-6" />
        <h1
          className="text-3xl md:text-4xl mb-4 text-center"
          style={{ fontFamily: "'DM Serif Display', serif" }}
        >
          Sign in to view your track record
        </h1>
        <p className="text-black/45 mb-8 text-center max-w-md">
          Your sim bets, resolved against real scores. See how you&apos;re trending.
        </p>
        <Link
          href="/login"
          className="bg-[#0a0a0a] text-white px-8 py-3 text-sm font-semibold rounded-full hover:bg-[#222] transition-colors"
        >
          Sign In
        </Link>
      </div>
    );
  }

  const stats = data?.stats;
  const sportBreakdown = data?.sportBreakdown ?? [];
  const categoryBreakdown = data?.categoryBreakdown ?? [];
  const legCountBreakdown = data?.legCountBreakdown ?? [];
  const oddsRangeBreakdown = data?.oddsRangeBreakdown ?? [];
  const perLeg = data?.perLeg;
  const insights = data?.insights ?? [];
  const recentBets = data?.recentBets ?? [];
  const maxSportWinRate = Math.max(...sportBreakdown.map((s) => s.winRate), 1);
  const maxCategoryWinRate = Math.max(
    ...categoryBreakdown.map((c) => c.winRate),
    1,
  );

  return (
    <div className="min-h-screen" style={{ background: "#FAFAF7" }}>
      <AppNav />
      <div className="pt-20">
        <ResultsTabs />
      </div>

      {/* ─── Header ─── */}
      <header className="pt-8 pb-8 px-4 md:pt-14 md:pb-14 md:px-6">
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
                color: "#0a0a0a",
              }}
            >
              My Track Record
            </h1>
            <p
              className="text-lg md:text-xl max-w-2xl"
              style={{ color: "rgba(0,0,0,0.5)", lineHeight: 1.6 }}
            >
              The parlays <strong style={{ color: "#0a0a0a" }}>you</strong> built or saved in the Simulator, graded against real game scores. This is your record — separate from the AI&apos;s public track record.
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
                Your bets
              </span>
              <span style={{ color: "rgba(0,0,0,0.25)" }}>·</span>
              <Link
                href="/results"
                className="px-2.5 py-1 rounded-full transition-colors hover:bg-black/5"
                style={{ border: "1px solid rgba(0,0,0,0.08)" }}
              >
                AI Track Record &rarr;
              </Link>
              <span style={{ color: "rgba(0,0,0,0.25)" }}>·</span>
              <Link
                href="/simulator"
                className="px-2.5 py-1 rounded-full transition-colors hover:bg-black/5"
                style={{ border: "1px solid rgba(0,0,0,0.08)" }}
              >
                Place a sim bet &rarr;
              </Link>
            </div>
            <div className="mt-4 flex items-center gap-3 flex-wrap">
              <button
                onClick={refreshStats}
                disabled={refreshing}
                className="text-xs font-semibold px-4 py-2 rounded-full transition-all disabled:opacity-50"
                style={{
                  background: refreshing
                    ? "rgba(0,0,0,0.06)"
                    : "rgba(0,0,0,0.08)",
                  color: "#0a0a0a",
                  border: "1px solid rgba(0,0,0,0.25)",
                }}
              >
                {refreshing ? "Refreshing…" : "Refresh Now"}
              </button>
              <span
                className="text-xs uppercase tracking-widest"
                style={{ color: "rgba(0,0,0,0.4)" }}
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
                    background: "rgba(0,0,0,0.04)",
                    border: "1px solid rgba(0,0,0,0.08)",
                  }}
                >
                  <BarChart3
                    size={32}
                    style={{ color: "rgba(0,0,0,0.3)" }}
                  />
                </div>
                <p
                  className="text-xl font-medium mb-2"
                  style={{ color: "rgba(0,0,0,0.6)" }}
                >
                  {error}
                </p>
                <p
                  className="text-sm"
                  style={{ color: "rgba(0,0,0,0.4)" }}
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
                    background: "rgba(0,0,0,0.04)",
                    border: "1px solid rgba(0,0,0,0.08)",
                  }}
                >
                  <BarChart3
                    size={32}
                    style={{ color: "rgba(0,0,0,0.3)" }}
                  />
                </div>
                <p
                  className="text-xl font-medium mb-2"
                  style={{ color: "rgba(0,0,0,0.6)" }}
                >
                  No sim bets yet.
                </p>
                <p
                  className="text-sm mb-6"
                  style={{ color: "rgba(0,0,0,0.4)" }}
                >
                  Place your first one in the Simulator.
                </p>
                <Link
                  href="/simulator"
                  className="text-xs font-semibold px-4 py-2 rounded-full transition-all"
                  style={{
                    background: "rgba(0,0,0,0.08)",
                    color: "#0a0a0a",
                    border: "1px solid rgba(0,0,0,0.25)",
                  }}
                >
                  Go to Simulator
                </Link>
              </motion.div>
            )}

            {/* Data loaded */}
            {!loading && !error && data && stats && stats.totalBets > 0 && (() => {
              const profitable = stats.totalProfit > 0;
              const last7Profitable = stats.last7Days.profit > 0;
              return (
              <motion.div
                key="content"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                {/* ─── Profit framing — same treatment as AI Track Record ─── */}
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
                        You&apos;re profitable. Win rate isn&apos;t the headline — ROI is.
                      </div>
                      <div
                        className="text-sm leading-relaxed"
                        style={{ color: "rgba(0,0,0,0.65)" }}
                      >
                        You&apos;ve hit{" "}
                        <strong style={{ color: "#15803d" }}>
                          {stats.winRate.toFixed(1)}%
                        </strong>{" "}
                        of your sim bets and netted{" "}
                        <strong style={{ color: "#15803d" }}>
                          {formatMoney(stats.totalProfit)}
                        </strong>{" "}
                        across {stats.won + stats.lost} graded bets — a{" "}
                        <strong style={{ color: "#15803d" }}>
                          {stats.roi >= 0 ? "+" : ""}{stats.roi.toFixed(1)}% ROI
                        </strong>.
                        Parlays pay 3-5x, so anything above ~22% is profitable.
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
                    value={formatMoney(stats.totalProfit)}
                    tone={profitable ? "good" : stats.totalProfit < 0 ? "bad" : "muted"}
                    sublabel={`${stats.roi >= 0 ? "+" : ""}${stats.roi.toFixed(1)}% ROI`}
                    tooltip="Profit from your sim bets in simulated dollars. ROI = profit divided by total wagered. Positive ROI means you're picking better than the book's vig."
                    delay={0}
                  />
                  <StatCard
                    icon={<Trophy size={16} />}
                    label="Win Rate"
                    value={`${stats.winRate.toFixed(1)}%`}
                    tone={profitable ? "good" : "bad"}
                    sublabel={`${stats.won}W - ${stats.lost}L · break-even ~22%`}
                    tooltip="How often your bets cash. Parlays pay 3-5x, so anything above ~22% is profitable. Single-game bets need 52.4%. Color follows profit, not record."
                    delay={0.05}
                  />
                  <StatCard
                    icon={<Clock size={16} />}
                    label="Last 7 Days"
                    value={`${stats.last7Days.won}-${stats.last7Days.lost}`}
                    tone={last7Profitable ? "good" : stats.last7Days.profit < 0 ? "bad" : "muted"}
                    sublabel={`${formatMoney(stats.last7Days.profit)} · recent form`}
                    tooltip="Wins and losses in the last 7 days. Color follows profit, not record — a 3-9 week can still be net positive when the wins paid out big."
                    delay={0.1}
                  />
                  <StatCard
                    icon={<Flame size={16} />}
                    label="Current Streak"
                    value={`${stats.currentStreak.type}${stats.currentStreak.count}`}
                    tone="muted"
                    sublabel={
                      stats.currentStreak.count === 0
                        ? "No resolved bets"
                        : stats.currentStreak.type === "W"
                        ? "Winning streak"
                        : "Losing streak · normal in parlay land"
                    }
                    tooltip="Streaks are noise. You can lose 5 in a row at +400 odds and still be profitable on the month. Don't chase or panic over a streak."
                    delay={0.15}
                  />
                  <StatCard
                    icon={<Hash size={16} />}
                    label="Total Bets"
                    value={stats.totalBets.toLocaleString()}
                    tone="neutral"
                    sublabel={`${stats.pending} pending · ${(stats.won + stats.lost).toLocaleString()} graded`}
                    tooltip="Every sim bet you've placed. Pending = games still in progress. Graded = result is in. Sample size matters — anything under 50 graded is too small to draw conclusions."
                    delay={0.2}
                  />
                  <StatCard
                    icon={<Zap size={16} />}
                    label="Best Payout"
                    value={`$${stats.bestPayout.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                    tone="neutral"
                    sublabel={`${formatMoney(stats.bestProfit)} profit`}
                    tooltip="Your biggest single-bet payout in sim. The peak — what one big hit looked like. Big payouts come from longer parlays (more legs = bigger odds = bigger upside)."
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
                        color: "#0a0a0a",
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
                            style={{ color: "rgba(0,0,0,0.7)" }}
                          >
                            {sport.sport}
                          </div>
                          <div
                            className="text-xs flex-shrink-0 w-16 text-right"
                            style={{
                              color: "rgba(0,0,0,0.45)",
                              fontFamily: "var(--font-geist-mono)",
                            }}
                          >
                            {sport.won}-{sport.lost}
                          </div>
                          <div
                            className="flex-1 h-7 rounded overflow-hidden"
                            style={{ background: "rgba(0,0,0,0.04)" }}
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
                                    ? "linear-gradient(90deg, #0a0a0a, rgba(0,0,0,0.7))"
                                    : "linear-gradient(90deg, rgba(0,0,0,0.3), rgba(0,0,0,0.5))",
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
                        color: "#0a0a0a",
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
                                color: "rgba(0,0,0,0.45)",
                                fontFamily: "var(--font-geist-mono)",
                              }}
                            >
                              {cat.won}-{cat.lost}
                            </div>
                            <div
                              className="flex-1 h-7 rounded overflow-hidden"
                              style={{ background: "rgba(0,0,0,0.04)" }}
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
                      color: "#0a0a0a",
                    }}
                  >
                    Recent Bets
                  </h2>
                  <p
                    className="text-xs mb-8 max-w-2xl"
                    style={{ color: "rgba(0,0,0,0.45)", lineHeight: 1.6 }}
                  >
                    <span className="font-semibold" style={{ color: "rgba(0,0,0,0.6)" }}>Hit %</span> = the book&apos;s implied probability this parlay cashes.
                    A +500 parlay hits ~17% of the time, +100 hits ~50%. Chasing high hit rates with juiced favorites is a trap — the book&apos;s vig grinds you down. Look for picks where the AI&apos;s estimate exceeds the book&apos;s.
                  </p>

                  {/* Table header - desktop */}
                  <div
                    className="hidden md:grid items-center gap-4 px-6 py-3 text-xs uppercase tracking-wider font-medium"
                    style={{
                      gridTemplateColumns:
                        "140px 80px 90px 70px 90px 100px 40px",
                      color: "rgba(0,0,0,0.4)",
                      borderBottom: "1px solid rgba(0,0,0,0.06)",
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
                                ? "rgba(0,0,0,0.04)"
                                : "transparent",
                            }}
                            onMouseEnter={(e) => {
                              if (!isExpanded)
                                e.currentTarget.style.background =
                                  "rgba(0,0,0,0.04)";
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
                                  style={{ color: "rgba(0,0,0,0.7)" }}
                                >
                                  {formatDate(bet.created_at)}
                                </div>
                                <div
                                  className="text-xs mt-0.5"
                                  style={{ color: "rgba(0,0,0,0.4)" }}
                                >
                                  {formatTime(bet.created_at)}
                                </div>
                              </div>
                              <div className="flex items-center justify-center gap-1.5">
                                <span
                                  className="text-sm font-medium"
                                  style={{
                                    color: "rgba(0,0,0,0.6)",
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
                                  color: "#0a0a0a",
                                  fontFamily: "var(--font-geist-mono)",
                                }}
                              >
                                {bet.combined_odds}
                                {impliedHitRate(bet.combined_decimal) != null && (
                                  <div
                                    className="text-[10px] font-normal mt-0.5"
                                    style={{ color: "rgba(0,0,0,0.4)" }}
                                  >
                                    {impliedHitRate(bet.combined_decimal)!.toFixed(1)}% hit
                                  </div>
                                )}
                              </div>
                              <div
                                className="text-sm text-right font-medium"
                                style={{
                                  color: "rgba(0,0,0,0.55)",
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
                                      : "rgba(0,0,0,0.45)",
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
                                style={{ color: "rgba(0,0,0,0.4)" }}
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
                                    style={{ color: "rgba(0,0,0,0.4)" }}
                                  >
                                    {formatDate(bet.created_at)}
                                  </span>
                                </div>
                                <div style={{ color: "rgba(0,0,0,0.4)" }}>
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
                                        color: "rgba(0,0,0,0.4)",
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
                                        color: "#0a0a0a",
                                        fontFamily: "var(--font-geist-mono)",
                                      }}
                                    >
                                      {bet.combined_odds}
                                    </span>
                                    {impliedHitRate(bet.combined_decimal) != null && (
                                      <span
                                        className="text-[10px] ml-2"
                                        style={{
                                          color: "rgba(0,0,0,0.4)",
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
                                        color: "rgba(0,0,0,0.45)",
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
                                        : "rgba(0,0,0,0.45)",
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
                                    background: "rgba(0,0,0,0.04)",
                                    border: "1px solid rgba(0,0,0,0.06)",
                                  }}
                                >
                                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                                  {bet.legs.map((leg: any, li: number) => {
                                    const gameLabel = leg.game || leg.matchup || "";
                                    const gkey = gameStringKey(gameLabel);
                                    const status = gkey ? gameStatuses.get(gkey) : null;
                                    return (
                                    <div
                                      key={li}
                                      className="flex items-center justify-between px-4 md:px-6 py-3"
                                      style={{
                                        borderBottom:
                                          li < bet.legs.length - 1
                                            ? "1px solid rgba(0,0,0,0.04)"
                                            : "none",
                                      }}
                                    >
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                          {leg.sport && (
                                            <span
                                              className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded"
                                              style={{
                                                background:
                                                  "rgba(0,0,0,0.06)",
                                                color: "#0a0a0a",
                                                border:
                                                  "1px solid rgba(0,0,0,0.08)",
                                              }}
                                            >
                                              {leg.sport}
                                            </span>
                                          )}
                                          {status && (
                                            <span
                                              className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded flex items-center gap-1"
                                              style={{
                                                background:
                                                  status.state === "in"
                                                    ? "rgba(34,197,94,0.12)"
                                                    : status.state === "post"
                                                      ? "rgba(0,0,0,0.06)"
                                                      : "rgba(59,130,246,0.10)",
                                                color:
                                                  status.state === "in"
                                                    ? "#22c55e"
                                                    : status.state === "post"
                                                      ? "rgba(0,0,0,0.6)"
                                                      : "#60a5fa",
                                                border: `1px solid ${
                                                  status.state === "in"
                                                    ? "rgba(34,197,94,0.25)"
                                                    : status.state === "post"
                                                      ? "rgba(255,255,255,0.1)"
                                                      : "rgba(59,130,246,0.2)"
                                                }`,
                                              }}
                                              title={
                                                status.homeScore !== null &&
                                                status.awayScore !== null
                                                  ? `${status.awayTeam} ${status.awayScore} - ${status.homeScore} ${status.homeTeam}`
                                                  : undefined
                                              }
                                            >
                                              {status.state === "in" && (
                                                <span
                                                  className="w-1.5 h-1.5 rounded-full"
                                                  style={{ background: "#22c55e" }}
                                                />
                                              )}
                                              {status.state === "in"
                                                ? `LIVE · ${status.statusDetail}${status.homeScore !== null && status.awayScore !== null ? ` · ${status.awayScore}-${status.homeScore}` : ""}`
                                                : status.state === "post"
                                                  ? `Final · ${status.awayScore ?? "?"}-${status.homeScore ?? "?"}`
                                                  : status.startsAt
                                                    ? `Starts ${formatStartTime(status.startsAt)}`
                                                    : "Scheduled"}
                                            </span>
                                          )}
                                          {!status && leg.commenceTime && (
                                            <span
                                              className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded"
                                              style={{
                                                background: "rgba(59,130,246,0.08)",
                                                color: "#60a5fa",
                                                border: "1px solid rgba(59,130,246,0.15)",
                                              }}
                                            >
                                              Starts {formatStartTime(leg.commenceTime)}
                                            </span>
                                          )}
                                          <span
                                            className="text-xs truncate"
                                            style={{
                                              color: "rgba(0,0,0,0.45)",
                                            }}
                                          >
                                            {gameLabel}
                                          </span>
                                        </div>
                                        <div
                                          className="text-sm font-medium mt-1"
                                          style={{ color: "#0a0a0a" }}
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
                                                color: "#0a0a0a",
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
                                    );
                                  })}

                                  {/* Payout row */}
                                  {bet.payout > 0 && (
                                    <div
                                      className="flex items-center justify-between px-4 md:px-6 py-3"
                                      style={{
                                        borderTop:
                                          "1px solid rgba(0,0,0,0.06)",
                                        background: "rgba(255,255,255,0.01)",
                                      }}
                                    >
                                      <span
                                        className="text-xs uppercase tracking-wider"
                                        style={{
                                          color: "rgba(0,0,0,0.4)",
                                        }}
                                      >
                                        Potential Payout
                                      </span>
                                      <span
                                        className="text-sm font-bold"
                                        style={{
                                          color: "#0a0a0a",
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
                          color: "rgba(0,0,0,0.25)",
                          margin: "0 auto 12px",
                        }}
                      />
                      <p
                        className="text-sm"
                        style={{ color: "rgba(0,0,0,0.4)" }}
                      >
                        No sim bets yet. Place your first one in the Simulator.
                      </p>
                    </div>
                  )}
                </motion.div>

                {/* ─── Deeper Stats ─── */}
                {(insights.length > 0 ||
                  legCountBreakdown.length > 0 ||
                  oddsRangeBreakdown.length > 0 ||
                  (perLeg && perLeg.total > 0)) && (
                  <motion.div
                    className="mt-16 md:mt-20"
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.5 }}
                  >
                    <h2
                      className="text-2xl md:text-3xl mb-3"
                      style={{
                        fontFamily: "'DM Serif Display', serif",
                        color: "#0a0a0a",
                      }}
                    >
                      Deeper Stats
                    </h2>
                    <p
                      className="text-xs mb-8 max-w-2xl"
                      style={{ color: "rgba(0,0,0,0.45)", lineHeight: 1.6 }}
                    >
                      Where you&apos;re winning, where you&apos;re leaking, what to lean into. All from your sim history.
                    </p>

                    {/* Per-leg hit rate — the diagnostic stat */}
                    {perLeg && perLeg.total > 0 && (
                      <div
                        className="mb-8 rounded-xl p-5 md:p-6"
                        style={{
                          background: "#FFFFFF",
                          border: "1px solid rgba(0,0,0,0.06)",
                        }}
                      >
                        <div className="flex items-baseline justify-between gap-4 flex-wrap">
                          <div>
                            <div className="text-xs uppercase tracking-widest text-black/45 mb-2">
                              Per-Leg Hit Rate
                            </div>
                            <div
                              className="text-3xl md:text-4xl font-bold"
                              style={{
                                color:
                                  perLeg.hitRate >= 50 ? "#22C55E" : "#0a0a0a",
                                fontFamily: "var(--font-geist-mono)",
                              }}
                            >
                              {perLeg.hitRate.toFixed(1)}%
                            </div>
                            <div className="text-xs text-black/40 mt-2">
                              {perLeg.won} of {perLeg.total} individual picks hit · across {perLeg.sampledParlays} resolved parlays
                            </div>
                          </div>
                          <div className="max-w-sm text-xs leading-relaxed text-black/55">
                            How often each individual leg hits, separate from whether the parlay cashed.
                            A high per-leg with a low parlay rate means your picks are right but the parlay format is grinding you — go shorter.
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Insights — auto-generated coaching */}
                    {insights.length > 0 && (
                      <div className="mb-12 space-y-3">
                        {insights.map((ins, i) => {
                          const palette =
                            ins.tone === "good"
                              ? {
                                  bg: "rgba(34,197,94,0.08)",
                                  border: "rgba(34,197,94,0.20)",
                                  text: "#15803d",
                                  label: "EDGE",
                                }
                              : ins.tone === "bad"
                                ? {
                                    bg: "rgba(239,68,68,0.06)",
                                    border: "rgba(239,68,68,0.18)",
                                    text: "#b91c1c",
                                    label: "LEAK",
                                  }
                                : {
                                    bg: "rgba(0,0,0,0.04)",
                                    border: "rgba(0,0,0,0.08)",
                                    text: "#0a0a0a",
                                    label: "NOTE",
                                  };
                          return (
                            <div
                              key={i}
                              className="rounded-xl p-4 md:p-5 flex items-start gap-3"
                              style={{
                                background: palette.bg,
                                border: `1px solid ${palette.border}`,
                              }}
                            >
                              <span
                                className="text-[10px] font-bold uppercase tracking-widest flex-shrink-0 px-2 py-0.5 rounded"
                                style={{
                                  color: palette.text,
                                  background: "rgba(255,255,255,0.6)",
                                  border: `1px solid ${palette.border}`,
                                }}
                              >
                                {palette.label}
                              </span>
                              <span
                                className="text-sm leading-relaxed"
                                style={{ color: "rgba(0,0,0,0.75)" }}
                              >
                                {ins.text}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* By Leg Count */}
                    {legCountBreakdown.length > 0 && (
                      <div className="mb-12">
                        <h3
                          className="text-lg md:text-xl mb-4"
                          style={{
                            fontFamily: "'DM Serif Display', serif",
                            color: "#0a0a0a",
                          }}
                        >
                          By Parlay Size
                        </h3>
                        <div className="space-y-3">
                          {legCountBreakdown.map((lc) => {
                            const max = Math.max(
                              ...legCountBreakdown.map((l) => l.winRate),
                              1,
                            );
                            return (
                              <div
                                key={lc.label}
                                className="flex items-center gap-4 md:gap-6"
                              >
                                <div
                                  className="w-12 text-sm font-semibold flex-shrink-0"
                                  style={{ color: "rgba(0,0,0,0.7)" }}
                                >
                                  {lc.label}
                                </div>
                                <div
                                  className="text-xs flex-shrink-0 w-16 text-right"
                                  style={{
                                    color: "rgba(0,0,0,0.45)",
                                    fontFamily: "var(--font-geist-mono)",
                                  }}
                                >
                                  {lc.won}-{lc.lost}
                                </div>
                                <div
                                  className="flex-1 h-7 rounded overflow-hidden"
                                  style={{ background: "rgba(0,0,0,0.04)" }}
                                >
                                  <div
                                    className="h-full rounded"
                                    style={{
                                      width: `${(lc.winRate / max) * 100}%`,
                                      background:
                                        lc.winRate >= 50
                                          ? "linear-gradient(90deg, #22C55E, rgba(34,197,94,0.7))"
                                          : "linear-gradient(90deg, #0a0a0a, rgba(0,0,0,0.5))",
                                      minWidth: "2px",
                                    }}
                                  />
                                </div>
                                <div
                                  className="w-20 text-right text-xs font-semibold flex-shrink-0"
                                  style={{
                                    color:
                                      lc.profit >= 0 ? "#22C55E" : "#EF4444",
                                    fontFamily: "var(--font-geist-mono)",
                                  }}
                                >
                                  {lc.profit >= 0 ? "+" : "-"}$
                                  {Math.abs(lc.profit).toFixed(0)}
                                </div>
                                <div
                                  className="w-14 text-right text-sm font-bold flex-shrink-0"
                                  style={{
                                    color:
                                      lc.winRate >= 50 ? "#22c55e" : "#ef4444",
                                    fontFamily: "var(--font-geist-mono)",
                                  }}
                                >
                                  {lc.winRate.toFixed(0)}%
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* By Odds Range */}
                    {oddsRangeBreakdown.length > 0 && (
                      <div className="mb-4">
                        <h3
                          className="text-lg md:text-xl mb-4"
                          style={{
                            fontFamily: "'DM Serif Display', serif",
                            color: "#0a0a0a",
                          }}
                        >
                          By Odds Range
                        </h3>
                        <div className="space-y-3">
                          {oddsRangeBreakdown.map((or) => {
                            const max = Math.max(
                              ...oddsRangeBreakdown.map((o) => o.winRate),
                              1,
                            );
                            return (
                              <div
                                key={or.label}
                                className="flex items-center gap-4 md:gap-6"
                              >
                                <div
                                  className="w-44 md:w-52 text-sm font-semibold flex-shrink-0 truncate"
                                  style={{ color: "rgba(0,0,0,0.7)" }}
                                >
                                  {or.label}
                                </div>
                                <div
                                  className="text-xs flex-shrink-0 w-16 text-right"
                                  style={{
                                    color: "rgba(0,0,0,0.45)",
                                    fontFamily: "var(--font-geist-mono)",
                                  }}
                                >
                                  {or.won}-{or.lost}
                                </div>
                                <div
                                  className="flex-1 h-7 rounded overflow-hidden"
                                  style={{ background: "rgba(0,0,0,0.04)" }}
                                >
                                  <div
                                    className="h-full rounded"
                                    style={{
                                      width: `${(or.winRate / max) * 100}%`,
                                      background:
                                        or.winRate >= 50
                                          ? "linear-gradient(90deg, #22C55E, rgba(34,197,94,0.7))"
                                          : "linear-gradient(90deg, #0a0a0a, rgba(0,0,0,0.5))",
                                      minWidth: "2px",
                                    }}
                                  />
                                </div>
                                <div
                                  className="w-20 text-right text-xs font-semibold flex-shrink-0"
                                  style={{
                                    color:
                                      or.profit >= 0 ? "#22C55E" : "#EF4444",
                                    fontFamily: "var(--font-geist-mono)",
                                  }}
                                >
                                  {or.profit >= 0 ? "+" : "-"}$
                                  {Math.abs(or.profit).toFixed(0)}
                                </div>
                                <div
                                  className="w-14 text-right text-sm font-bold flex-shrink-0"
                                  style={{
                                    color:
                                      or.winRate >= 50 ? "#22c55e" : "#ef4444",
                                    fontFamily: "var(--font-geist-mono)",
                                  }}
                                >
                                  {or.winRate.toFixed(0)}%
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}
              </motion.div>
              );
            })()}
          </AnimatePresence>
        </div>
      </main>

      {/* ─── Footer ─── */}
      <footer
        className="px-6 py-12"
        style={{ borderTop: "1px solid rgba(0,0,0,0.06)" }}
      >
        <div className="max-w-[1400px] mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm" style={{ color: "rgba(0,0,0,0.4)" }}>
            BayParlays. AI-powered parlay optimization.
          </p>
          <p className="text-xs" style={{ color: "rgba(0,0,0,0.25)" }}>
            Sim bets use simulated money only. No real bets are placed.
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
      <div
        className="w-24 h-7 rounded mb-6"
        style={{ background: "rgba(0,0,0,0.06)" }}
      />
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="flex items-center gap-4 animate-pulse">
          <div
            className="w-16 h-4 rounded"
            style={{ background: "rgba(0,0,0,0.06)" }}
          />
          <div
            className="w-12 h-4 rounded"
            style={{ background: "rgba(0,0,0,0.04)" }}
          />
          <div
            className="flex-1 h-7 rounded"
            style={{ background: "rgba(0,0,0,0.04)" }}
          />
          <div
            className="w-10 h-4 rounded"
            style={{ background: "rgba(0,0,0,0.06)" }}
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
        style={{ background: "rgba(0,0,0,0.06)" }}
      />
      <div
        className="w-8 h-5 rounded"
        style={{ background: "rgba(0,0,0,0.04)" }}
      />
      <div
        className="w-16 h-5 rounded"
        style={{ background: "rgba(0,0,0,0.06)" }}
      />
      <div
        className="w-12 h-5 rounded"
        style={{ background: "rgba(0,0,0,0.04)" }}
      />
      <div
        className="w-16 h-6 rounded-full"
        style={{ background: "rgba(0,0,0,0.06)" }}
      />
      <div className="flex-1" />
      <div
        className="w-16 h-5 rounded"
        style={{ background: "rgba(0,0,0,0.06)" }}
      />
    </div>
  );
}
