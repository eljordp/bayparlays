"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/app/components/AuthProvider";
import { AppNav } from "@/app/components/AppNav";
import { PicksTabs } from "@/app/components/PicksTabs";
import {
  Copy,
  Check,
  Activity,
  BarChart3,
  Target,
  Shield,
} from "lucide-react";

/* ─── Types ─── */

interface TeamRecordInfo {
  wins: number;
  losses: number;
  winRate: number;
  streak: { type: "W" | "L"; count: number };
  lastFive: ("W" | "L")[];
}

interface Leg {
  sport: string;
  game: string;
  commenceTime?: string;
  pick: string;
  market: string;
  odds: number;
  book: string;
  bookCount?: number;
  impliedProb: number;
  ourProb?: number;
  trueEdge?: number;
  edgeScore: number;
  scored?: boolean;
  teamRecord?: TeamRecordInfo;
  reasons?: string[];
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
  recommendedBook?: string;
  category?: "ev" | "payout" | "confidence";
  impliedHitRate?: number;
  aiEstimate?: number;
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

// Odds range filter — client-side bucketing by combined American odds.
// "All" shows everything; the others let users dial in risk/reward directly.
const ODDS_RANGES = [
  { value: "all", label: "All", min: -Infinity, max: Infinity },
  { value: "safe", label: "Safe (+200–+500)", min: 200, max: 500 },
  { value: "medium", label: "Medium (+500–+1200)", min: 500, max: 1200 },
  { value: "longshot", label: "Longshot (+1200+)", min: 1200, max: Infinity },
] as const;

type OddsRange = (typeof ODDS_RANGES)[number]["value"];

function combinedOddsToAmerican(parlay: Parlay): number {
  // combinedOdds comes formatted like "+283" or "-145"; parse back.
  const raw = parlay.combinedOdds.replace(/^\+/, "");
  return parseInt(raw, 10);
}

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
  const [oddsRange, setOddsRange] = useState<OddsRange>("all");
  // Default to "Most Confident" — users want "will this hit?" before
  // "is this +EV math." Lock picks lead; EV + Payout are optional tabs.
  const [sortBy, setSortBy] = useState<SortOption>("confidence");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [pendingSimSigs, setPendingSimSigs] = useState<Set<string>>(new Set());

  const { user, isPro, isAdmin: isAuthAdmin, tier } = useAuth();

  // Fetch pending sim bets to mark parlays already placed
  useEffect(() => {
    if (!user) return;
    async function fetchPendingSims() {
      try {
        const res = await fetch(`/api/sim?user_id=${user!.id}`);
        if (res.ok) {
          const data = await res.json();
          const sigs = new Set<string>();
          for (const p of data.parlays || []) {
            if (p.status === "pending") {
              const sig = (p.legs || [])
                .map((l: { game: string; pick: string }) => `${l.game}::${l.pick}`)
                .sort()
                .join("|");
              sigs.add(sig);
            }
          }
          setPendingSimSigs(sigs);
        }
      } catch {
        // silent
      }
    }
    fetchPendingSims();
  }, [user]);

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

  // Apply client-side odds-range filter on top of the server-side fetched set.
  // Lets users dial risk/reward without re-fetching.
  const visibleParlays = (() => {
    if (oddsRange === "all") return parlays;
    const range = ODDS_RANGES.find((r) => r.value === oddsRange);
    if (!range) return parlays;
    return parlays.filter((p) => {
      const o = combinedOddsToAmerican(p);
      if (!Number.isFinite(o)) return true;
      return o >= range.min && o <= range.max;
    });
  })();

  const fetchParlays = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const effectiveTier = isAdmin
        ? "admin"
        : tier === "vip" || tier === "admin"
          ? "vip"
          : isPro
            ? "sharp"
            : "free";
      const countForTier =
        effectiveTier === "admin"
          ? 30
          : effectiveTier === "vip"
            ? 15
            : effectiveTier === "sharp"
              ? 8
              : 4;

      // "All" legs (selectedLegs = null) = fan-out: fetch 2/3/4-leg variants
      // in parallel, merge, then curate a mix. Users get variety by default
      // without clicking around. Specific leg selection skips the fan-out.
      const legCounts = selectedLegs ? [selectedLegs] : [2, 3, 4];
      const perCall = Math.max(
        2,
        Math.ceil(countForTier / legCounts.length),
      );

      const buildUrl = (legs: number) => {
        const p = new URLSearchParams({
          count: String(perCall),
          tier: effectiveTier,
          legs: String(legs),
          sort: sortBy,
        });
        if (selectedSport !== "All") p.set("sports", selectedSport);
        return `/api/parlays?${p.toString()}`;
      };

      const responses = await Promise.all(
        legCounts.map((n) =>
          fetch(buildUrl(n))
            .then((r) => (r.ok ? (r.json() as Promise<ParlayResponse>) : null))
            .catch(() => null),
        ),
      );

      const merged: Parlay[] = [];
      let lastMeta: Meta | null = null;
      for (const r of responses) {
        if (!r) continue;
        merged.push(...r.parlays);
        lastMeta = r.meta;
      }

      // Re-sort merged picks by whatever mode is active so the Lock stays #1.
      if (sortBy === "confidence") merged.sort((a, b) => b.confidence - a.confidence);
      else if (sortBy === "payout") merged.sort((a, b) => b.payout - a.payout);
      else merged.sort((a, b) => b.evPercent - a.evPercent);

      setParlays(merged.slice(0, countForTier));
      setMeta(lastMeta);
    } catch {
      setError("Unable to load parlays right now.");
      setParlays([]);
    } finally {
      setLoading(false);
    }
  }, [selectedSport, selectedLegs, sortBy, tier, isPro, isAdmin]);

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
      <AppNav />
      <div className="pt-20">
        <PicksTabs />
      </div>

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
      <section className="px-4 md:px-6 pb-6 sticky top-16 z-40" style={{ background: "rgba(10,10,10,0.92)", backdropFilter: "blur(12px)" }}>
        <div className="max-w-[1400px] mx-auto py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
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
              <button
                onClick={() => setSelectedLegs(null)}
                className="px-4 h-10 rounded-lg text-sm font-semibold transition-all duration-200 flex items-center justify-center"
                style={{
                  background: selectedLegs === null ? "rgba(255,59,59,0.15)" : "rgba(255,255,255,0.04)",
                  color: selectedLegs === null ? "#FF3B3B" : "rgba(255,255,255,0.45)",
                  border: selectedLegs === null ? "1px solid rgba(255,59,59,0.3)" : "1px solid rgba(255,255,255,0.06)",
                }}
              >
                Mix
              </button>
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

          {/* Odds range — client-side payout bucket filter */}
          <div className="flex overflow-x-auto scrollbar-hide flex-nowrap items-center gap-3 mt-4">
            <span className="text-xs font-medium uppercase tracking-wider mr-1 flex-shrink-0" style={{ color: "rgba(255,255,255,0.3)" }}>
              Odds
            </span>
            {ODDS_RANGES.map((r) => (
              <button
                key={r.value}
                onClick={() => setOddsRange(r.value)}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex-shrink-0"
                style={{
                  background: oddsRange === r.value ? "rgba(255,59,59,0.15)" : "rgba(255,255,255,0.04)",
                  color: oddsRange === r.value ? "#FF3B3B" : "rgba(255,255,255,0.45)",
                  border: oddsRange === r.value ? "1px solid rgba(255,59,59,0.3)" : "1px solid rgba(255,255,255,0.06)",
                }}
              >
                {r.label}
              </button>
            ))}
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
            {!loading && (error || visibleParlays.length === 0) && (
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
            {!loading && !error && visibleParlays.length > 0 && (
              <motion.div
                key="content"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-6"
              >
                {/* Honest market-state banner — when NO parlay has AI >
                    book, tell users the lines are tight instead of
                    pretending something is a Lock. */}
                {(() => {
                  const anyPositiveEdge = visibleParlays.some(
                    (p) =>
                      typeof p.aiEstimate === "number" &&
                      typeof p.impliedHitRate === "number" &&
                      p.aiEstimate > p.impliedHitRate,
                  );
                  if (anyPositiveEdge) return null;
                  return (
                    <div
                      className="rounded-xl px-5 py-4 flex items-start gap-3"
                      style={{
                        background: "rgba(234,179,8,0.06)",
                        border: "1px solid rgba(234,179,8,0.2)",
                      }}
                    >
                      <span
                        className="flex-shrink-0 mt-1.5 w-1.5 h-1.5 rounded-full"
                        style={{ background: "#eab308" }}
                      />
                      <div>
                        <p className="text-sm font-semibold" style={{ color: "#eab308" }}>
                          No clear edge found today
                        </p>
                        <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.55)", lineHeight: 1.5 }}>
                          Every parlay below is priced at or above the AI&apos;s own estimate — meaning the book is charging a reasonable-to-steep price for each one. Nothing qualifies as a Lock. If you&apos;re here to fire, pick carefully. If you&apos;re here to grow bankroll, it might be a day to skip.
                        </p>
                      </div>
                    </div>
                  );
                })()}

                {/* VIP/Admin: see everything */}
                {isVipAccess ? (
                  visibleParlays.map((parlay, idx) => (
                    <ParlayCard
                      key={parlay.id}
                      parlay={parlay}
                      index={idx}
                      copiedId={copiedId}
                      onCopy={handleCopy}
                      pendingSimSigs={pendingSimSigs}
                      isLockOfDay={
                        idx === 0 &&
                        sortBy === "confidence" &&
                        typeof parlay.aiEstimate === "number" &&
                        typeof parlay.impliedHitRate === "number" &&
                        parlay.aiEstimate > parlay.impliedHitRate
                      }
                    />
                  ))
                ) : isSharpAccess ? (
                  <>
                    {/* Sharp: all 8 picks visible. Upsell to VIP is at the
                        bottom — promises the analytics tools (bankroll mgmt,
                        line movement, alerts, CLV) that justify the jump,
                        not just "more picks." */}
                    {visibleParlays.map((parlay, idx) => (
                      <ParlayCard
                        key={parlay.id}
                        parlay={parlay}
                        index={idx}
                        copiedId={copiedId}
                        onCopy={handleCopy}
                        pendingSimSigs={pendingSimSigs}
                        isLockOfDay={
                        idx === 0 &&
                        sortBy === "confidence" &&
                        typeof parlay.aiEstimate === "number" &&
                        typeof parlay.impliedHitRate === "number" &&
                        parlay.aiEstimate > parlay.impliedHitRate
                      }
                      />
                    ))}

                    {visibleParlays.length > 0 && (
                      <div
                        className="mt-12 rounded-2xl px-6 py-10 md:px-12 md:py-14"
                        style={{
                          background: "linear-gradient(135deg, rgba(255,59,59,0.06) 0%, rgba(255,59,59,0.02) 100%)",
                          border: "1px solid rgba(255,59,59,0.15)",
                        }}
                      >
                        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                          <div>
                            <p className="text-xl md:text-2xl font-semibold" style={{ color: "#ededed" }}>
                              Ready to run this like a business?
                            </p>
                            <p className="mt-2 text-sm md:text-base" style={{ color: "rgba(255,255,255,0.5)" }}>
                              VIP unlocks 15+ picks/day, bankroll manager (Kelly criterion), line-movement tracking, closing-line value dashboard, and real-time alerts when the AI finds high-EV plays.
                            </p>
                            <div className="mt-4 flex flex-wrap gap-3 text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>
                              <span>· Bankroll calculator</span>
                              <span>· Line movement</span>
                              <span>· CLV tracker</span>
                              <span>· High-EV alerts</span>
                              <span>· $10K sim bankroll</span>
                              <span>· Priority slate (1hr early)</span>
                            </div>
                          </div>
                          <Link
                            href="/subscribe"
                            className="flex-shrink-0 px-8 py-4 rounded-full text-base font-bold transition-all duration-200"
                            style={{ background: "#FF3B3B", color: "#0a0a0a" }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = "#FF5252"; e.currentTarget.style.transform = "translateY(-1px)"; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = "#FF3B3B"; e.currentTarget.style.transform = "translateY(0)"; }}
                          >
                            Upgrade to VIP
                          </Link>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    {/* Free: all 4 picks visible. Real Lock of the Day + a few
                        sides so users can see the AI working. Upgrade CTA
                        below promises Sharp depth, not a content gate. */}
                    {visibleParlays.map((parlay, idx) => (
                      <ParlayCard
                        key={parlay.id}
                        parlay={parlay}
                        index={idx}
                        copiedId={copiedId}
                        onCopy={handleCopy}
                        pendingSimSigs={pendingSimSigs}
                        isLockOfDay={
                        idx === 0 &&
                        sortBy === "confidence" &&
                        typeof parlay.aiEstimate === "number" &&
                        typeof parlay.impliedHitRate === "number" &&
                        parlay.aiEstimate > parlay.impliedHitRate
                      }
                      />
                    ))}

                    {visibleParlays.length > 0 && (
                      <div
                        className="mt-12 rounded-2xl px-6 py-10 md:px-12 md:py-14"
                        style={{
                          background: "linear-gradient(135deg, rgba(255,59,59,0.08) 0%, rgba(255,59,59,0.03) 100%)",
                          border: "1px solid rgba(255,59,59,0.15)",
                        }}
                      >
                        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                          <div>
                            <p className="text-xl md:text-2xl font-semibold" style={{ color: "#ededed" }}>
                              Want 2× more picks + the full toolkit?
                            </p>
                            <p className="mt-2 text-sm md:text-base" style={{ color: "rgba(255,255,255,0.5)" }}>
                              Sharp unlocks 8 picks/day across all strategies, the Simulator (paper trade with $1K bankroll), personal stats tracking, and the Props analyzer.
                            </p>
                            <div className="mt-4 flex flex-wrap gap-3 text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>
                              <span>· Simulator</span>
                              <span>· My Stats</span>
                              <span>· Props analyzer</span>
                              <span>· Custom Builder</span>
                              <span>· All 3 sort modes</span>
                            </div>
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
                      </div>
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
  pendingSimSigs,
  isLockOfDay,
}: {
  parlay: Parlay;
  index: number;
  copiedId: string | null;
  onCopy: (p: Parlay) => void;
  pendingSimSigs?: Set<string>;
  isLockOfDay?: boolean;
}) {
  const { user, isPro } = useAuth();
  const [simPlacing, setSimPlacing] = useState(false);
  const [simResult, setSimResult] = useState<string | null>(null);

  // Check if this parlay is already in the user's pending sim bets
  const ownSig = parlay.legs
    .map((l) => `${l.game}::${l.pick}`)
    .sort()
    .join("|");
  const alreadyInSim = pendingSimSigs?.has(ownSig) || false;

  const [isDuplicate, setIsDuplicate] = useState(alreadyInSim);

  // Update if pendingSimSigs changes
  useEffect(() => {
    setIsDuplicate(alreadyInSim);
  }, [alreadyInSim]);

  async function tryInSim() {
    if (!user || isDuplicate) return;
    setSimPlacing(true);
    try {
      const res = await fetch("/api/sim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: user.id,
          legs: parlay.legs.map(l => ({
            sport: l.sport,
            pick: l.pick,
            game: l.game,
            odds: l.odds,
            book: l.book,
            commenceTime: l.commenceTime,
          })),
          combined_odds: parlay.combinedOdds,
          combined_decimal: parlay.combinedDecimal,
          stake: 10,
          payout: Math.round(10 * parlay.combinedDecimal * 100) / 100,
          category: parlay.category,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        // Lock the button immediately after a successful placement so a
        // second click can't fire the same bet while the success message
        // is still showing. Clears on page reload (pendingSimSigs refetch).
        setIsDuplicate(true);
        setSimResult("Placed $10 sim bet");
      } else if (res.status === 409) {
        setIsDuplicate(true);
        setSimResult("Already in Sim");
      } else {
        setSimResult(data.error || "Failed");
      }
    } catch {
      setSimResult("Error");
    }
    setSimPlacing(false);
    // Clear transient result messages, but only when the button isn't
    // locked as a duplicate. Locked state persists until refresh.
    if (!isDuplicate) {
      setTimeout(() => setSimResult(null), 3000);
    }
  }

  const conf = confidenceLabel(parlay.confidence);
  const evPositive = parlay.ev > 0;
  const formattedOdds =
    parlay.combinedOdds.startsWith("+") || parlay.combinedOdds.startsWith("-")
      ? parlay.combinedOdds
      : `+${parlay.combinedOdds}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.08, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="rounded-2xl overflow-hidden"
      style={{
        background: "#111",
        border: isLockOfDay ? "1px solid rgba(255,59,59,0.35)" : "1px solid rgba(255,255,255,0.08)",
        boxShadow: isLockOfDay ? "0 0 40px rgba(255,59,59,0.08)" : "none",
      }}
    >
      {isLockOfDay && (
        <div
          className="px-5 md:px-6 py-2.5 flex items-center gap-2"
          style={{
            background: "linear-gradient(90deg, rgba(255,59,59,0.12) 0%, rgba(255,59,59,0.02) 100%)",
            borderBottom: "1px solid rgba(255,59,59,0.2)",
          }}
        >
          <span
            className="text-[10px] font-bold uppercase tracking-[0.2em]"
            style={{ color: "#FF3B3B" }}
          >
            ★ Lock of the Day
          </span>
          <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.4)" }}>
            · AI&apos;s highest-confidence pick
          </span>
        </div>
      )}
      {/* Header: number + confidence + time */}
      <div
        className="px-5 md:px-6 py-4 flex items-center justify-between"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}
      >
        <div className="flex items-center gap-3">
          <span
            className="text-lg font-black tabular-nums"
            style={{ color: "rgba(255,255,255,0.15)" }}
          >
            #{String(index + 1).padStart(2, "0")}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span
            className="text-xs font-semibold uppercase tracking-wider"
            style={{ color: conf.color }}
          >
            {conf.text}
          </span>
          <span
            className="text-xs tabular-nums"
            style={{ color: "rgba(255,255,255,0.3)" }}
          >
            {timeAgo(parlay.timestamp)}
          </span>
        </div>
      </div>

      {/* Legs — one clean row each, with expandable "Why" reasoning */}
      <div className="px-5 md:px-6 py-3">
        {parlay.legs.map((leg, i) => (
          <LegRow key={i} leg={leg} showDivider={i > 0} />
        ))}
      </div>

      {/* Bottom section — 3 columns + copy button */}
      <div
        className="px-5 md:px-6 pt-5 pb-5"
        style={{ borderTop: "2px solid rgba(255,255,255,0.06)" }}
      >
        <div className="grid grid-cols-3 gap-4 mb-5">
          {/* Combined Odds */}
          <div>
            <div
              className="text-[11px] uppercase tracking-wider mb-1"
              style={{ color: "rgba(255,255,255,0.3)" }}
            >
              Combined
            </div>
            <div
              className="text-2xl sm:text-3xl font-black tracking-tight tabular-nums"
              style={{ color: "#FF3B3B", fontFamily: "ui-monospace, SFMono-Regular, monospace" }}
            >
              {formattedOdds}
            </div>
          </div>

          {/* Payout */}
          <div>
            <div
              className="text-[11px] uppercase tracking-wider mb-1"
              style={{ color: "rgba(255,255,255,0.3)" }}
            >
              $100 pays
            </div>
            <div className="text-2xl sm:text-3xl font-bold text-white tabular-nums">
              ${parlay.payout.toLocaleString()}
            </div>
          </div>

          {/* Expected Value */}
          <div>
            <div
              className="text-[11px] uppercase tracking-wider mb-1"
              style={{ color: "rgba(255,255,255,0.3)" }}
            >
              Expected Value
            </div>
            <div
              className="text-2xl sm:text-3xl font-bold tabular-nums"
              style={{ color: evPositive ? "#34D399" : "#FF4D4D" }}
            >
              {evPositive ? "+" : ""}{parlay.evPercent.toFixed(1)}%
            </div>
          </div>
        </div>

        {/* Hit Rate row — book vs AI */}
        {(parlay.impliedHitRate !== undefined || parlay.aiEstimate !== undefined) && (
          <div
            className="flex items-center justify-between gap-3 mb-5 px-3 py-2.5 rounded-lg"
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.05)",
            }}
          >
            <div className="flex items-center gap-5 flex-wrap">
              {parlay.impliedHitRate !== undefined && (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.35)" }}>
                    Book says
                  </span>
                  <span className="text-sm font-bold tabular-nums" style={{ color: "rgba(255,255,255,0.85)", fontFamily: "ui-monospace, monospace" }}>
                    {parlay.impliedHitRate.toFixed(1)}%
                  </span>
                </div>
              )}
              {parlay.aiEstimate !== undefined && (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.35)" }}>
                    AI says
                  </span>
                  <span
                    className="text-sm font-bold tabular-nums"
                    style={{
                      color: parlay.impliedHitRate !== undefined && parlay.aiEstimate > parlay.impliedHitRate ? "#34D399" : "rgba(255,255,255,0.85)",
                      fontFamily: "ui-monospace, monospace",
                    }}
                  >
                    {parlay.aiEstimate.toFixed(1)}%
                  </span>
                </div>
              )}
            </div>
            <span className="text-[10px] hidden sm:block" style={{ color: "rgba(255,255,255,0.3)" }}>
              Hit probability
            </span>
          </div>
        )}

        {/* Copy button */}
        <button
          onClick={() => onCopy(parlay)}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all duration-200 cursor-pointer"
          style={{
            background: copiedId === parlay.id ? "rgba(255,59,59,0.15)" : "rgba(255,255,255,0.05)",
            color: copiedId === parlay.id ? "#FF3B3B" : "rgba(255,255,255,0.5)",
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
              e.currentTarget.style.color = "rgba(255,255,255,0.5)";
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
              Copy Picks
            </>
          )}
        </button>

        {/* Try in Sim */}
        {user && isPro && (
          <button
            onClick={tryInSim}
            disabled={simPlacing || !!simResult || isDuplicate}
            className="w-full py-3 rounded-xl text-sm font-medium transition-all duration-200 mt-2"
            style={{
              background: isDuplicate
                ? "rgba(255,255,255,0.04)"
                : simResult
                ? "rgba(34,197,94,0.1)"
                : "rgba(255,59,59,0.08)",
              color: isDuplicate
                ? "rgba(255,255,255,0.3)"
                : simResult
                ? "#22C55E"
                : "#FF3B3B",
              border: isDuplicate
                ? "1px solid rgba(255,255,255,0.06)"
                : simResult
                ? "1px solid rgba(34,197,94,0.2)"
                : "1px solid rgba(255,59,59,0.15)",
              cursor: isDuplicate ? "not-allowed" : undefined,
            }}
          >
            {simPlacing ? "Placing..." : isDuplicate ? "Already in Sim" : simResult || "Try $10 in Simulator"}
          </button>
        )}

        {/* Recommended book */}
        {parlay.recommendedBook && (
          <div className="mt-4 pt-4" style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
            <p className="text-center text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>
              Place this parlay on{" "}
              <span className="font-semibold text-[#FF3B3B]">{parlay.recommendedBook}</span>
            </p>
          </div>
        )}
      </div>
    </motion.div>
  );
}

/* ─── Leg Row with expandable "Why" reasoning ─── */

function LegRow({ leg, showDivider }: { leg: Leg; showDivider: boolean }) {
  const [open, setOpen] = useState(false);
  const hasReasons = !!leg.reasons && leg.reasons.length > 0;
  const edgePts =
    typeof leg.trueEdge === "number" ? leg.trueEdge * 100 : null;
  // Only surface the edge badge when the AI is finding VALUE (positive edge).
  // Negative-edge picks get no badge here — the warning lives in the Why
  // panel instead, so we're not highlighting "bad bet" like it's a feature.
  const showEdgeBadge = edgePts !== null && edgePts >= 2;

  return (
    <div>
      {showDivider && (
        <div style={{ height: 1, background: "rgba(255,255,255,0.06)" }} />
      )}
      <button
        onClick={() => setOpen(!open)}
        disabled={!hasReasons}
        className="w-full flex items-center gap-3 py-3 text-left transition-colors"
        style={{
          cursor: hasReasons ? "pointer" : "default",
          opacity: 1,
        }}
      >
        <div
          className="flex items-center justify-center w-11 sm:w-12 h-6 rounded text-[11px] sm:text-xs font-bold uppercase tracking-wide flex-shrink-0"
          style={{
            background: `${SPORT_COLORS[leg.sport] || "#333"}25`,
            color: SPORT_COLORS[leg.sport] || "#888",
          }}
        >
          {leg.sport}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[15px] sm:text-base font-semibold text-white truncate">
              {leg.pick}
            </span>
            {showEdgeBadge && (
              <span
                className="text-[10px] font-bold tabular-nums flex-shrink-0"
                style={{
                  color: "#22c55e",
                  fontFamily: "ui-monospace, monospace",
                }}
              >
                +{edgePts!.toFixed(1)} edge
              </span>
            )}
          </div>
          <span
            className="text-xs truncate block mt-0.5"
            style={{ color: "rgba(255,255,255,0.35)" }}
          >
            {leg.game}
          </span>
        </div>

        <div className="text-right flex-shrink-0">
          <div
            className="text-[15px] sm:text-base font-bold tabular-nums"
            style={{
              color: "#FF3B3B",
              fontFamily: "ui-monospace, SFMono-Regular, monospace",
            }}
          >
            {formatOdds(leg.odds)}
          </div>
          <div
            className="text-[11px] mt-0.5"
            style={{ color: "rgba(255,255,255,0.3)" }}
          >
            {leg.book}
          </div>
        </div>

        {hasReasons && (
          <div
            className="flex-shrink-0 transition-transform"
            style={{
              color: "rgba(255,255,255,0.35)",
              transform: open ? "rotate(180deg)" : "rotate(0deg)",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>
        )}
      </button>

      <AnimatePresence initial={false}>
        {open && hasReasons && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            style={{ overflow: "hidden" }}
          >
            <div
              className="mb-3 ml-[60px] rounded-lg p-3 space-y-2"
              style={{
                background: "rgba(255,255,255,0.025)",
                border: "1px solid rgba(255,255,255,0.05)",
              }}
            >
              <div
                className="text-[10px] uppercase tracking-[0.2em] font-semibold mb-2"
                style={{ color: "rgba(255,59,59,0.8)" }}
              >
                Why this pick
              </div>
              {leg.reasons!.map((r, j) => (
                <div
                  key={j}
                  className="flex items-start gap-2 text-xs"
                  style={{ color: "rgba(255,255,255,0.7)", lineHeight: 1.5 }}
                >
                  <span
                    className="flex-shrink-0 mt-1.5 w-1 h-1 rounded-full"
                    style={{ background: "rgba(255,59,59,0.6)" }}
                  />
                  <span>{r}</span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
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
