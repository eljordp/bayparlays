"use client";

import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X, ChevronDown } from "lucide-react";
import { NavUser } from "@/app/components/NavUser";
import { useEffect, useState } from "react";
import { Logo } from "@/app/components/Logo";

/* ─── Types ─── */

interface Leg {
  sport: string;
  pick: string;
  game: string;
  odds: number;
  book?: string;
}

interface CrazyParlay {
  id: string;
  created_at: string;
  legs: Leg[];
  combined_odds: string;
  combined_decimal: number;
  payout: number;
  status: "won" | "lost" | "pending";
  confidence?: number;
  ev_percent?: number;
}

/* ─── Animation Variants ─── */

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: i * 0.08,
      duration: 0.5,
      ease: [0.25, 0.1, 0.25, 1] as const,
    },
  }),
};

const expandVariants = {
  collapsed: { height: 0, opacity: 0 },
  expanded: { height: "auto", opacity: 1, transition: { duration: 0.3, ease: [0.25, 0.1, 0.25, 1] as const } },
};

/* ─── PAGE ─── */

export default function CrazyPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [crazy, setCrazy] = useState<CrazyParlay | null>(null);
  const [history, setHistory] = useState<CrazyParlay[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    async function fetchCrazy() {
      try {
        const res = await fetch("/api/crazy");
        if (res.ok) {
          const data = await res.json();
          if (data.crazy) setCrazy(data.crazy);
          if (data.history) setHistory(data.history);
        }
      } catch {
        /* silent */
      } finally {
        setLoading(false);
      }
    }
    fetchCrazy();
  }, []);

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  }

  function statusBadge(status: string) {
    if (status === "won") {
      return (
        <span className="inline-flex items-center gap-1.5 bg-green-500/15 text-green-400 font-bold px-3 py-1 rounded-full text-xs uppercase tracking-wider">
          Won
        </span>
      );
    }
    if (status === "lost") {
      return (
        <span className="inline-flex items-center gap-1.5 bg-white/[0.04] text-white/30 font-medium px-3 py-1 rounded-full text-xs uppercase tracking-wider">
          Lost
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 bg-[#FF3B3B]/10 text-[#FF3B3B] font-bold px-3 py-1 rounded-full text-xs uppercase tracking-wider animate-pulse">
        Pending
      </span>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#ededed] overflow-x-hidden">
      {/* ── NAV ── */}
      <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-xl bg-[#0a0a0a]/80 border-b border-white/[0.06]">
        <div className="w-full max-w-[1400px] mx-auto flex items-center justify-between px-6 md:px-10 h-20">
          <Link href="/" className="flex items-center gap-2 -mb-2">
            <Logo />
          </Link>

          <div className="hidden md:flex items-center gap-8 text-sm text-white/50">
            <Link href="/parlays" className="hover:text-white transition-colors duration-200">Parlays</Link>
            <Link href="/props" className="hover:text-white transition-colors duration-200">Props</Link>
            <Link href="/odds" className="hover:text-white transition-colors duration-200">Odds</Link>
            <Link href="/builder" className="hover:text-white transition-colors duration-200">Builder</Link>
            <Link href="/results" className="hover:text-white transition-colors duration-200">Results</Link>
            <Link href="/simulator" className="hover:text-white transition-colors duration-200">Simulator</Link>
            <Link href="/my-stats" className="hover:text-white transition-colors duration-200">My Stats</Link>
          </div>

          <div className="flex items-center gap-3">
            <NavUser />
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden text-white/60 hover:text-white transition-colors"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden border-t border-white/[0.06] bg-[#0a0a0a]/95 backdrop-blur-xl">
            <div className="px-6 py-4 flex flex-col gap-4">
              <Link href="/parlays" onClick={() => setMobileMenuOpen(false)} className="text-sm text-white/50 hover:text-white transition-colors duration-200">Parlays</Link>
              <Link href="/props" onClick={() => setMobileMenuOpen(false)} className="text-sm text-white/50 hover:text-white transition-colors duration-200">Props</Link>
              <Link href="/odds" onClick={() => setMobileMenuOpen(false)} className="text-sm text-white/50 hover:text-white transition-colors duration-200">Odds</Link>
              <Link href="/builder" onClick={() => setMobileMenuOpen(false)} className="text-sm text-white/50 hover:text-white transition-colors duration-200">Builder</Link>
              <Link href="/results" onClick={() => setMobileMenuOpen(false)} className="text-sm text-white/50 hover:text-white transition-colors duration-200">Results</Link>
              <Link href="/simulator" onClick={() => setMobileMenuOpen(false)} className="text-sm text-white/50 hover:text-white transition-colors duration-200">Simulator</Link>
              <Link href="/my-stats" onClick={() => setMobileMenuOpen(false)} className="text-sm text-white/50 hover:text-white transition-colors duration-200">My Stats</Link>
            </div>
          </div>
        )}
      </nav>

      {/* ── HEADER ── */}
      <section className="pt-32 pb-16 md:pt-40 md:pb-20">
        <div className="w-full max-w-[1400px] mx-auto px-6 md:px-10">
          <motion.div initial="hidden" animate="visible">
            <motion.div variants={fadeUp} custom={0} className="flex items-center gap-3 mb-6">
              <div className="flex items-center gap-2 bg-[#FF3B3B]/20 border border-[#FF3B3B]/30 rounded-full px-4 py-2">
                <span className="text-lg">🎰</span>
                <span className="text-xs font-black uppercase tracking-wider text-[#FF3B3B]">
                  Hall of Fame
                </span>
              </div>
            </motion.div>

            <motion.h1
              variants={fadeUp}
              custom={1}
              className="text-4xl sm:text-5xl md:text-7xl tracking-tight leading-[0.95] mb-6"
              style={{ fontFamily: "'DM Serif Display', serif" }}
            >
              Craziest Parlays
            </motion.h1>

            <motion.p
              variants={fadeUp}
              custom={2}
              className="text-base md:text-lg text-white/40 max-w-xl leading-relaxed"
            >
              The biggest long shots our AI has ever built. Some hit. Most don&apos;t. All are real.
            </motion.p>
          </motion.div>
        </div>
      </section>

      {/* ── TODAY'S CRAZY ── */}
      {loading ? (
        <section className="pb-16 md:pb-24">
          <div className="w-full max-w-[1400px] mx-auto px-6 md:px-10">
            <div className="bg-[#0d0d0d] border border-[#FF3B3B]/10 rounded-2xl p-6 md:p-10 animate-pulse">
              <div className="text-center mb-8">
                <div className="h-3 w-32 bg-white/[0.06] rounded mx-auto mb-4" />
                <div className="h-16 w-48 bg-white/[0.06] rounded mx-auto mb-3" />
                <div className="h-6 w-36 bg-white/[0.06] rounded mx-auto" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {[1, 2, 3].map((n) => (
                  <div key={n} className="bg-white/[0.03] rounded-xl p-4 h-28" />
                ))}
              </div>
            </div>
          </div>
        </section>
      ) : crazy ? (
        <section className="pb-16 md:pb-24">
          <div className="w-full max-w-[1400px] mx-auto px-6 md:px-10">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: [0.25, 0.1, 0.25, 1] }}
              className="bg-[#0d0d0d] border border-[#FF3B3B]/10 rounded-2xl p-6 md:p-10"
            >
              {/* Big odds display */}
              <div className="text-center mb-8">
                <div className="text-xs text-white/30 uppercase tracking-widest mb-3">
                  Today&apos;s Long Shot
                </div>
                <div
                  className="text-6xl md:text-8xl font-black text-[#FF3B3B]"
                  style={{ fontFamily: "var(--font-geist-mono)" }}
                >
                  {crazy.combined_odds}
                </div>
                <div
                  className="text-xl md:text-2xl text-white/60 mt-2"
                  style={{ fontFamily: "var(--font-geist-mono)" }}
                >
                  $100 &rarr; ${crazy.payout?.toLocaleString()}
                </div>
              </div>

              {/* Legs */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {crazy.legs?.map((leg, i) => (
                  <div key={i} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider bg-[#FF3B3B]/15 text-[#FF3B3B] px-2 py-0.5 rounded">
                        {leg.sport}
                      </span>
                    </div>
                    <div className="text-sm font-medium text-white/80">{leg.pick}</div>
                    <div className="text-xs text-white/30 mt-1">{leg.game}</div>
                    <div
                      className="text-lg font-bold text-white mt-2"
                      style={{ fontFamily: "var(--font-geist-mono)" }}
                    >
                      {leg.odds > 0 ? `+${leg.odds}` : leg.odds}
                    </div>
                  </div>
                ))}
              </div>

              {/* Status */}
              <div className="text-center mt-8">
                {crazy.status === "won" ? (
                  <span className="inline-flex items-center gap-2 bg-green-500/15 text-green-400 font-bold px-6 py-2 rounded-full text-sm">
                    THIS HIT
                  </span>
                ) : crazy.status === "lost" ? (
                  <span className="inline-flex items-center gap-2 bg-white/[0.04] text-white/30 font-medium px-6 py-2 rounded-full text-sm">
                    Didn&apos;t hit this time
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-2 bg-[#FF3B3B]/10 text-[#FF3B3B] font-bold px-6 py-2 rounded-full text-sm animate-pulse">
                    IN PLAY
                  </span>
                )}
              </div>
            </motion.div>
          </div>
        </section>
      ) : (
        <section className="pb-16 md:pb-24">
          <div className="w-full max-w-[1400px] mx-auto px-6 md:px-10">
            <div className="bg-[#0d0d0d] border border-white/[0.06] rounded-2xl p-10 md:p-16 text-center">
              <div className="text-5xl mb-4">🎰</div>
              <div className="text-lg text-white/40 mb-2">No crazy parlay today yet</div>
              <div className="text-sm text-white/20">Check back later — the AI is still cooking.</div>
            </div>
          </div>
        </section>
      )}

      {/* ── HISTORY ── */}
      <section className="py-16 md:py-24 border-t border-white/[0.04]">
        <div className="w-full max-w-[1400px] mx-auto px-6 md:px-10">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-60px" }}
          >
            <motion.h2
              variants={fadeUp}
              custom={0}
              className="text-2xl md:text-4xl tracking-tight mb-3"
              style={{ fontFamily: "'DM Serif Display', serif" }}
            >
              The Wall
            </motion.h2>
            <motion.p
              variants={fadeUp}
              custom={1}
              className="text-sm text-white/30 mb-12"
            >
              Every crazy parlay from the last 14 days. The ones that hit glow green.
            </motion.p>
          </motion.div>

          {loading ? (
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map((n) => (
                <div key={n} className="bg-white/[0.02] border border-white/[0.04] rounded-xl p-5 h-20 animate-pulse" />
              ))}
            </div>
          ) : history.length === 0 ? (
            <div className="text-center py-20">
              <div className="text-lg text-white/30 mb-2">No history yet</div>
              <div className="text-sm text-white/15">Crazy parlays will show up here as they&apos;re generated.</div>
            </div>
          ) : (
            <div className="space-y-3">
              {history.map((parlay, i) => {
                const isExpanded = expandedId === parlay.id;
                const isWinner = parlay.status === "won";

                return (
                  <motion.div
                    key={parlay.id}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, margin: "-40px" }}
                    variants={fadeUp}
                    custom={i % 6}
                  >
                    <div
                      className={`border rounded-xl transition-all duration-300 ${
                        isWinner
                          ? "bg-green-500/[0.04] border-green-500/20 shadow-[0_0_30px_-10px_rgba(34,197,94,0.15)]"
                          : "bg-white/[0.02] border-white/[0.06] hover:border-white/[0.1]"
                      }`}
                    >
                      {/* Main row — always visible */}
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : parlay.id)}
                        className="w-full flex items-center justify-between p-5 md:p-6 text-left"
                      >
                        <div className="flex items-center gap-4 md:gap-8 flex-1 min-w-0">
                          {/* Date */}
                          <div className="text-sm text-white/40 w-20 flex-shrink-0" style={{ fontFamily: "var(--font-geist-mono)" }}>
                            {formatDate(parlay.created_at)}
                          </div>

                          {/* Legs count */}
                          <div className="text-xs text-white/25 uppercase tracking-wider hidden sm:block w-16 flex-shrink-0">
                            {parlay.legs?.length || 0} legs
                          </div>

                          {/* Combined odds — big */}
                          <div
                            className={`text-xl md:text-2xl font-black flex-shrink-0 ${
                              isWinner ? "text-green-400" : "text-[#FF3B3B]"
                            }`}
                            style={{ fontFamily: "var(--font-geist-mono)" }}
                          >
                            {parlay.combined_odds}
                          </div>

                          {/* Payout */}
                          <div
                            className="text-sm text-white/40 hidden md:block"
                            style={{ fontFamily: "var(--font-geist-mono)" }}
                          >
                            $100 &rarr; ${parlay.payout?.toLocaleString()}
                          </div>
                        </div>

                        <div className="flex items-center gap-4">
                          {statusBadge(parlay.status)}
                          <ChevronDown
                            className={`w-4 h-4 text-white/20 transition-transform duration-200 ${
                              isExpanded ? "rotate-180" : ""
                            }`}
                          />
                        </div>
                      </button>

                      {/* Expanded legs */}
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial="collapsed"
                            animate="expanded"
                            exit="collapsed"
                            variants={expandVariants}
                            className="overflow-hidden"
                          >
                            <div className="px-5 md:px-6 pb-5 md:pb-6 border-t border-white/[0.04]">
                              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-4">
                                {parlay.legs?.map((leg, j) => (
                                  <div key={j} className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-3">
                                    <div className="flex items-center gap-2 mb-1.5">
                                      <span className="text-[10px] font-bold uppercase tracking-wider bg-[#FF3B3B]/15 text-[#FF3B3B] px-2 py-0.5 rounded">
                                        {leg.sport}
                                      </span>
                                      {leg.book && (
                                        <span className="text-[10px] text-white/20">{leg.book}</span>
                                      )}
                                    </div>
                                    <div className="text-sm font-medium text-white/80">{leg.pick}</div>
                                    <div className="text-xs text-white/25 mt-0.5">{leg.game}</div>
                                    <div
                                      className="text-base font-bold text-white mt-1.5"
                                      style={{ fontFamily: "var(--font-geist-mono)" }}
                                    >
                                      {leg.odds > 0 ? `+${leg.odds}` : leg.odds}
                                    </div>
                                  </div>
                                ))}
                              </div>

                              {/* Mobile payout */}
                              <div className="mt-4 flex items-center justify-between md:hidden">
                                <div className="text-xs text-white/30 uppercase tracking-wider">Payout on $100</div>
                                <div
                                  className="text-lg font-bold text-white"
                                  style={{ fontFamily: "var(--font-geist-mono)" }}
                                >
                                  ${parlay.payout?.toLocaleString()}
                                </div>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-20 md:py-28 bg-[#111111] border-t border-white/[0.06]">
        <div className="w-full max-w-[1400px] mx-auto px-6 md:px-10 text-center">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-60px" }}
          >
            <motion.h2
              variants={fadeUp}
              custom={0}
              className="text-3xl md:text-5xl tracking-tight mb-4"
              style={{ fontFamily: "'DM Serif Display', serif" }}
            >
              Want the crazy picks
              <br />
              <span className="text-[#FF3B3B]">before they hit?</span>
            </motion.h2>
            <motion.p variants={fadeUp} custom={1} className="text-base text-white/30 mb-8">
              Subscribers get every parlay — including the long shots — before tip-off.
            </motion.p>
            <motion.div variants={fadeUp} custom={2}>
              <Link
                href="/subscribe"
                className="inline-flex items-center gap-2 bg-[#FF3B3B] text-[#0a0a0a] px-10 py-4 text-base font-semibold rounded-full hover:bg-[#FF5252] transition-colors duration-200"
              >
                Start Free Trial
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
              <Link href="/parlays" className="hover:text-white/60 transition-colors">Parlays</Link>
              <Link href="/odds" className="hover:text-white/60 transition-colors">Odds</Link>
              <Link href="/builder" className="hover:text-white/60 transition-colors">Builder</Link>
              <Link href="/subscribe" className="hover:text-white/60 transition-colors">Pricing</Link>
            </div>
          </div>
          <div className="pt-8 border-t border-white/[0.04] flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-xs text-white/20">
              &copy; {new Date().getFullYear()} BayParlays. All rights reserved.
            </p>
            <p className="text-xs text-white/15 max-w-lg text-center md:text-right leading-relaxed">
              For entertainment purposes only. BayParlays does not accept or place bets.
              Please gamble responsibly. If you or someone you know has a gambling problem, call 1-800-GAMBLER.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
