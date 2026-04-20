"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Logo } from "@/app/components/Logo";
import { useAuth } from "@/app/components/AuthProvider";
import { NavUser } from "@/app/components/NavUser";
import {
  TrendingUp,
  TrendingDown,
  Clock,
  Copy,
  Check,
  Activity,
  BarChart3,
  Target,
  Shield,
  Flame,
  Menu,
  X,
} from "lucide-react";

/* ─── Types ─── */

interface Leg {
  sport: string;
  game: string;
  pick: string;
  market: string;
  odds: number;
  book: string;
  impliedProb: number;
  edgeScore: number;
}

interface Parlay {
  id: string;
  legs: Leg[];
  combinedOdds: string;
  combinedDecimal: number;
  ev: number;
  evPercent: number;
  confidence: number;
  payout: number;
  timestamp: string;
}

interface Meta {
  sportsScanned: string[];
  gamesAnalyzed: number;
  legsEvaluated: number;
  generatedAt: string;
}

interface ParlayResponse {
  parlays: Parlay[];
  meta: Meta;
}

/* ─── Constants ─── */

const SPORTS = ["All", "NBA", "NFL", "MLB", "NHL", "NCAAB", "NCAAF", "MLS", "UFC"];
const LEG_COUNTS = [2, 3, 4, 5, 6];
const SORT_OPTIONS = [
  { value: "ev", label: "Best EV" },
  { value: "payout", label: "Highest Payout" },
  { value: "confidence", label: "Most Confident" },
] as const;

type SortOption = (typeof SORT_OPTIONS)[number]["value"];

const SPORT_COLORS: Record<string, string> = {
  NBA: "#C9082A",
  NFL: "#013369",
  MLB: "#002D72",
  NHL: "#000000",
  NCAAB: "#FF6600",
  NCAAF: "#8B0000",
  MLS: "#80B918",
  UFC: "#D20A0A",
};

/* ─── Helpers ─── */

function formatOdds(odds: number): string {
  return odds > 0 ? `+${odds}` : `${odds}`;
}

function confidenceLabel(c: number): { text: string; color: string; bg: string } {
  if (c >= 75) return { text: "High", color: "#FF3B3B", bg: "rgba(255,59,59,0.12)" };
  if (c >= 50) return { text: "Medium", color: "#FFB800", bg: "rgba(255,184,0,0.12)" };
  return { text: "Low", color: "#FF4D4D", bg: "rgba(255,77,77,0.12)" };
}

function timeAgo(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
}

/* ─── Component ─── */

export default function ParlaysPage() {
  const [parlays, setParlays] = useState<Parlay[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedSport, setSelectedSport] = useState("All");
  const [selectedLegs, setSelectedLegs] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>("ev");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  const { isPro, isAdmin: isAuthAdmin, tier } = useAuth();

  // Admin bypass — check for admin key in URL or localStorage
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const key = params.get("admin");
    if (key === "bayparlays2026") {
      localStorage.setItem("bp_admin", "true");
      setIsAdmin(true);
      window.history.replaceState({}, "", "/parlays");
    } else if (localStorage.getItem("bp_admin") === "true") {
      setIsAdmin(true);
    }
  }, []);

  // Tier-based access
  const isVipAccess = isAdmin || isAuthAdmin || tier === "vip" || tier === "admin";
  const isSharpAccess = isPro || isVipAccess; // includes sharp + vip + admin

  const fetchParlays = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ count: "10" });
      if (selectedSport !== "All") params.set("sports", selectedSport);
      if (selectedLegs) params.set("legs", String(selectedLegs));
      params.set("sort", sortBy);

      const res = await fetch(`/api/parlays?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch parlays");

      const data: ParlayResponse = await res.json();
      setParlays(data.parlays);
      setMeta(data.meta);
    } catch {
      setError("Unable to load parlays right now.");
      setParlays([]);
    } finally {
      setLoading(false);
    }
  }, [selectedSport, selectedLegs, sortBy]);

  useEffect(() => {
    fetchParlays();
  }, [fetchParlays]);

  const handleCopy = (parlay: Parlay) => {
    const text = parlay.legs
      .map((l) => `${l.sport} | ${l.game} | ${l.pick} (${formatOdds(l.odds)}) @ ${l.book}`)
      .join("\n");
    navigator.clipboard.writeText(text);
    setCopiedId(parlay.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="min-h-screen" style={{ background: "#0a0a0a" }}>
      {/* ─── Nav ─── */}
      <nav className="fixed top-0 left-0 right-0 z-50" style={{ background: "rgba(10,10,10,0.85)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="max-w-[1400px] mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-10">
            <Link href="/" className="flex items-center">
              <Logo />
            </Link>
            <div className="hidden md:flex items-center gap-8">
              {[
                { href: "/", label: "Home" },
                { href: "/parlays", label: "AI Parlays" },
                { href: "/odds", label: "Odds" },
                { href: "/builder", label: "Builder" },
                { href: "/results", label: "Results" },
                { href: "/simulator", label: "Simulator" },
              ].map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-sm transition-colors duration-200"
                  style={{
                    color: link.href === "/parlays" ? "#FF3B3B" : "rgba(255,255,255,0.5)",
                    fontWeight: link.href === "/parlays" ? 600 : 400,
                  }}
                  onMouseEnter={(e) => { if (link.href !== "/parlays") e.currentTarget.style.color = "rgba(255,255,255,0.9)"; }}
                  onMouseLeave={(e) => { if (link.href !== "/parlays") e.currentTarget.style.color = "rgba(255,255,255,0.5)"; }}
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
                {[
                  { href: "/", label: "Home" },
                  { href: "/parlays", label: "AI Parlays" },
                  { href: "/odds", label: "Odds" },
                  { href: "/builder", label: "Builder" },
                  { href: "/results", label: "Results" },
                  { href: "/simulator", label: "Simulator" },
                ].map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className="py-3 px-4 rounded-lg text-sm font-medium transition-colors duration-150"
                    style={{
                      color: link.href === "/parlays" ? "#FF3B3B" : "rgba(255,255,255,0.6)",
                      background: link.href === "/parlays" ? "rgba(255,59,59,0.08)" : "transparent",
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
      <header className="pt-24 pb-10 px-4 md:pt-32 md:pb-16 md:px-6">
        <div className="max-w-[1400px] mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="flex items-center gap-3 mb-6">
              <div
                className="w-2.5 h-2.5 rounded-full glow-pulse"
                style={{ background: "#FF3B3B" }}
              />
              <span className="text-xs font-medium tracking-widest uppercase" style={{ color: "#FF3B3B" }}>
                Live &middot; Updated every 5 minutes
              </span>
            </div>

            <h1
              className="text-5xl md:text-7xl font-normal leading-[1.05] mb-5"
              style={{ fontFamily: "'DM Serif Display', serif", color: "#ededed" }}
            >
              Today&apos;s AI Parlays
            </h1>
            <p className="text-lg md:text-xl max-w-2xl" style={{ color: "rgba(255,255,255,0.45)", lineHeight: 1.6 }}>
              Mathematically optimized. Every line scanned. Every edge calculated.
            </p>
          </motion.div>

          {/* Meta stats */}
          {meta && (
            <motion.div
              className="flex flex-wrap gap-4 md:gap-8 mt-12"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3, duration: 0.5 }}
            >
              {[
                { icon: Activity, value: meta.gamesAnalyzed, label: "Games Analyzed" },
                { icon: Target, value: meta.legsEvaluated.toLocaleString(), label: "Legs Evaluated" },
                { icon: BarChart3, value: meta.sportsScanned.length, label: "Sports Scanned" },
              ].map((stat) => (
                <div key={stat.label} className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center"
                    style={{ background: "rgba(255,59,59,0.08)", border: "1px solid rgba(255,59,59,0.15)" }}
                  >
                    <stat.icon size={18} style={{ color: "#FF3B3B" }} />
                  </div>
                  <div>
                    <div className="text-xl font-semibold" style={{ color: "#ededed" }}>{stat.value}</div>
                    <div className="text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>{stat.label}</div>
                  </div>
                </div>
              ))}
            </motion.div>
          )}
        </div>
      </header>

      {/* ─── Filters ─── */}
      <section className="px-4 md:px-6 pb-12 sticky top-16 z-40" style={{ background: "rgba(10,10,10,0.92)", backdropFilter: "blur(12px)" }}>
        <div className="max-w-[1400px] mx-auto py-5" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          {/* Sport filters */}
          <div className="flex overflow-x-auto scrollbar-hide flex-nowrap items-center gap-3 mb-5">
            <span className="text-xs font-medium uppercase tracking-wider mr-2 flex-shrink-0" style={{ color: "rgba(255,255,255,0.3)" }}>
              Sport
            </span>
            {SPORTS.map((sport) => (
              <button
                key={sport}
                onClick={() => setSelectedSport(sport)}
                className="px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 flex-shrink-0"
                style={{
                  background: selectedSport === sport ? "#FF3B3B" : "rgba(255,255,255,0.05)",
                  color: selectedSport === sport ? "#0a0a0a" : "rgba(255,255,255,0.5)",
                  border: selectedSport === sport ? "1px solid #FF3B3B" : "1px solid rgba(255,255,255,0.08)",
                }}
              >
                {sport}
              </button>
            ))}
          </div>

          {/* Leg count + Sort */}
          <div className="flex overflow-x-auto scrollbar-hide flex-nowrap items-center gap-6">
            <div className="flex items-center gap-3 flex-shrink-0">
              <span className="text-xs font-medium uppercase tracking-wider mr-1 flex-shrink-0" style={{ color: "rgba(255,255,255,0.3)" }}>
                Legs
              </span>
              {LEG_COUNTS.map((count) => (
                <button
                  key={count}
                  onClick={() => setSelectedLegs(selectedLegs === count ? null : count)}
                  className="w-10 h-10 rounded-lg text-sm font-semibold transition-all duration-200 flex items-center justify-center"
                  style={{
                    background: selectedLegs === count ? "rgba(255,59,59,0.15)" : "rgba(255,255,255,0.04)",
                    color: selectedLegs === count ? "#FF3B3B" : "rgba(255,255,255,0.45)",
                    border: selectedLegs === count ? "1px solid rgba(255,59,59,0.3)" : "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  {count}
                </button>
              ))}
            </div>

            <div className="h-6 w-px flex-shrink-0" style={{ background: "rgba(255,255,255,0.08)" }} />

            <div className="flex items-center gap-3 flex-shrink-0">
              <span className="text-xs font-medium uppercase tracking-wider mr-1 flex-shrink-0" style={{ color: "rgba(255,255,255,0.3)" }}>
                Sort
              </span>
              {SORT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setSortBy(opt.value)}
                  className="px-4 py-2 rounded-lg text-sm transition-all duration-200"
                  style={{
                    background: sortBy === opt.value ? "rgba(255,59,59,0.1)" : "transparent",
                    color: sortBy === opt.value ? "#FF3B3B" : "rgba(255,255,255,0.4)",
                    fontWeight: sortBy === opt.value ? 600 : 400,
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

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
                className="space-y-6"
              >
                {[1, 2, 3].map((i) => (
                  <SkeletonCard key={i} />
                ))}
              </motion.div>
            )}

            {/* Error / Empty */}
            {!loading && (error || parlays.length === 0) && (
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
                  <Shield size={32} style={{ color: "rgba(255,255,255,0.2)" }} />
                </div>
                <p className="text-xl font-medium mb-2" style={{ color: "rgba(255,255,255,0.6)" }}>
                  {error || "No parlays available right now."}
                </p>
                <p className="text-sm" style={{ color: "rgba(255,255,255,0.3)" }}>
                  Check back soon. Our AI is scanning every line.
                </p>
                <button
                  onClick={fetchParlays}
                  className="mt-8 px-6 py-3 rounded-full text-sm font-semibold transition-all duration-200"
                  style={{ background: "rgba(255,59,59,0.1)", color: "#FF3B3B", border: "1px solid rgba(255,59,59,0.2)" }}
                >
                  Retry
                </button>
              </motion.div>
            )}

            {/* Parlay cards */}
            {!loading && !error && parlays.length > 0 && (
              <motion.div
                key="content"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-6"
              >
                {/* VIP/Admin: see everything */}
                {isVipAccess ? (
                  parlays.map((parlay, idx) => (
                    <ParlayCard
                      key={parlay.id}
                      parlay={parlay}
                      index={idx}
                      copiedId={copiedId}
                      onCopy={handleCopy}
                    />
                  ))
                ) : isSharpAccess ? (
                  <>
                    {/* Sharp: first 5 visible, rest locked */}
                    {parlays.slice(0, 5).map((parlay, idx) => (
                      <ParlayCard
                        key={parlay.id}
                        parlay={parlay}
                        index={idx}
                        copiedId={copiedId}
                        onCopy={handleCopy}
                      />
                    ))}

                    {parlays.length > 5 && (
                      <>
                        {parlays.slice(5).map((parlay, idx) => (
                          <div key={parlay.id} className="relative">
                            <ParlayCard
                              parlay={parlay}
                              index={idx + 5}
                              copiedId={copiedId}
                              onCopy={handleCopy}
                            />
                            <div className="absolute inset-0 z-10 backdrop-blur-sm bg-[#0a0a0a]/70 rounded-2xl flex flex-col items-center justify-center">
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="32"
                                height="32"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="rgba(255,255,255,0.35)"
                                strokeWidth="1.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                              </svg>
                              <p className="mt-4 text-lg font-semibold" style={{ color: "#ededed" }}>
                                Upgrade to VIP
                              </p>
                              <p className="mt-1 text-sm" style={{ color: "rgba(255,255,255,0.4)" }}>
                                Unlimited parlays, full builder, advanced analytics
                              </p>
                              <Link
                                href="/subscribe"
                                className="mt-5 px-8 py-3 rounded-full text-sm font-bold transition-all duration-200"
                                style={{ background: "#FF3B3B", color: "#0a0a0a" }}
                                onMouseEnter={(e) => { e.currentTarget.style.background = "#FF5252"; e.currentTarget.style.transform = "translateY(-1px)"; }}
                                onMouseLeave={(e) => { e.currentTarget.style.background = "#FF3B3B"; e.currentTarget.style.transform = "translateY(0)"; }}
                              >
                                Upgrade to VIP
                              </Link>
                            </div>
                          </div>
                        ))}
                      </>
                    )}
                  </>
                ) : (
                  <>
                    {/* Free: first 1 visible, rest locked */}
                    {parlays.length > 0 && (
                      <ParlayCard
                        key={parlays[0].id}
                        parlay={parlays[0]}
                        index={0}
                        copiedId={copiedId}
                        onCopy={handleCopy}
                      />
                    )}

                    {parlays.length > 1 && (
                      <>
                        {parlays.slice(1).map((parlay, idx) => (
                          <div key={parlay.id} className="relative">
                            <ParlayCard
                              parlay={parlay}
                              index={idx + 1}
                              copiedId={copiedId}
                              onCopy={handleCopy}
                            />
                            <div className="absolute inset-0 z-10 backdrop-blur-sm bg-[#0a0a0a]/70 rounded-2xl flex flex-col items-center justify-center">
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="32"
                                height="32"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="rgba(255,255,255,0.35)"
                                strokeWidth="1.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                              </svg>
                              <p className="mt-4 text-lg font-semibold" style={{ color: "#ededed" }}>
                                Unlock all parlays
                              </p>
                              <p className="mt-1 text-sm" style={{ color: "rgba(255,255,255,0.4)" }}>
                                Starting at $50/mo &mdash; 7-day free trial
                              </p>
                              <Link
                                href="/subscribe"
                                className="mt-5 px-8 py-3 rounded-full text-sm font-bold transition-all duration-200"
                                style={{ background: "#FF3B3B", color: "#0a0a0a" }}
                                onMouseEnter={(e) => { e.currentTarget.style.background = "#FF5252"; e.currentTarget.style.transform = "translateY(-1px)"; }}
                                onMouseLeave={(e) => { e.currentTarget.style.background = "#FF3B3B"; e.currentTarget.style.transform = "translateY(0)"; }}
                              >
                                Start Free Trial
                              </Link>
                            </div>
                          </div>
                        ))}

                        {/* CTA Banner */}
                        <div
                          className="mt-12 rounded-2xl px-6 py-10 md:px-12 md:py-14 flex flex-col md:flex-row items-center justify-between gap-6"
                          style={{
                            background: "linear-gradient(135deg, rgba(255,59,59,0.08) 0%, rgba(255,59,59,0.03) 100%)",
                            border: "1px solid rgba(255,59,59,0.15)",
                          }}
                        >
                          <div>
                            <p className="text-xl md:text-2xl font-semibold" style={{ color: "#ededed" }}>
                              {parlays.length} parlays found today.
                            </p>
                            <p className="mt-2 text-sm md:text-base" style={{ color: "rgba(255,255,255,0.45)" }}>
                              Subscribe to unlock every AI-optimized parlay. Try free for 7 days.
                            </p>
                          </div>
                          <Link
                            href="/subscribe"
                            className="flex-shrink-0 px-8 py-4 rounded-full text-base font-bold transition-all duration-200"
                            style={{ background: "#FF3B3B", color: "#0a0a0a" }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = "#FF5252"; e.currentTarget.style.transform = "translateY(-1px)"; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = "#FF3B3B"; e.currentTarget.style.transform = "translateY(0)"; }}
                          >
                            Start Free Trial
                          </Link>
                        </div>
                      </>
                    )}
                  </>
                )}
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

/* ─── Parlay Card ─── */

function ParlayCard({
  parlay,
  index,
  copiedId,
  onCopy,
}: {
  parlay: Parlay;
  index: number;
  copiedId: string | null;
  onCopy: (p: Parlay) => void;
}) {
  const conf = confidenceLabel(parlay.confidence);
  const evPositive = parlay.ev > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.08, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="rounded-2xl overflow-hidden"
      style={{
        background: "rgba(255,255,255,0.025)",
        border: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      {/* Card header */}
      <div className="px-4 md:px-8 py-5 flex items-center justify-between" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
        <div className="flex items-center gap-4">
          <span className="text-2xl font-black" style={{ color: "rgba(255,255,255,0.12)", fontVariantNumeric: "tabular-nums" }}>
            #{String(index + 1).padStart(2, "0")}
          </span>
          <div className="flex items-center gap-2">
            <Flame size={14} style={{ color: conf.color }} />
            <span
              className="text-xs font-semibold uppercase tracking-wider px-3 py-1 rounded-full"
              style={{ color: conf.color, background: conf.bg }}
            >
              {conf.text} Confidence
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Clock size={13} style={{ color: "rgba(255,255,255,0.25)" }} />
          <span className="text-xs" style={{ color: "rgba(255,255,255,0.25)" }}>
            {timeAgo(parlay.timestamp)}
          </span>
        </div>
      </div>

      {/* Legs */}
      <div className="px-4 md:px-8 py-4">
        <div className="space-y-1">
          {parlay.legs.map((leg, i) => (
            <div
              key={i}
              className="flex items-center gap-4 py-3 px-4 rounded-xl transition-colors duration-150"
              style={{ background: "transparent" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.025)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              {/* Sport badge */}
              <div
                className="hidden sm:flex items-center justify-center w-12 h-7 rounded text-[10px] font-bold uppercase tracking-wide flex-shrink-0"
                style={{
                  background: `${SPORT_COLORS[leg.sport] || "#333"}22`,
                  color: SPORT_COLORS[leg.sport] || "#888",
                  border: `1px solid ${SPORT_COLORS[leg.sport] || "#333"}33`,
                }}
              >
                {leg.sport}
              </div>

              {/* Game matchup */}
              <div className="flex-1 min-w-0">
                <div className="text-sm truncate" style={{ color: "rgba(255,255,255,0.5)" }}>
                  {leg.game}
                </div>
                <div className="text-sm font-semibold mt-0.5" style={{ color: "#ededed" }}>
                  {leg.pick}
                  <span className="font-normal ml-2" style={{ color: "rgba(255,255,255,0.3)" }}>
                    {leg.market}
                  </span>
                </div>
              </div>

              {/* Odds + book */}
              <div className="text-right flex-shrink-0">
                <div className="text-sm font-bold" style={{ color: "#FF3B3B" }}>
                  {formatOdds(leg.odds)}
                </div>
                <div className="text-[11px]" style={{ color: "rgba(255,255,255,0.3)" }}>
                  {leg.book}
                </div>
              </div>

              {/* Edge */}
              <div className="hidden md:flex items-center gap-1.5 flex-shrink-0 w-20 justify-end">
                {leg.edgeScore > 0 ? (
                  <TrendingUp size={13} style={{ color: "#FF3B3B" }} />
                ) : (
                  <TrendingDown size={13} style={{ color: "#FF4D4D" }} />
                )}
                <span
                  className="text-xs font-semibold"
                  style={{ color: leg.edgeScore > 0 ? "#FF3B3B" : "#FF4D4D" }}
                >
                  {leg.edgeScore > 0 ? "+" : ""}{leg.edgeScore.toFixed(1)}%
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom section */}
      <div
        className="px-4 md:px-8 py-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-6"
        style={{ borderTop: "1px solid rgba(255,255,255,0.05)", background: "rgba(255,59,59,0.02)" }}
      >
        {/* Left: Combined odds + payout */}
        <div className="flex items-center gap-8">
          <div>
            <div className="text-xs uppercase tracking-wider mb-1" style={{ color: "rgba(255,255,255,0.3)" }}>
              Combined Odds
            </div>
            <div
              className="text-3xl font-black tracking-tight"
              style={{ color: "#FF3B3B", fontVariantNumeric: "tabular-nums" }}
            >
              {parlay.combinedOdds.startsWith("+") || parlay.combinedOdds.startsWith("-")
                ? parlay.combinedOdds
                : `+${parlay.combinedOdds}`}
            </div>
          </div>

          <div className="h-12 w-px" style={{ background: "rgba(255,255,255,0.08)" }} />

          <div>
            <div className="text-xs uppercase tracking-wider mb-1" style={{ color: "rgba(255,255,255,0.3)" }}>
              $100 Bet Pays
            </div>
            <div className="text-2xl font-bold" style={{ color: "#ededed" }}>
              ${parlay.payout.toLocaleString()}
            </div>
          </div>
        </div>

        {/* Center: EV bar */}
        <div className="flex-1 max-w-full md:max-w-xs w-full">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.3)" }}>
              Expected Value
            </span>
            <span
              className="text-sm font-bold"
              style={{ color: evPositive ? "#FF3B3B" : "#FF4D4D" }}
            >
              {evPositive ? "+" : ""}{parlay.evPercent.toFixed(1)}% EV
            </span>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
            <motion.div
              className="h-full rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(Math.abs(parlay.evPercent) * 3, 100)}%` }}
              transition={{ duration: 1, delay: 0.3 + index * 0.08, ease: "easeOut" }}
              style={{
                background: evPositive
                  ? "linear-gradient(90deg, #FF3B3B, #FF5252)"
                  : "linear-gradient(90deg, #FF4D4D, #FF6666)",
              }}
            />
          </div>
        </div>

        {/* Right: Confidence ring + copy */}
        <div className="flex flex-wrap items-center gap-5">
          {/* Confidence ring */}
          <div className="relative w-14 h-14 flex items-center justify-center">
            <svg className="absolute inset-0 w-14 h-14 -rotate-90" viewBox="0 0 56 56">
              <circle
                cx="28"
                cy="28"
                r="24"
                fill="none"
                stroke="rgba(255,255,255,0.06)"
                strokeWidth="3"
              />
              <motion.circle
                cx="28"
                cy="28"
                r="24"
                fill="none"
                stroke={conf.color}
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 24}`}
                initial={{ strokeDashoffset: 2 * Math.PI * 24 }}
                animate={{ strokeDashoffset: 2 * Math.PI * 24 * (1 - parlay.confidence / 100) }}
                transition={{ duration: 1.2, delay: 0.2 + index * 0.08, ease: "easeOut" }}
              />
            </svg>
            <span className="text-sm font-bold" style={{ color: conf.color }}>
              {parlay.confidence}
            </span>
          </div>

          {/* Copy button */}
          <button
            onClick={() => onCopy(parlay)}
            className="flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold transition-all duration-200"
            style={{
              background: copiedId === parlay.id ? "rgba(255,59,59,0.15)" : "rgba(255,255,255,0.05)",
              color: copiedId === parlay.id ? "#FF3B3B" : "rgba(255,255,255,0.6)",
              border: copiedId === parlay.id ? "1px solid rgba(255,59,59,0.3)" : "1px solid rgba(255,255,255,0.08)",
            }}
            onMouseEnter={(e) => {
              if (copiedId !== parlay.id) {
                e.currentTarget.style.background = "rgba(255,255,255,0.08)";
                e.currentTarget.style.color = "#ededed";
              }
            }}
            onMouseLeave={(e) => {
              if (copiedId !== parlay.id) {
                e.currentTarget.style.background = "rgba(255,255,255,0.05)";
                e.currentTarget.style.color = "rgba(255,255,255,0.6)";
              }
            }}
          >
            {copiedId === parlay.id ? (
              <>
                <Check size={14} />
                Copied
              </>
            ) : (
              <>
                <Copy size={14} />
                Copy to Builder
              </>
            )}
          </button>
        </div>
      </div>
    </motion.div>
  );
}

/* ─── Skeleton Card ─── */

function SkeletonCard() {
  return (
    <div
      className="rounded-2xl overflow-hidden animate-pulse"
      style={{
        background: "rgba(255,255,255,0.025)",
        border: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      {/* Header skeleton */}
      <div className="px-4 md:px-8 py-5 flex items-center justify-between" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
        <div className="flex items-center gap-4">
          <div className="w-12 h-7 rounded" style={{ background: "rgba(255,255,255,0.06)" }} />
          <div className="w-32 h-5 rounded-full" style={{ background: "rgba(255,255,255,0.06)" }} />
        </div>
        <div className="w-16 h-4 rounded" style={{ background: "rgba(255,255,255,0.04)" }} />
      </div>

      {/* Legs skeleton */}
      <div className="px-4 md:px-8 py-4 space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-4 py-3 px-4">
            <div className="w-12 h-7 rounded" style={{ background: "rgba(255,255,255,0.05)" }} />
            <div className="flex-1 space-y-2">
              <div className="w-48 h-4 rounded" style={{ background: "rgba(255,255,255,0.05)" }} />
              <div className="w-32 h-4 rounded" style={{ background: "rgba(255,255,255,0.04)" }} />
            </div>
            <div className="w-14 h-5 rounded" style={{ background: "rgba(255,255,255,0.05)" }} />
          </div>
        ))}
      </div>

      {/* Bottom skeleton */}
      <div className="px-4 md:px-8 py-6 flex items-center gap-8" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
        <div className="space-y-2">
          <div className="w-20 h-3 rounded" style={{ background: "rgba(255,255,255,0.04)" }} />
          <div className="w-24 h-8 rounded" style={{ background: "rgba(255,255,255,0.06)" }} />
        </div>
        <div className="flex-1 space-y-2">
          <div className="w-28 h-3 rounded" style={{ background: "rgba(255,255,255,0.04)" }} />
          <div className="h-2 rounded-full w-full" style={{ background: "rgba(255,255,255,0.04)" }} />
        </div>
        <div className="w-14 h-14 rounded-full" style={{ background: "rgba(255,255,255,0.04)" }} />
        <div className="w-36 h-10 rounded-xl" style={{ background: "rgba(255,255,255,0.04)" }} />
      </div>
    </div>
  );
}
