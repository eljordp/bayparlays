"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Logo } from "@/app/components/Logo";
import {
  ChevronDown,
  ChevronUp,
  Menu,
  X,
  ArrowUpRight,
  BarChart3,
  Trophy,
  DollarSign,
  Percent,
  Hash,
  Flame,
  Zap,
  Clock,
} from "lucide-react";

/* ─── Types ─── */

interface Streak {
  type: "W" | "L";
  count: number;
}

interface Stats {
  totalParlays: number;
  won: number;
  lost: number;
  pending: number;
  winRate: number;
  totalProfit: number;
  roi: number;
  currentStreak: Streak;
  bestPayout: number;
  last7Days: { won: number; lost: number; profit: number };
}

interface SportBreakdown {
  sport: string;
  won: number;
  lost: number;
  winRate: number;
}

interface RecentParlay {
  id: string;
  created_at: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  legs: any[];
  combined_odds: string;
  status: string;
  payout: number;
  profit: number;
  ev_percent: number;
}

interface ResultsData {
  stats: Stats;
  sportBreakdown: SportBreakdown[];
  recentParlays: RecentParlay[];
}

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
];

/* ─── Component ─── */

export default function ResultsPage() {
  const [data, setData] = useState<ResultsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [expandedParlay, setExpandedParlay] = useState<string | null>(null);

  useEffect(() => {
    async function fetchResults() {
      try {
        const res = await fetch("/api/track/results");
        if (!res.ok) throw new Error("Failed to fetch results");
        const json: ResultsData = await res.json();
        setData(json);
      } catch {
        setError("Unable to load track record.");
      } finally {
        setLoading(false);
      }
    }
    fetchResults();
  }, []);

  const stats = data?.stats;
  const sportBreakdown = data?.sportBreakdown ?? [];
  const recentParlays = data?.recentParlays ?? [];
  const maxSportWinRate = Math.max(...sportBreakdown.map((s) => s.winRate), 1);

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
                    color: link.href === "/results" ? "#FF3B3B" : "rgba(255,255,255,0.5)",
                    fontWeight: link.href === "/results" ? 600 : 400,
                  }}
                  onMouseEnter={(e) => {
                    if (link.href !== "/results") e.currentTarget.style.color = "rgba(255,255,255,0.9)";
                  }}
                  onMouseLeave={(e) => {
                    if (link.href !== "/results") e.currentTarget.style.color = "rgba(255,255,255,0.5)";
                  }}
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/builder"
              className="hidden sm:flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold transition-all duration-300"
              style={{ background: "#FF3B3B", color: "#0a0a0a" }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "#FF5252";
                e.currentTarget.style.transform = "translateY(-1px)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "#FF3B3B";
                e.currentTarget.style.transform = "translateY(0)";
              }}
            >
              Build Your Own
              <ArrowUpRight size={14} strokeWidth={2.5} />
            </Link>
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
                      color: link.href === "/results" ? "#FF3B3B" : "rgba(255,255,255,0.6)",
                      background: link.href === "/results" ? "rgba(255,59,59,0.08)" : "transparent",
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
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <h1
              className="text-5xl md:text-7xl font-normal leading-[1.05] mb-5"
              style={{ fontFamily: "'DM Serif Display', serif", color: "#ededed" }}
            >
              Track Record
            </h1>
            <p
              className="text-lg md:text-xl max-w-2xl"
              style={{ color: "rgba(255,255,255,0.45)", lineHeight: 1.6 }}
            >
              Every AI parlay we generate is tracked. No cherry-picking. No hiding losses.
            </p>
            <p className="mt-3 text-xs uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.25)" }}>
              Updated in real-time
            </p>
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
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                >
                  <BarChart3 size={32} style={{ color: "rgba(255,255,255,0.2)" }} />
                </div>
                <p className="text-xl font-medium mb-2" style={{ color: "rgba(255,255,255,0.6)" }}>
                  {error || "No tracked parlays yet."}
                </p>
                <p className="text-sm" style={{ color: "rgba(255,255,255,0.3)" }}>
                  Check back soon.
                </p>
              </motion.div>
            )}

            {/* Data loaded */}
            {!loading && !error && data && stats && (
              <motion.div key="content" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                {/* ─── Stats Dashboard ─── */}
                <motion.div
                  className="grid grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4"
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.1 }}
                >
                  <StatCard
                    icon={<Trophy size={16} />}
                    label="Win Rate"
                    value={`${stats.winRate.toFixed(1)}%`}
                    valueColor={stats.winRate >= 50 ? "#22c55e" : "#ef4444"}
                    sublabel={`${stats.won}W - ${stats.lost}L`}
                    delay={0}
                  />
                  <StatCard
                    icon={<DollarSign size={16} />}
                    label="Total Profit"
                    value={formatMoney(stats.totalProfit)}
                    valueColor={stats.totalProfit >= 0 ? "#22c55e" : "#ef4444"}
                    sublabel="All time"
                    delay={0.05}
                  />
                  <StatCard
                    icon={<Percent size={16} />}
                    label="ROI"
                    value={`${stats.roi >= 0 ? "+" : ""}${stats.roi.toFixed(1)}%`}
                    valueColor={stats.roi >= 0 ? "#22c55e" : "#ef4444"}
                    sublabel="Return on investment"
                    delay={0.1}
                  />
                  <StatCard
                    icon={<Hash size={16} />}
                    label="Total Parlays"
                    value={String(stats.totalParlays)}
                    valueColor="#ededed"
                    sublabel={`${stats.pending} pending`}
                    delay={0.15}
                  />
                  <StatCard
                    icon={<Flame size={16} />}
                    label="Current Streak"
                    value={`${stats.currentStreak.type}${stats.currentStreak.count}`}
                    valueColor={stats.currentStreak.type === "W" ? "#22c55e" : "#ef4444"}
                    sublabel={stats.currentStreak.type === "W" ? "Winning" : "Losing"}
                    delay={0.2}
                  />
                  <StatCard
                    icon={<Zap size={16} />}
                    label="Best Payout"
                    value={`$${stats.bestPayout.toLocaleString()}`}
                    valueColor="#FF3B3B"
                    sublabel="Single parlay"
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
                      style={{ fontFamily: "'DM Serif Display', serif", color: "#ededed" }}
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
                            style={{ color: "rgba(255,255,255,0.7)" }}
                          >
                            {sport.sport}
                          </div>
                          <div
                            className="text-xs flex-shrink-0 w-16 text-right"
                            style={{ color: "rgba(255,255,255,0.35)", fontFamily: "var(--font-geist-mono)" }}
                          >
                            {sport.won}-{sport.lost}
                          </div>
                          <div className="flex-1 h-7 rounded overflow-hidden" style={{ background: "rgba(255,255,255,0.04)" }}>
                            <motion.div
                              className="h-full rounded"
                              initial={{ width: 0 }}
                              animate={{ width: `${(sport.winRate / maxSportWinRate) * 100}%` }}
                              transition={{ duration: 0.8, delay: 0.4 + idx * 0.06, ease: "easeOut" }}
                              style={{
                                background: sport.winRate >= 50
                                  ? "linear-gradient(90deg, #FF3B3B, #FF5252)"
                                  : "linear-gradient(90deg, rgba(255,59,59,0.4), rgba(255,59,59,0.6))",
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

                {/* ─── Recent Parlays Feed ─── */}
                <motion.div
                  className="mt-16 md:mt-20"
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.4 }}
                >
                  <h2
                    className="text-2xl md:text-3xl mb-8"
                    style={{ fontFamily: "'DM Serif Display', serif", color: "#ededed" }}
                  >
                    Recent Parlays
                  </h2>

                  {/* Table header - desktop */}
                  <div
                    className="hidden md:grid items-center gap-4 px-6 py-3 text-xs uppercase tracking-wider font-medium"
                    style={{
                      gridTemplateColumns: "140px 60px 90px 70px 90px 100px 40px",
                      color: "rgba(255,255,255,0.25)",
                      borderBottom: "1px solid rgba(255,255,255,0.06)",
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
                              background: isExpanded ? "rgba(255,255,255,0.03)" : "transparent",
                            }}
                            onMouseEnter={(e) => {
                              if (!isExpanded) e.currentTarget.style.background = "rgba(255,255,255,0.02)";
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
                                <div className="text-sm" style={{ color: "rgba(255,255,255,0.7)" }}>
                                  {formatDate(parlay.created_at)}
                                </div>
                                <div className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.25)" }}>
                                  {formatTime(parlay.created_at)}
                                </div>
                              </div>
                              <div
                                className="text-sm text-center font-medium"
                                style={{ color: "rgba(255,255,255,0.6)", fontFamily: "var(--font-geist-mono)" }}
                              >
                                {parlay.legs.length}
                              </div>
                              <div
                                className="text-sm text-right font-semibold"
                                style={{ color: "#FF3B3B", fontFamily: "var(--font-geist-mono)" }}
                              >
                                {parlay.combined_odds}
                              </div>
                              <div
                                className="text-sm text-right font-medium"
                                style={{
                                  color: parlay.ev_percent > 0 ? "#22c55e" : "rgba(255,255,255,0.4)",
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
                              <div
                                className="text-sm text-right font-bold"
                                style={{
                                  color: parlay.profit > 0 ? "#22c55e" : parlay.profit < 0 ? "#ef4444" : "rgba(255,255,255,0.4)",
                                  fontFamily: "var(--font-geist-mono)",
                                }}
                              >
                                {parlay.profit > 0 ? "+" : ""}
                                {parlay.profit !== 0 ? `$${Math.abs(parlay.profit).toLocaleString()}` : "--"}
                              </div>
                              <div className="flex justify-end" style={{ color: "rgba(255,255,255,0.25)" }}>
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
                                  <span className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>
                                    {formatDate(parlay.created_at)}
                                  </span>
                                </div>
                                <div style={{ color: "rgba(255,255,255,0.25)" }}>
                                  {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                </div>
                              </div>
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                  <div>
                                    <span className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>
                                      {parlay.legs.length} legs
                                    </span>
                                    <span className="mx-2" style={{ color: "rgba(255,255,255,0.1)" }}>
                                      |
                                    </span>
                                    <span
                                      className="text-sm font-semibold"
                                      style={{ color: "#FF3B3B", fontFamily: "var(--font-geist-mono)" }}
                                    >
                                      {parlay.combined_odds}
                                    </span>
                                  </div>
                                </div>
                                <span
                                  className="text-sm font-bold"
                                  style={{
                                    color: parlay.profit > 0 ? "#22c55e" : parlay.profit < 0 ? "#ef4444" : "rgba(255,255,255,0.4)",
                                    fontFamily: "var(--font-geist-mono)",
                                  }}
                                >
                                  {parlay.profit > 0 ? "+" : ""}
                                  {parlay.profit !== 0 ? `$${Math.abs(parlay.profit).toLocaleString()}` : "--"}
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
                                  {parlay.legs.map((leg: any, li: number) => (
                                    <div
                                      key={li}
                                      className="flex items-center justify-between px-4 md:px-6 py-3"
                                      style={{
                                        borderBottom:
                                          li < parlay.legs.length - 1
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
                                                background: "rgba(255,59,59,0.08)",
                                                color: "#FF3B3B",
                                                border: "1px solid rgba(255,59,59,0.15)",
                                              }}
                                            >
                                              {leg.sport}
                                            </span>
                                          )}
                                          <span className="text-xs truncate" style={{ color: "rgba(255,255,255,0.4)" }}>
                                            {leg.game || leg.matchup || ""}
                                          </span>
                                        </div>
                                        <div className="text-sm font-medium mt-1" style={{ color: "#ededed" }}>
                                          {leg.pick || leg.selection || ""}
                                          {(leg.market || leg.type) && (
                                            <span className="ml-2 font-normal" style={{ color: "rgba(255,255,255,0.3)" }}>
                                              {leg.market || leg.type}
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-4 flex-shrink-0">
                                        {leg.odds && (
                                          <span
                                            className="text-sm font-bold"
                                            style={{ color: "#FF3B3B", fontFamily: "var(--font-geist-mono)" }}
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

                                  {/* Payout row */}
                                  {parlay.payout > 0 && (
                                    <div
                                      className="flex items-center justify-between px-4 md:px-6 py-3"
                                      style={{ borderTop: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.01)" }}
                                    >
                                      <span className="text-xs uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.3)" }}>
                                        Payout
                                      </span>
                                      <span
                                        className="text-sm font-bold"
                                        style={{ color: "#ededed", fontFamily: "var(--font-geist-mono)" }}
                                      >
                                        ${parlay.payout.toLocaleString()}
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
                      <Clock size={28} style={{ color: "rgba(255,255,255,0.15)", margin: "0 auto 12px" }} />
                      <p className="text-sm" style={{ color: "rgba(255,255,255,0.3)" }}>
                        No tracked parlays yet. Check back soon.
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
      <footer className="px-6 py-12" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="max-w-[1400px] mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm" style={{ color: "rgba(255,255,255,0.25)" }}>
            BayParlays. AI-powered parlay optimization.
          </p>
          <p className="text-xs" style={{ color: "rgba(255,255,255,0.15)" }}>
            Not financial advice. Gamble responsibly.
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
        <span className="text-xs uppercase tracking-wider font-medium" style={{ color: "rgba(255,255,255,0.35)" }}>
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
          style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)" }}
        >
          <div className="w-20 h-3 rounded mb-4" style={{ background: "rgba(255,255,255,0.06)" }} />
          <div className="w-24 h-9 rounded mb-2" style={{ background: "rgba(255,255,255,0.08)" }} />
          <div className="w-16 h-3 rounded" style={{ background: "rgba(255,255,255,0.04)" }} />
        </div>
      ))}
    </div>
  );
}

function BarSkeletons() {
  return (
    <div className="space-y-4">
      <div className="w-24 h-7 rounded mb-6" style={{ background: "rgba(255,255,255,0.06)" }} />
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="flex items-center gap-4 animate-pulse">
          <div className="w-16 h-4 rounded" style={{ background: "rgba(255,255,255,0.06)" }} />
          <div className="w-12 h-4 rounded" style={{ background: "rgba(255,255,255,0.04)" }} />
          <div className="flex-1 h-7 rounded" style={{ background: "rgba(255,255,255,0.03)" }} />
          <div className="w-10 h-4 rounded" style={{ background: "rgba(255,255,255,0.05)" }} />
        </div>
      ))}
    </div>
  );
}

function ParlayRowSkeleton() {
  return (
    <div className="flex items-center gap-4 px-6 py-4 animate-pulse">
      <div className="w-28 h-5 rounded" style={{ background: "rgba(255,255,255,0.05)" }} />
      <div className="w-8 h-5 rounded" style={{ background: "rgba(255,255,255,0.04)" }} />
      <div className="w-16 h-5 rounded" style={{ background: "rgba(255,255,255,0.05)" }} />
      <div className="w-12 h-5 rounded" style={{ background: "rgba(255,255,255,0.04)" }} />
      <div className="w-16 h-6 rounded-full" style={{ background: "rgba(255,255,255,0.05)" }} />
      <div className="flex-1" />
      <div className="w-16 h-5 rounded" style={{ background: "rgba(255,255,255,0.05)" }} />
    </div>
  );
}
