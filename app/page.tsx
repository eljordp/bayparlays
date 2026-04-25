"use client";

import Link from "next/link";
import { motion, useInView } from "framer-motion";
import { ChevronRight, ArrowRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Logo } from "@/app/components/Logo";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { ProcessAnimation } from "@/app/components/ProcessAnimation";
import { ParlayPlayer } from "@/app/components/ParlayPlayer";
import { HowItWorksPlayer } from "@/app/components/HowItWorksVideo";
import { BettingSlip } from "@/app/components/BettingSlip";
import { AppNav } from "@/app/components/AppNav";
import { LockOfTheDay } from "@/app/components/LockOfTheDay";

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
  const [odds, setOdds] = useState<OddsGame[]>([]);
  const oddsScrollRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [potd, setPotd] = useState<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [featuredParlay, setFeaturedParlay] = useState<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [crazy, setCrazy] = useState<any>(null);
  const [captureEmail, setCaptureEmail] = useState("");
  const [emailSubmitted, setEmailSubmitted] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);

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

  // Fetch Parlay of the Day
  useEffect(() => {
    async function fetchPotd() {
      try {
        const res = await fetch("/api/potd");
        if (res.ok) {
          const data = await res.json();
          if (data.potd) setPotd(data.potd);
        }
      } catch {
        /* silent */
      }
    }
    fetchPotd();
  }, []);

  // Fetch Craziest Parlay of the Day
  useEffect(() => {
    async function fetchCrazy() {
      try {
        const res = await fetch("/api/crazy");
        if (res.ok) {
          const data = await res.json();
          if (data.crazy) setCrazy(data.crazy);
        }
      } catch {
        /* silent */
      }
    }
    fetchCrazy();
  }, []);

  // Fetch featured parlay from track record
  useEffect(() => {
    async function fetchFeatured() {
      try {
        const res = await fetch("/api/track/results");
        if (res.ok) {
          const data = await res.json();
          // Find the best winning parlay, or fall back to most recent
          const won = data.recentParlays?.filter((p: { status: string }) => p.status === "won");
          if (won?.length > 0) {
            // Best winner by payout
            setFeaturedParlay(won.reduce((best: { payout: number }, p: { payout: number }) => p.payout > best.payout ? p : best, won[0]));
          } else if (data.recentParlays?.length > 0) {
            // No winners yet — show most recent pending
            const pending = data.recentParlays.filter((p: { status: string }) => p.status === "pending");
            if (pending?.length > 0) setFeaturedParlay(pending[0]);
          }
        }
      } catch { /* silent */ }
    }
    fetchFeatured();
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
    <div className="min-h-screen bg-[#FAFAF7] text-[#0a0a0a] overflow-x-hidden">
      <AppNav />

      {/* ── LOCK OF THE DAY (top hero) ── */}
      <LockOfTheDay />

      {/* ── HERO ── */}
      <section className="pt-16 pb-20 md:pt-20 md:pb-32">
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
                className="text-sm text-black/45 mb-6"
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
                <span className="text-[#0a0a0a]">You place the bet.</span>
              </motion.h1>

              <motion.p
                variants={fadeUp}
                custom={2}
                className="text-base md:text-lg text-black/55 mb-10 max-w-md leading-relaxed"
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
                  className="inline-flex items-center gap-2 bg-[#0a0a0a] text-white px-7 py-3.5 text-sm font-semibold rounded-full hover:bg-[#1f1f1f] transition-colors duration-200"
                >
                  Start Free Trial
                  <ChevronRight className="w-4 h-4" />
                </Link>
                <a
                  href="#how-it-pays"
                  className="inline-flex items-center gap-2 border border-black/20 text-black/60 px-7 py-3.5 text-sm font-medium rounded-full hover:border-black/40 hover:text-black transition-all duration-200"
                >
                  See How It Works
                </a>
              </motion.div>
            </motion.div>

            {/* Right — Remotion Video */}
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{
                delay: 0.3,
                duration: 0.7,
                ease: [0.25, 0.1, 0.25, 1],
              }}
            >
              <LiveHeroParlay />
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── SOCIAL PROOF STRIP ── */}
      <section className="py-10 md:py-14 bg-white border-y border-black/[0.06]">
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
                  className="text-2xl md:text-3xl font-bold text-[#0a0a0a] mb-1"
                  style={{ fontFamily: "var(--font-geist-mono)" }}
                >
                  <AnimatedCounter
                    value={stat.value}
                    prefix={stat.prefix}
                    suffix={stat.suffix}
                  />
                </div>
                <div className="text-xs text-black/45 uppercase tracking-widest">
                  {stat.label}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PARLAY OF THE DAY ── */}
      {potd && (
        <section className="py-16 md:py-24 border-b border-black/[0.04]">
          <div className="w-full max-w-[1400px] mx-auto px-6 md:px-10">
            {/* Header with flashing POTD badge */}
            <div className="flex items-center gap-4 mb-10">
              <div className="flex items-center gap-2 bg-black/[0.05] border border-black/10 rounded-full px-4 py-2">
                <span className="w-2 h-2 rounded-full bg-[#0a0a0a] animate-pulse" />
                <span className="text-xs font-bold uppercase tracking-wider text-[#0a0a0a]">
                  Parlay of the Day
                </span>
              </div>
              <span className="text-sm text-black/45" style={{ fontFamily: "var(--font-geist-mono)" }}>
                {new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </span>
            </div>

            {/* POTD content */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Main card — takes 2 columns */}
              <div className="lg:col-span-2 bg-white border border-black/[0.06] rounded-2xl p-6 md:p-8">
                {/* Legs */}
                <div className="space-y-4 mb-6">
                  {potd.legs?.map((leg: { sport: string; pick: string; game: string; odds: number; book: string }, i: number) => (
                    <div key={i} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] font-bold uppercase tracking-wider bg-black/[0.06] text-[#0a0a0a] px-2 py-1 rounded">
                          {leg.sport}
                        </span>
                        <div>
                          <div className="text-sm text-black/80 font-medium">{leg.pick}</div>
                          <div className="text-xs text-black/45">{leg.game}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-bold text-[#0a0a0a]" style={{ fontFamily: "var(--font-geist-mono)" }}>
                          {leg.odds > 0 ? `+${leg.odds}` : leg.odds}
                        </div>
                        <div className="text-[10px] text-black/40">{leg.book}</div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="h-px bg-black/[0.06] mb-4" />

                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs text-black/45 uppercase tracking-wider mb-1">Combined Odds</div>
                    <div className="text-3xl font-black text-[#0a0a0a]" style={{ fontFamily: "var(--font-geist-mono)" }}>
                      {potd.combinedOdds || potd.combined_odds}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-black/45 uppercase tracking-wider mb-1">$100 Pays</div>
                    <div className="text-2xl font-bold text-[#0a0a0a]" style={{ fontFamily: "var(--font-geist-mono)" }}>
                      ${potd.payout}
                    </div>
                  </div>
                </div>
              </div>

              {/* Side panel — stats */}
              <div className="space-y-4">
                <div className="bg-white border border-black/[0.06] rounded-2xl p-6">
                  <div className="text-xs text-black/45 uppercase tracking-wider mb-2">Confidence</div>
                  <div className="text-4xl font-black text-[#0a0a0a]" style={{ fontFamily: "var(--font-geist-mono)" }}>
                    {potd.confidence}%
                  </div>
                  <div className="mt-3 h-2 bg-black/[0.06] rounded-full overflow-hidden">
                    <div className="h-full bg-[#0a0a0a] rounded-full" style={{ width: `${potd.confidence}%` }} />
                  </div>
                </div>
                <div className="bg-white border border-black/[0.06] rounded-2xl p-6">
                  <div className="text-xs text-black/45 uppercase tracking-wider mb-2">Expected Value</div>
                  <div className="text-3xl font-black text-[#22C55E]" style={{ fontFamily: "var(--font-geist-mono)" }}>
                    +{(potd.evPercent || potd.ev_percent || 0).toFixed(1)}%
                  </div>
                </div>
                <Link href="/subscribe" className="block bg-[#0a0a0a] text-center text-white font-bold py-4 rounded-2xl hover:bg-[#1f1f1f] transition-colors">
                  Get All Picks
                </Link>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── WATCH IT WORK (How The AI Works Video) ── */}
      <section className="py-20 md:py-32 border-b border-black/[0.04]">
        <div className="w-full max-w-[1400px] mx-auto px-6 md:px-10">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            className="text-center"
          >
            <motion.h2
              variants={fadeUp}
              custom={0}
              className="text-3xl md:text-5xl tracking-tight mb-4"
              style={{ fontFamily: "'DM Serif Display', serif" }}
            >
              Watch It Work
            </motion.h2>
            <motion.div
              variants={fadeUp}
              custom={1}
              className="w-16 h-0.5 bg-[#0a0a0a] mx-auto mb-10"
            />
            <motion.div
              variants={fadeUp}
              custom={2}
              className="flex justify-center mb-8"
            >
              <HowItWorksPlayer />
            </motion.div>
            <motion.p
              variants={fadeUp}
              custom={3}
              className="text-base md:text-lg text-black/55 max-w-lg mx-auto leading-relaxed"
            >
              Our AI scans odds, finds the edge, and builds your parlay in seconds.
            </motion.p>
          </motion.div>
        </div>
      </section>

      {/* ── CRAZIEST PARLAY OF THE DAY ── */}
      {crazy && (
        <section className="py-16 md:py-24 bg-gradient-to-b from-black/[0.03] to-transparent border-y border-black/[0.06]">
          <div className="w-full max-w-[1400px] mx-auto px-6 md:px-10">
            <div className="flex items-center justify-between mb-10">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 bg-black/10 border border-black/20 rounded-full px-4 py-2">
                  <span className="text-lg">🎰</span>
                  <span className="text-xs font-black uppercase tracking-wider text-[#0a0a0a]">
                    Craziest Parlay
                  </span>
                </div>
                <span className="text-sm text-black/45" style={{ fontFamily: "var(--font-geist-mono)" }}>
                  Today&apos;s long shot
                </span>
              </div>
              <Link href="/crazy" className="text-sm text-[#0a0a0a]/60 hover:text-[#0a0a0a] transition-colors flex items-center gap-1">
                History &rarr;
              </Link>
            </div>

            <div className="bg-white border border-black/[0.06] rounded-2xl p-6 md:p-10">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
                {/* Left: Big odds display + legs */}
                <div>
                  {/* Big odds display */}
                  <div className="text-center lg:text-left mb-8">
                    <div className="text-xs text-black/45 uppercase tracking-widest mb-3">If this hits...</div>
                    <div className="text-6xl md:text-8xl font-black text-[#0a0a0a]" style={{ fontFamily: "var(--font-geist-mono)" }}>
                      {crazy.combined_odds}
                    </div>
                    <div className="text-xl md:text-2xl text-black/60 mt-2" style={{ fontFamily: "var(--font-geist-mono)" }}>
                      $100 &rarr; ${crazy.payout?.toLocaleString()}
                    </div>
                  </div>

                  {/* Legs */}
                  <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-1 gap-3">
                    {crazy.legs?.map((leg: { sport: string; pick: string; game: string; odds: number }, i: number) => (
                      <div key={i} className="bg-white border border-black/[0.06] rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-[10px] font-bold uppercase tracking-wider bg-black/[0.06] text-[#0a0a0a] px-2 py-0.5 rounded">
                            {leg.sport}
                          </span>
                        </div>
                        <div className="text-sm font-medium text-black/80">{leg.pick}</div>
                        <div className="text-xs text-black/45 mt-1">{leg.game}</div>
                        <div className="text-lg font-bold text-[#0a0a0a] mt-2" style={{ fontFamily: "var(--font-geist-mono)" }}>
                          {leg.odds > 0 ? `+${leg.odds}` : leg.odds}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Right: Remotion video preview of the crazy parlay */}
                <div className="flex justify-center">
                  <ParlayPlayer
                    legs={crazy.legs?.map((leg: { sport: string; pick: string; game: string; odds: number; book?: string }) => ({
                      sport: leg.sport,
                      pick: leg.pick,
                      odds: leg.odds,
                      book: leg.book || "Best Line",
                      game: leg.game,
                    })) || []}
                    combinedOdds={crazy.combined_odds || ""}
                    evPercent={0}
                    confidence={0}
                    payout={crazy.payout || 0}
                    maxWidth={340}
                  />
                </div>
              </div>

              {/* Status */}
              <div className="text-center mt-8">
                {crazy.status === "won" ? (
                  <span className="inline-flex items-center gap-2 bg-green-500/15 text-green-400 font-bold px-6 py-2 rounded-full text-sm">
                    THIS HIT
                  </span>
                ) : crazy.status === "lost" ? (
                  <span className="inline-flex items-center gap-2 bg-black/[0.04] text-black/45 font-medium px-6 py-2 rounded-full text-sm">
                    Didn&apos;t hit this time
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-2 bg-black/[0.05] text-[#0a0a0a] font-bold px-6 py-2 rounded-full text-sm animate-pulse">
                    IN PLAY
                  </span>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── FEATURED PARLAY (LIVE FROM DB) ── */}
      {featuredParlay && (
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
                {featuredParlay.status === "won" ? "Latest Winner" : "Live Pick"}
              </motion.h2>
              <motion.div
                variants={fadeUp}
                custom={1}
                className="w-16 h-0.5 bg-[#0a0a0a] mb-14"
              />

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">
                <motion.div variants={fadeUp} custom={2}>
                  <BettingSlip
                    legs={featuredParlay.legs.map((leg: { sport: string; pick: string; odds: number; book: string }) => ({
                      sport: leg.sport,
                      pick: leg.pick,
                      odds: leg.odds,
                      result: featuredParlay.status === "won" ? "win" : featuredParlay.status === "lost" ? "loss" : "pending",
                      book: leg.book,
                    }))}
                    stake={100}
                    payout={featuredParlay.payout}
                    status={featuredParlay.status === "won" ? "won" : featuredParlay.status === "lost" ? "lost" : "pending"}
                    animated={true}
                  />
                </motion.div>

                <motion.div variants={fadeUp} custom={3}>
                  <p
                    className="text-sm text-[#0a0a0a]/60 uppercase tracking-[0.2em] mb-4 font-medium"
                    style={{ fontFamily: "var(--font-geist-mono)" }}
                  >
                    {featuredParlay.status === "won" ? "Verified Win" : featuredParlay.status === "pending" ? "In Progress" : "Track Record"}
                  </p>
                  <p className="text-xl md:text-2xl text-black/80 leading-relaxed mb-6">
                    {featuredParlay.status === "won" ? (
                      <>AI locked this parlay. Every leg hit.</>
                    ) : featuredParlay.status === "pending" ? (
                      <>AI locked this parlay. Waiting on results.</>
                    ) : (
                      <>AI generated this parlay. Not every pick wins.</>
                    )}
                  </p>
                  <p className="text-base text-black/55 leading-relaxed mb-4">
                    {featuredParlay.legs.length}-leg parlay at{" "}
                    <span className="text-black/70 font-semibold" style={{ fontFamily: "var(--font-geist-mono)" }}>
                      {featuredParlay.combined_odds}
                    </span>
                    {" "}odds. Expected value:{" "}
                    <span className="text-black/70 font-semibold" style={{ fontFamily: "var(--font-geist-mono)" }}>
                      {featuredParlay.ev_percent > 0 ? "+" : ""}{Number(featuredParlay.ev_percent).toFixed(1)}%
                    </span>
                  </p>
                  <p className="text-sm text-black/40 mb-8" style={{ fontFamily: "var(--font-geist-mono)" }}>
                    Generated {new Date(featuredParlay.created_at).toLocaleString()}
                  </p>
                  <Link
                    href="/results"
                    className="inline-flex items-center gap-2 text-sm text-[#0a0a0a]/70 hover:text-[#0a0a0a] transition-colors"
                  >
                    See full track record
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </motion.div>
              </div>
            </motion.div>
          </div>
        </section>
      )}

      {/* ── LIVE ODDS STRIP ── */}
      {odds.length > 0 && (
        <section className="py-14 md:py-20 border-y border-black/[0.04] bg-white">
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
                  <span className="w-2 h-2 bg-[#0a0a0a] rounded-full glow-pulse" />
                  <h2
                    className="text-xs font-medium uppercase tracking-[0.2em] text-black/45"
                    style={{ fontFamily: "var(--font-geist-mono)" }}
                  >
                    Live Odds &mdash; NBA
                  </h2>
                </div>
                <Link
                  href="/odds"
                  className="text-xs text-black/40 hover:text-[#0a0a0a] transition-colors flex items-center gap-1"
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
                      className="flex-shrink-0 w-[220px] py-4 px-5 bg-white border border-black/[0.06] rounded-xl hover:bg-black/[0.02] hover:border-black/[0.12] transition-all duration-300"
                    >
                      <div className="text-[11px] text-black/45 mb-3 truncate">
                        {game.awayTeam} @ {game.homeTeam}
                      </div>
                      {bestLine && (
                        <div className="flex items-baseline justify-between">
                          <span
                            className="text-lg font-bold text-[#0a0a0a]"
                            style={{ fontFamily: "var(--font-geist-mono)" }}
                          >
                            {formatOdds(bestLine.bestPrice)}
                          </span>
                          <span className="text-[10px] text-black/30 uppercase">
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
              className="text-base text-black/45 text-center mb-16 max-w-lg mx-auto"
            >
              Same sport. Same day. Different approach. Different result.
            </motion.p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 lg:gap-20">
              {/* Without */}
              <motion.div variants={fadeUp} custom={2}>
                <p
                  className="text-xs uppercase tracking-[0.2em] text-black/40 mb-5 text-center"
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
                  className="text-xs uppercase tracking-[0.2em] text-[#0a0a0a]/50 mb-5 text-center font-medium"
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

      {/* ── EMAIL CAPTURE ── */}
      <section className="py-16 md:py-24 border-t border-black/[0.04]">
        <div className="w-full max-w-[600px] mx-auto px-6 md:px-10 text-center">
          <h2 className="text-2xl md:text-3xl tracking-tight mb-4" style={{ fontFamily: "'DM Serif Display', serif" }}>
            Not ready to subscribe?
          </h2>
          <p className="text-black/55 mb-8">
            Drop your email. We&apos;ll send you our best pick of the week — free.
          </p>

          {emailSubmitted ? (
            <div className="text-[#22C55E] font-semibold">You&apos;re in. Watch your inbox.</div>
          ) : (
            <form onSubmit={async (e) => {
              e.preventDefault();
              if (!captureEmail) return;
              setEmailLoading(true);
              try {
                await fetch("/api/email-capture", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ email: captureEmail }),
                });
                setEmailSubmitted(true);
              } catch {}
              setEmailLoading(false);
            }} className="flex gap-3 max-w-md mx-auto">
              <input
                type="email"
                placeholder="your@email.com"
                value={captureEmail}
                onChange={(e) => setCaptureEmail(e.target.value)}
                required
                className="flex-1 bg-white border border-black/[0.08] rounded-full px-5 py-3 text-sm text-[#0a0a0a] placeholder-black/40 focus:outline-none focus:border-black/40"
              />
              <button
                type="submit"
                disabled={emailLoading}
                className="bg-[#0a0a0a] text-white px-6 py-3 text-sm font-semibold rounded-full hover:bg-[#1f1f1f] transition-colors disabled:opacity-50"
              >
                {emailLoading ? "..." : "Send"}
              </button>
            </form>
          )}
        </div>
      </section>

      {/* ── PRICING CTA ── */}
      <section className="py-24 md:py-36 bg-white border-y border-black/[0.06]">
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
                className="text-7xl md:text-8xl text-[#0a0a0a] block mb-2"
                style={{ fontFamily: "var(--font-geist-mono)" }}
              >
                $50
              </span>
              per month.
            </motion.h2>

            <motion.p
              variants={fadeUp}
              custom={1}
              className="text-base md:text-lg text-black/55 mb-10"
            >
              7-day free trial. Cancel anytime. One winning parlay pays for a year.
            </motion.p>

            <motion.div variants={fadeUp} custom={2}>
              <Link
                href="/subscribe"
                className="inline-flex items-center gap-2 bg-[#0a0a0a] text-white px-10 py-4 text-base font-semibold rounded-full hover:bg-[#1f1f1f] transition-colors duration-200"
              >
                Start Free Trial
                <ChevronRight className="w-5 h-5" />
              </Link>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="border-t border-black/[0.04] py-16 md:py-20">
        <div className="w-full max-w-[1400px] mx-auto px-6 md:px-10">
          <div className="flex flex-col md:flex-row items-start justify-between gap-10 mb-12">
            <div>
              <Logo size="sm" />
            </div>

            <div className="flex flex-wrap gap-x-10 gap-y-3 text-sm text-black/45">
              <Link
                href="/parlays"
                className="hover:text-black/60 transition-colors"
              >
                Parlays
              </Link>
              <Link
                href="/odds"
                className="hover:text-black/60 transition-colors"
              >
                Odds
              </Link>
              <Link
                href="/builder"
                className="hover:text-black/60 transition-colors"
              >
                Builder
              </Link>
              <Link
                href="/subscribe"
                className="hover:text-black/60 transition-colors"
              >
                Pricing
              </Link>
              <Link
                href="/achievements"
                className="hover:text-black/60 transition-colors"
              >
                Achievements
              </Link>
              <Link
                href="/leaderboard"
                className="hover:text-black/60 transition-colors"
              >
                Leaderboard
              </Link>
            </div>
          </div>

          <div className="pt-8 border-t border-black/[0.04] flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-xs text-black/30">
              &copy; {new Date().getFullYear()} BayParlays. All rights reserved.
            </p>
            <p className="text-xs text-black/30 max-w-lg text-center md:text-right leading-relaxed">
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

/* ─── Live Hero Parlay ─────────────────────────────────────────────────────
 * Replaces the hardcoded 3-leg demo in the hero. Fetches today's real AI
 * parlay from /api/parlays and hands it to the ParlayPlayer. Falls back to
 * a tasteful static parlay if the API is cold or errors — never shows an
 * empty placeholder. */

interface HeroApiLeg {
  sport: string;
  game: string;
  pick: string;
  odds: number;
  book: string;
}

interface HeroApiParlay {
  legs: HeroApiLeg[];
  combinedOdds: string;
  evPercent: number;
  confidence: number;
  payout: number;
}

interface HeroApiResponse {
  parlays: HeroApiParlay[];
}

const HERO_FALLBACK: HeroApiParlay = {
  legs: [
    { sport: "NBA", pick: "Celtics ML", odds: -145, book: "FanDuel", game: "PHI @ BOS" },
    { sport: "MLB", pick: "Dodgers -1.5", odds: 110, book: "DraftKings", game: "LAD @ COL" },
    { sport: "NHL", pick: "Over 5.5", odds: 105, book: "BetMGM", game: "STL @ UTA" },
  ],
  combinedOdds: "+487",
  evPercent: 7.2,
  confidence: 82,
  payout: 587,
};

function LiveHeroParlay() {
  const [parlay, setParlay] = useState<HeroApiParlay>(HERO_FALLBACK);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(
          "/api/parlays?sports=nba,mlb,nhl,ncaab&legs=3&count=1&sort=ev&tier=admin",
          { cache: "no-store" },
        );
        if (!res.ok) return;
        const data: HeroApiResponse = await res.json();
        const p = data.parlays?.[0];
        if (!p || !p.legs || p.legs.length === 0) return;
        if (!cancelled) setParlay(p);
      } catch {
        // Keep fallback on network errors
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <ParlayPlayer
      legs={parlay.legs}
      combinedOdds={parlay.combinedOdds}
      evPercent={parlay.evPercent}
      confidence={parlay.confidence}
      payout={parlay.payout}
    />
  );
}
