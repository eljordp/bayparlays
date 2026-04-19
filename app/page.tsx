"use client";

import Link from "next/link";
import { motion, useInView } from "framer-motion";
import { Menu, X, ChevronRight, ArrowRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Logo } from "@/app/components/Logo";
import { ProcessAnimation } from "@/app/components/ProcessAnimation";
import { BettingSlip } from "@/app/components/BettingSlip";

/* ─── Types ─── */

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

/* ─── Animation Variants ─── */

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: i * 0.1,
      duration: 0.6,
      ease: [0.25, 0.1, 0.25, 1] as const,
    },
  }),
};

/* ─── Animated Counter ─── */

function AnimatedCounter({
  value,
  prefix = "",
  suffix = "",
}: {
  value: number;
  prefix?: string;
  suffix?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!isInView) return;

    let start = 0;
    const duration = 2000;
    const startTime = performance.now();

    function tick(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // easeOutQuart
      const eased = 1 - Math.pow(1 - progress, 4);
      start = Math.floor(eased * value);
      setCount(start);
      if (progress < 1) requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);
  }, [isInView, value]);

  return (
    <span ref={ref}>
      {prefix}
      {count.toLocaleString()}
      {suffix}
    </span>
  );
}

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
  const [odds, setOdds] = useState<OddsGame[]>([]);
  const oddsScrollRef = useRef<HTMLDivElement>(null);

  // Track referral clicks from ?ref= param
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref");
    if (ref) {
      localStorage.setItem("bp_ref", ref);
      fetch("/api/referral/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: ref, event: "click" }),
      }).catch(() => {});
      // Clean URL
      params.delete("ref");
      const clean = params.toString();
      window.history.replaceState({}, "", clean ? `?${clean}` : window.location.pathname);
    }
  }, []);

  useEffect(() => {
    async function fetchOdds() {
      try {
        const res = await fetch("/api/odds?sport=nba");
        if (res.ok) {
          const data: OddsResponse = await res.json();
          setOdds(data.games?.slice(0, 8) || []);
        }
      } catch {
        // Silently fail — section won't render
      }
    }

    fetchOdds();
  }, []);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#ededed] overflow-x-hidden">
      {/* ── NAV ── */}
      <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-xl bg-[#0a0a0a]/80 border-b border-white/[0.06]">
        <div className="w-full max-w-[1400px] mx-auto flex items-center justify-between px-6 md:px-10 h-20">
          <Link href="/" className="flex items-center gap-2 -mb-2">
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
              href="/subscribe"
              className="bg-[#FF3B3B] text-[#0a0a0a] px-5 py-2 text-xs sm:text-sm font-semibold rounded-full hover:bg-[#FF5252] transition-colors duration-200"
            >
              Start Free Trial
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
      <section className="pt-28 pb-20 md:pt-36 md:pb-32">
        <div className="w-full max-w-[1400px] mx-auto px-6 md:px-10">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">
            {/* Left — Copy */}
            <motion.div
              initial="hidden"
              animate="visible"
              className="pt-4 md:pt-0"
            >
              <motion.p
                variants={fadeUp}
                custom={0}
                className="text-sm text-white/30 mb-6"
                style={{ fontFamily: "var(--font-geist-mono)" }}
              >
                {formatDate()}
              </motion.p>

              <motion.h1
                variants={fadeUp}
                custom={1}
                className="text-5xl sm:text-6xl md:text-7xl tracking-tight leading-[0.95] mb-6"
                style={{ fontFamily: "'DM Serif Display', serif" }}
              >
                The AI finds
                <br />
                the edge.
                <br />
                <span className="text-[#FF3B3B]">You place the bet.</span>
              </motion.h1>

              <motion.p
                variants={fadeUp}
                custom={2}
                className="text-base md:text-lg text-white/40 mb-10 max-w-md leading-relaxed"
              >
                Scanning odds across 12+ sportsbooks in real time.
              </motion.p>

              <motion.div
                variants={fadeUp}
                custom={3}
                className="flex flex-wrap items-center gap-4"
              >
                <Link
                  href="/subscribe"
                  className="inline-flex items-center gap-2 bg-[#FF3B3B] text-[#0a0a0a] px-7 py-3.5 text-sm font-semibold rounded-full hover:bg-[#FF5252] transition-colors duration-200"
                >
                  Start Free Trial
                  <ChevronRight className="w-4 h-4" />
                </Link>
                <a
                  href="#how-it-pays"
                  className="inline-flex items-center gap-2 border border-white/20 text-white/60 px-7 py-3.5 text-sm font-medium rounded-full hover:border-white/40 hover:text-white transition-all duration-200"
                >
                  See How It Works
                </a>
              </motion.div>
            </motion.div>

            {/* Right — Process Animation */}
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{
                delay: 0.3,
                duration: 0.7,
                ease: [0.25, 0.1, 0.25, 1],
              }}
            >
              <ProcessAnimation />
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── SOCIAL PROOF STRIP ── */}
      <section className="py-10 md:py-14 bg-[#111111] border-y border-white/[0.06]">
        <div className="w-full max-w-[1400px] mx-auto px-6 md:px-10">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-4">
            {[
              { value: 47291, label: "Parlays Generated", prefix: "", suffix: "" },
              { value: 12, label: "Sportsbooks Scanned", prefix: "", suffix: "+" },
              { value: 8, label: "Sports Covered", prefix: "", suffix: "" },
              { value: 2400000, label: "In Tracked Wins", prefix: "$", suffix: "" },
            ].map((stat, i) => (
              <motion.div
                key={stat.label}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-60px" }}
                variants={fadeUp}
                custom={i}
                className="text-center"
              >
                <div
                  className="text-2xl md:text-3xl font-bold text-white mb-1"
                  style={{ fontFamily: "var(--font-geist-mono)" }}
                >
                  <AnimatedCounter
                    value={stat.value}
                    prefix={stat.prefix}
                    suffix={stat.suffix}
                  />
                </div>
                <div className="text-xs text-white/30 uppercase tracking-widest">
                  {stat.label}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURED WINNING SLIP ── */}
      <section className="py-24 md:py-36">
        <div className="w-full max-w-[1400px] mx-auto px-6 md:px-10">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
          >
            <motion.h2
              variants={fadeUp}
              custom={0}
              className="text-3xl md:text-5xl tracking-tight mb-4"
              style={{ fontFamily: "'DM Serif Display', serif" }}
            >
              Today&apos;s Winner
            </motion.h2>
            <motion.div
              variants={fadeUp}
              custom={1}
              className="w-16 h-0.5 bg-[#FF3B3B] mb-14"
            />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">
              {/* Slip */}
              <motion.div variants={fadeUp} custom={2}>
                <BettingSlip
                  legs={[
                    {
                      sport: "NBA",
                      pick: "Celtics ML",
                      odds: -145,
                      result: "win",
                      book: "FanDuel",
                    },
                    {
                      sport: "MLB",
                      pick: "Dodgers -1.5",
                      odds: 110,
                      result: "win",
                      book: "DraftKings",
                    },
                    {
                      sport: "NHL",
                      pick: "Over 5.5",
                      odds: 105,
                      result: "win",
                      book: "BetMGM",
                    },
                  ]}
                  stake={100}
                  payout={587}
                  status="won"
                  animated={true}
                />
              </motion.div>

              {/* Context */}
              <motion.div variants={fadeUp} custom={3}>
                <p
                  className="text-sm text-[#FF3B3B]/60 uppercase tracking-[0.2em] mb-4 font-medium"
                  style={{ fontFamily: "var(--font-geist-mono)" }}
                >
                  How It Happened
                </p>
                <p className="text-xl md:text-2xl text-white/80 leading-relaxed mb-6">
                  Our AI found this parlay at{" "}
                  <span
                    className="text-[#FF3B3B] font-semibold"
                    style={{ fontFamily: "var(--font-geist-mono)" }}
                  >
                    6:42 AM
                  </span>
                  .
                </p>
                <p className="text-base text-white/40 leading-relaxed mb-8">
                  Best odds pulled across FanDuel, DraftKings, and BetMGM.
                  Expected value:{" "}
                  <span
                    className="text-white/70 font-semibold"
                    style={{ fontFamily: "var(--font-geist-mono)" }}
                  >
                    +7.2%
                  </span>
                  . Every leg confirmed by 10:15 PM.
                </p>
                <Link
                  href="/parlays"
                  className="inline-flex items-center gap-2 text-sm text-[#FF3B3B]/70 hover:text-[#FF3B3B] transition-colors"
                >
                  See all winning picks
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── LIVE ODDS STRIP ── */}
      {odds.length > 0 && (
        <section className="py-14 md:py-20 border-y border-white/[0.04] bg-[#0d0d0d]">
          <div className="w-full max-w-[1400px] mx-auto px-6 md:px-10">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-60px" }}
            >
              <motion.div
                variants={fadeUp}
                custom={0}
                className="flex items-center justify-between mb-8"
              >
                <div className="flex items-center gap-3">
                  <span className="w-2 h-2 bg-[#FF3B3B] rounded-full glow-pulse" />
                  <h2
                    className="text-xs font-medium uppercase tracking-[0.2em] text-white/30"
                    style={{ fontFamily: "var(--font-geist-mono)" }}
                  >
                    Live Odds &mdash; NBA
                  </h2>
                </div>
                <Link
                  href="/odds"
                  className="text-xs text-white/25 hover:text-[#FF3B3B] transition-colors flex items-center gap-1"
                >
                  View all odds
                  <ArrowRight className="w-3 h-3" />
                </Link>
              </motion.div>

              <motion.div
                variants={fadeUp}
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
                  const bestLine =
                    homeLine && awayLine
                      ? homeLine.bestPrice > awayLine.bestPrice
                        ? homeLine
                        : awayLine
                      : homeLine || awayLine;

                  return (
                    <div
                      key={game.id}
                      className="flex-shrink-0 w-[220px] py-4 px-5 bg-white/[0.02] border border-white/[0.04] rounded-xl hover:bg-white/[0.05] hover:border-white/[0.08] transition-all duration-300"
                    >
                      <div className="text-[11px] text-white/30 mb-3 truncate">
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

      {/* ── HOW IT PAYS ── */}
      <section id="how-it-pays" className="py-24 md:py-36">
        <div className="w-full max-w-[1400px] mx-auto px-6 md:px-10">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
          >
            <motion.h2
              variants={fadeUp}
              custom={0}
              className="text-3xl md:text-5xl tracking-tight mb-4 text-center"
              style={{ fontFamily: "'DM Serif Display', serif" }}
            >
              How It Pays
            </motion.h2>
            <motion.p
              variants={fadeUp}
              custom={1}
              className="text-base text-white/30 text-center mb-16 max-w-lg mx-auto"
            >
              Same sport. Same day. Different approach. Different result.
            </motion.p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 lg:gap-20">
              {/* Without */}
              <motion.div variants={fadeUp} custom={2}>
                <p
                  className="text-xs uppercase tracking-[0.2em] text-white/25 mb-5 text-center"
                  style={{ fontFamily: "var(--font-geist-mono)" }}
                >
                  Without BayParlays
                </p>
                <div className="opacity-60">
                  <BettingSlip
                    legs={[
                      {
                        sport: "NBA",
                        pick: "Lakers ML",
                        odds: 220,
                        result: "loss",
                        book: "FanDuel",
                      },
                      {
                        sport: "NFL",
                        pick: "Cowboys -3.5",
                        odds: -110,
                        result: "loss",
                        book: "FanDuel",
                      },
                      {
                        sport: "MLB",
                        pick: "Yankees ML",
                        odds: -150,
                        result: "win",
                        book: "FanDuel",
                      },
                    ]}
                    stake={100}
                    payout={0}
                    status="lost"
                    animated={false}
                  />
                </div>
              </motion.div>

              {/* With */}
              <motion.div variants={fadeUp} custom={3}>
                <p
                  className="text-xs uppercase tracking-[0.2em] text-[#FF3B3B]/50 mb-5 text-center font-medium"
                  style={{ fontFamily: "var(--font-geist-mono)" }}
                >
                  With BayParlays
                </p>
                <BettingSlip
                  legs={[
                    {
                      sport: "NBA",
                      pick: "Celtics -4.5",
                      odds: -110,
                      result: "win",
                      book: "DraftKings",
                    },
                    {
                      sport: "NFL",
                      pick: "49ers ML",
                      odds: 135,
                      result: "win",
                      book: "BetMGM",
                    },
                    {
                      sport: "MLB",
                      pick: "Braves -1.5",
                      odds: 120,
                      result: "win",
                      book: "FanDuel",
                    },
                  ]}
                  stake={100}
                  payout={743}
                  status="won"
                  animated={true}
                />
              </motion.div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── PRICING CTA ── */}
      <section className="py-24 md:py-36 bg-[#111111] border-y border-white/[0.06]">
        <div className="w-full max-w-[1400px] mx-auto px-6 md:px-10 text-center">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-60px" }}
          >
            <motion.h2
              variants={fadeUp}
              custom={0}
              className="text-4xl md:text-6xl tracking-tight mb-6"
              style={{ fontFamily: "'DM Serif Display', serif" }}
            >
              <span
                className="text-7xl md:text-8xl text-[#FF3B3B] block mb-2"
                style={{ fontFamily: "var(--font-geist-mono)" }}
              >
                $50
              </span>
              per month.
            </motion.h2>

            <motion.p
              variants={fadeUp}
              custom={1}
              className="text-base md:text-lg text-white/40 mb-10"
            >
              7-day free trial. Cancel anytime. One winning parlay pays for a year.
            </motion.p>

            <motion.div variants={fadeUp} custom={2}>
              <Link
                href="/subscribe"
                className="inline-flex items-center gap-2 bg-[#FF3B3B] text-[#0a0a0a] px-10 py-4 text-base font-semibold rounded-full hover:bg-[#FF5252] transition-colors duration-200"
              >
                Start Free Trial
                <ChevronRight className="w-5 h-5" />
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
