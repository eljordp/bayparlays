"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Menu, X, ChevronRight, ArrowRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Logo } from "@/app/components/Logo";

/* ─── Types ─── */

interface ParlayLeg {
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
  legs: ParlayLeg[];
  combinedOdds: string;
  combinedDecimal: number;
  ev: number;
  evPercent: number;
  confidence: number;
  payout: number;
  timestamp: string;
}

interface ParlayResponse {
  parlays: Parlay[];
  meta: {
    sportsScanned: string[];
    gamesAnalyzed: number;
    legsEvaluated: number;
    generatedAt: string;
  };
}

interface OddsGame {
  id: string;
  homeTeam: string;
  awayTeam: string;
  commenceTime: string;
  bestOdds: Record<
    string,
    { outcomeName: string; bestPrice: number; bestBook: string }[]
  >;
}

interface OddsResponse {
  games: OddsGame[];
}

/* ─── Animation ─── */

const fade = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.08, duration: 0.5, ease: [0.25, 0.1, 0.25, 1] as const },
  }),
};

/* ─── Helpers ─── */

function formatOdds(odds: number): string {
  return odds > 0 ? `+${odds}` : `${odds}`;
}

function formatDate(): string {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/* ─── PAGE ─── */

export default function Home() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [parlays, setParlays] = useState<Parlay[]>([]);
  const [meta, setMeta] = useState<ParlayResponse["meta"] | null>(null);
  const [odds, setOdds] = useState<OddsGame[]>([]);
  const [loading, setLoading] = useState(true);
  const oddsScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const [parlayRes, oddsRes] = await Promise.allSettled([
          fetch("/api/parlays?count=3&legs=3"),
          fetch("/api/odds?sport=nba"),
        ]);

        if (parlayRes.status === "fulfilled" && parlayRes.value.ok) {
          const data: ParlayResponse = await parlayRes.value.json();
          setParlays(data.parlays);
          setMeta(data.meta);
        }

        if (oddsRes.status === "fulfilled" && oddsRes.value.ok) {
          const data: OddsResponse = await oddsRes.value.json();
          setOdds(data.games?.slice(0, 8) || []);
        }
      } catch {
        // Silently fail — sections will show fallback states
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  const topParlay = parlays[0] || null;
  const moreParlays = parlays.slice(1, 3);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#ededed] overflow-x-hidden">
      {/* ── NAV ── */}
      <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-xl bg-[#0a0a0a]/80 border-b border-white/[0.06]">
        <div className="w-full max-w-[1400px] mx-auto flex items-center justify-between px-6 md:px-10 h-16">
          <Link href="/" className="flex items-center gap-2">
            <Logo />
          </Link>

          <div className="hidden md:flex items-center gap-8 text-sm text-white/50">
            <Link
              href="/parlays"
              className="hover:text-white transition-colors duration-200"
            >
              Parlays
            </Link>
            <Link
              href="/odds"
              className="hover:text-white transition-colors duration-200"
            >
              Odds
            </Link>
            <Link
              href="/builder"
              className="hover:text-white transition-colors duration-200"
            >
              Builder
            </Link>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/parlays"
              className="bg-[#FF3B3B] text-[#0a0a0a] px-5 py-2 text-xs sm:text-sm font-semibold rounded-full hover:bg-[#FF5252] transition-colors duration-200"
            >
              See All Parlays
            </Link>
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden text-white/60 hover:text-white transition-colors"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? (
                <X className="w-6 h-6" />
              ) : (
                <Menu className="w-6 h-6" />
              )}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden border-t border-white/[0.06] bg-[#0a0a0a]/95 backdrop-blur-xl">
            <div className="px-6 py-4 flex flex-col gap-4">
              <Link
                href="/parlays"
                onClick={() => setMobileMenuOpen(false)}
                className="text-sm text-white/50 hover:text-white transition-colors duration-200"
              >
                Parlays
              </Link>
              <Link
                href="/odds"
                onClick={() => setMobileMenuOpen(false)}
                className="text-sm text-white/50 hover:text-white transition-colors duration-200"
              >
                Odds
              </Link>
              <Link
                href="/builder"
                onClick={() => setMobileMenuOpen(false)}
                className="text-sm text-white/50 hover:text-white transition-colors duration-200"
              >
                Builder
              </Link>
            </div>
          </div>
        )}
      </nav>

      {/* ── HERO ── */}
      <section className="pt-28 pb-16 md:pt-36 md:pb-28">
        <div className="w-full max-w-[1400px] mx-auto px-6 md:px-10">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-start">
            {/* Left — headline */}
            <motion.div
              initial="hidden"
              animate="visible"
              className="pt-4 md:pt-10"
            >
              <motion.h1
                variants={fade}
                custom={0}
                className="text-6xl sm:text-7xl md:text-8xl tracking-tight leading-[0.9] mb-5"
                style={{ fontFamily: "'DM Serif Display', serif" }}
              >
                Today&apos;s
                <br />
                Edge
              </motion.h1>

              <motion.p
                variants={fade}
                custom={1}
                className="text-sm text-white/30 mb-8"
                style={{ fontFamily: "var(--font-geist-mono)" }}
              >
                {formatDate()}
              </motion.p>

              <motion.p
                variants={fade}
                custom={2}
                className="text-base text-white/40 mb-10"
                style={{ fontFamily: "var(--font-geist-mono)" }}
              >
                {meta
                  ? `${meta.gamesAnalyzed} games scanned across ${meta.sportsScanned.length} sports`
                  : "Scanning live odds across 12+ sportsbooks"}
              </motion.p>

              <motion.div variants={fade} custom={3}>
                <Link
                  href="/parlays"
                  className="inline-flex items-center gap-2 bg-[#FF3B3B] text-[#0a0a0a] px-7 py-3.5 text-sm font-semibold rounded-full hover:bg-[#FF5252] transition-colors duration-200"
                >
                  See All Parlays
                  <ChevronRight className="w-4 h-4" />
                </Link>
              </motion.div>
            </motion.div>

            {/* Right — top parlay card */}
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.6, ease: [0.25, 0.1, 0.25, 1] }}
            >
              {loading ? (
                <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-8 min-h-[360px] flex items-center justify-center">
                  <div className="text-sm text-white/20" style={{ fontFamily: "var(--font-geist-mono)" }}>
                    Loading live data...
                  </div>
                </div>
              ) : topParlay ? (
                <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-6 md:p-8">
                  {/* Card header */}
                  <div className="flex items-center justify-between mb-6">
                    <span className="text-xs font-medium uppercase tracking-widest text-white/30">
                      Top Pick
                    </span>
                    <span
                      className="text-xs text-white/20"
                      style={{ fontFamily: "var(--font-geist-mono)" }}
                    >
                      {topParlay.legs.length}-Leg Parlay
                    </span>
                  </div>

                  {/* Legs */}
                  <div className="space-y-3 mb-6">
                    {topParlay.legs.map((leg, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between py-3 border-b border-white/[0.04] last:border-0"
                      >
                        <div className="flex items-center gap-3">
                          <span
                            className="text-[10px] font-bold uppercase tracking-wider text-[#FF3B3B]/80 bg-[#FF3B3B]/[0.1] px-2 py-0.5 rounded"
                            style={{ fontFamily: "var(--font-geist-mono)" }}
                          >
                            {leg.sport}
                          </span>
                          <div>
                            <div className="text-sm text-white/80 font-medium">
                              {leg.pick}
                            </div>
                            <div className="text-[11px] text-white/25 mt-0.5">
                              {leg.game}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div
                            className="text-sm font-semibold text-white/90"
                            style={{ fontFamily: "var(--font-geist-mono)" }}
                          >
                            {formatOdds(leg.odds)}
                          </div>
                          <div className="text-[10px] text-white/20 mt-0.5 uppercase">
                            {leg.book}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Combined odds + EV */}
                  <div className="flex items-end justify-between pt-2">
                    <div>
                      <div className="text-[10px] uppercase tracking-widest text-white/25 mb-1">
                        Combined Odds
                      </div>
                      <div
                        className="text-3xl font-bold text-[#FF3B3B] tracking-tight"
                        style={{ fontFamily: "var(--font-geist-mono)" }}
                      >
                        {topParlay.combinedOdds}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] uppercase tracking-widest text-white/25 mb-2">
                        Expected Value
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="w-24 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                          <motion.div
                            className="h-full rounded-full bg-[#FF3B3B]"
                            initial={{ width: 0 }}
                            animate={{
                              width: `${Math.min(100, Math.max(10, topParlay.evPercent * 5))}%`,
                            }}
                            transition={{ delay: 0.8, duration: 0.8, ease: "easeOut" }}
                          />
                        </div>
                        <span
                          className="text-sm font-bold text-[#FF3B3B]"
                          style={{ fontFamily: "var(--font-geist-mono)" }}
                        >
                          {topParlay.evPercent > 0 ? "+" : ""}
                          {topParlay.evPercent.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Share link */}
                  <div className="mt-6 pt-4 border-t border-white/[0.04]">
                    <Link
                      href="/parlays"
                      className="text-xs text-white/30 hover:text-[#FF3B3B] transition-colors duration-200 flex items-center gap-1"
                    >
                      View full details
                      <ArrowRight className="w-3 h-3" />
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-8 min-h-[300px] flex items-center justify-center">
                  <div className="text-center">
                    <p className="text-sm text-white/30 mb-4">
                      No parlays available right now
                    </p>
                    <Link
                      href="/builder"
                      className="text-sm text-[#FF3B3B] hover:underline"
                    >
                      Build your own
                    </Link>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── LIVE ODDS STRIP ── */}
      {odds.length > 0 && (
        <section className="py-10 md:py-14 border-t border-white/[0.04]">
          <div className="w-full max-w-[1400px] mx-auto px-6 md:px-10">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-60px" }}
            >
              <motion.div
                variants={fade}
                custom={0}
                className="flex items-center justify-between mb-6"
              >
                <h2
                  className="text-xs font-medium uppercase tracking-[0.2em] text-white/30"
                  style={{ fontFamily: "var(--font-geist-mono)" }}
                >
                  Live Odds -- NBA
                </h2>
                <Link
                  href="/odds"
                  className="text-xs text-white/25 hover:text-[#FF3B3B] transition-colors flex items-center gap-1"
                >
                  View all odds
                  <ArrowRight className="w-3 h-3" />
                </Link>
              </motion.div>

              <motion.div
                variants={fade}
                custom={1}
                ref={oddsScrollRef}
                className="flex gap-4 overflow-x-auto scrollbar-hide pb-2 -mx-1 px-1"
              >
                {odds.map((game) => {
                  const h2hOdds = game.bestOdds?.h2h;
                  const homeLine = h2hOdds?.find(
                    (o) => o.outcomeName === game.homeTeam
                  );
                  const awayLine = h2hOdds?.find(
                    (o) => o.outcomeName === game.awayTeam
                  );
                  const bestLine = homeLine && awayLine
                    ? (homeLine.bestPrice > awayLine.bestPrice ? homeLine : awayLine)
                    : homeLine || awayLine;

                  return (
                    <div
                      key={game.id}
                      className="flex-shrink-0 w-[220px] py-4 px-5 bg-white/[0.02] rounded-xl hover:bg-white/[0.04] transition-colors duration-300"
                    >
                      <div className="text-[11px] text-white/30 mb-2 truncate">
                        {game.awayTeam} @ {game.homeTeam}
                      </div>
                      {bestLine && (
                        <div className="flex items-baseline justify-between">
                          <span
                            className="text-lg font-bold text-[#FF3B3B]"
                            style={{ fontFamily: "var(--font-geist-mono)" }}
                          >
                            {formatOdds(bestLine.bestPrice)}
                          </span>
                          <span className="text-[10px] text-white/20 uppercase">
                            {bestLine.bestBook}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </motion.div>
            </motion.div>
          </div>
        </section>
      )}

      {/* ── MORE PARLAYS ── */}
      {moreParlays.length > 0 && (
        <section className="py-16 md:py-24 border-t border-white/[0.04]">
          <div className="w-full max-w-[1400px] mx-auto px-6 md:px-10">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-60px" }}
            >
              <motion.h2
                variants={fade}
                custom={0}
                className="text-3xl md:text-4xl tracking-tight mb-12"
                style={{ fontFamily: "'DM Serif Display', serif" }}
              >
                More Picks
              </motion.h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {moreParlays.map((parlay, idx) => (
                  <motion.div
                    key={parlay.id}
                    variants={fade}
                    custom={idx + 1}
                    className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-6 hover:border-white/[0.1] transition-colors duration-300"
                  >
                    <div className="flex items-center justify-between mb-5">
                      <span
                        className="text-xs text-white/25"
                        style={{ fontFamily: "var(--font-geist-mono)" }}
                      >
                        Parlay #{idx + 2}
                      </span>
                      <span
                        className="text-xs text-white/20"
                        style={{ fontFamily: "var(--font-geist-mono)" }}
                      >
                        {parlay.legs.length} legs
                      </span>
                    </div>

                    {/* Legs — simple list */}
                    <div className="space-y-2.5 mb-5">
                      {parlay.legs.map((leg, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between text-sm"
                        >
                          <span className="text-white/50">{leg.pick}</span>
                          <span
                            className="text-white/40"
                            style={{ fontFamily: "var(--font-geist-mono)" }}
                          >
                            {formatOdds(leg.odds)}
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="h-px bg-white/[0.04] mb-4" />

                    {/* Combined + EV */}
                    <div className="flex items-end justify-between">
                      <div>
                        <div className="text-[10px] uppercase tracking-widest text-white/20 mb-1">
                          Combined
                        </div>
                        <div
                          className="text-xl font-bold text-white"
                          style={{ fontFamily: "var(--font-geist-mono)" }}
                        >
                          {parlay.combinedOdds}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] uppercase tracking-widest text-white/20 mb-1">
                          EV
                        </div>
                        <div
                          className="text-lg font-bold text-[#FF3B3B]"
                          style={{ fontFamily: "var(--font-geist-mono)" }}
                        >
                          {parlay.evPercent > 0 ? "+" : ""}
                          {parlay.evPercent.toFixed(1)}%
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>

              <motion.div variants={fade} custom={3} className="mt-10">
                <Link
                  href="/parlays"
                  className="text-sm text-[#FF3B3B]/70 hover:text-[#FF3B3B] transition-colors flex items-center gap-1"
                >
                  Unlock all parlays
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </motion.div>
            </motion.div>
          </div>
        </section>
      )}

      {/* ── PRICING CTA ── */}
      <section className="py-20 md:py-32 border-t border-white/[0.04]">
        <div className="w-full max-w-[1400px] mx-auto px-6 md:px-10">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-60px" }}
            className="max-w-xl"
          >
            <motion.h2
              variants={fade}
              custom={0}
              className="text-3xl md:text-5xl tracking-tight mb-6"
              style={{ fontFamily: "'DM Serif Display', serif" }}
            >
              Plans that
              <br />
              <span className="text-[#FF3B3B]">pay for themselves.</span>
            </motion.h2>

            <motion.div
              variants={fade}
              custom={1}
              className="space-y-4 mb-10"
            >
              <p className="text-base text-white/40 leading-relaxed">
                Unlimited AI parlays, full builder access, and every edge calculated.
                Start with a free 7-day trial on Sharp.
              </p>
              <div className="flex items-baseline gap-4">
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-bold text-white/40" style={{ fontFamily: "var(--font-geist-mono)" }}>$49</span>
                </div>
                <span className="text-white/15">/</span>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-bold text-white" style={{ fontFamily: "var(--font-geist-mono)" }}>$149</span>
                </div>
                <span className="text-sm text-white/20">/mo</span>
              </div>
              <p className="text-xs text-white/20">
                7-day free trial. Cancel anytime.
              </p>
            </motion.div>

            <motion.div variants={fade} custom={2}>
              <Link
                href="/subscribe"
                className="inline-flex items-center gap-2 bg-[#FF3B3B] text-[#0a0a0a] px-7 py-3.5 text-sm font-semibold rounded-full hover:bg-[#FF5252] transition-colors duration-200"
              >
                See Plans
                <ChevronRight className="w-4 h-4" />
              </Link>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="border-t border-white/[0.04] py-16 md:py-20">
        <div className="w-full max-w-[1400px] mx-auto px-6 md:px-10">
          <div className="flex flex-col md:flex-row items-start justify-between gap-10 mb-12">
            <div>
              <Logo size="sm" />
            </div>

            <div className="flex gap-10 text-sm text-white/30">
              <Link
                href="/parlays"
                className="hover:text-white/60 transition-colors"
              >
                Parlays
              </Link>
              <Link
                href="/odds"
                className="hover:text-white/60 transition-colors"
              >
                Odds
              </Link>
              <Link
                href="/builder"
                className="hover:text-white/60 transition-colors"
              >
                Builder
              </Link>
              <Link
                href="/subscribe"
                className="hover:text-white/60 transition-colors"
              >
                Pricing
              </Link>
            </div>
          </div>

          <div className="pt-8 border-t border-white/[0.04] flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-xs text-white/20">
              &copy; {new Date().getFullYear()} BayParlays. All rights reserved.
            </p>
            <p className="text-xs text-white/15 max-w-lg text-center md:text-right leading-relaxed">
              For entertainment purposes only. BayParlays does not accept or
              place bets. Please gamble responsibly. If you or someone you know
              has a gambling problem, call 1-800-GAMBLER.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
