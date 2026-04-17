"use client";

import Link from "next/link";
import { motion, useScroll, useTransform } from "framer-motion";
import {
  Activity,
  BarChart3,
  BookOpen,
  ChevronRight,
  Crosshair,
  Gauge,
  Menu,
  ScanLine,
  X,
  Zap,
} from "lucide-react";
import { useRef, useState } from "react";

/* ─── animation helpers ─── */
const fadeUp = {
  hidden: { opacity: 0, y: 32 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.6, ease: [0.22, 1, 0.36, 1] as const },
  }),
};

const stagger = {
  visible: { transition: { staggerChildren: 0.12 } },
};

/* ─── mock data ─── */
const parlayLegs = [
  {
    sport: "NBA",
    pick: "Celtics ML",
    odds: "-145",
    book: "FanDuel",
    best: true,
  },
  {
    sport: "MLB",
    pick: "Dodgers -1.5",
    odds: "+110",
    book: "DraftKings",
    best: true,
  },
  {
    sport: "NHL",
    pick: "Over 5.5",
    odds: "+105",
    book: "BetMGM",
    best: true,
  },
];

const sampleParlays = [
  {
    title: "Evening Lock",
    legs: ["Celtics ML", "Dodgers -1.5", "Over 5.5 Goals"],
    combinedOdds: "+487",
    ev: 7.2,
    confidence: 82,
    books: ["FanDuel", "DraftKings", "BetMGM"],
  },
  {
    title: "Afternoon Edge",
    legs: ["Warriors +3.5", "Yankees ML", "Overs 8.5 Runs"],
    combinedOdds: "+342",
    ev: 4.8,
    confidence: 74,
    books: ["BetMGM", "FanDuel", "Caesars"],
  },
  {
    title: "Late Night Value",
    legs: ["Nuggets -2.5", "Under 6.5 Goals", "Padres ML"],
    combinedOdds: "+612",
    ev: 9.1,
    confidence: 68,
    books: ["DraftKings", "BetRivers", "FanDuel"],
  },
];

const sports = [
  "NFL",
  "NBA",
  "MLB",
  "UFC",
  "NHL",
  "NCAAF",
  "NCAAB",
  "Soccer",
  "Tennis",
  "Golf",
];

/* ─────────────────────────────────────────── */
/* ─── PAGE ──────────────────────────────── */
/* ─────────────────────────────────────────── */

export default function Home() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  });
  const heroY = useTransform(scrollYProgress, [0, 1], ["0%", "30%"]);
  const heroOpacity = useTransform(scrollYProgress, [0, 0.7], [1, 0]);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#ededed] overflow-x-hidden">
      {/* ── NAV ── */}
      <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-xl bg-[#0a0a0a]/80 border-b border-white/[0.06]">
        <div className="w-full max-w-[1400px] mx-auto flex items-center justify-between px-6 md:px-10 h-16">
          <Link href="/" className="flex items-center gap-2">
            <span
              className="text-xl font-black tracking-tight"
              style={{ fontFamily: "var(--font-geist-sans)" }}
            >
              Bay
              <span className="text-[#00D4AA]">Parlays</span>
            </span>
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
              href="/builder"
              className="bg-[#00D4AA] text-[#0a0a0a] px-5 py-2 text-xs sm:text-sm font-semibold rounded-full hover:bg-[#00E8BB] transition-colors duration-200"
            >
              Get Started
            </Link>
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden text-white/60 hover:text-white transition-colors"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Mobile dropdown menu */}
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
      <section ref={heroRef} className="relative pt-24 pb-16 md:pt-44 md:pb-40 overflow-hidden">
        {/* Background grain / texture */}
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='1'/%3E%3C/svg%3E")`,
          backgroundSize: "128px 128px",
        }} />

        {/* Subtle radial glow */}
        <div className="absolute top-[-20%] right-[-10%] w-[800px] h-[800px] bg-[#00D4AA]/[0.04] rounded-full blur-[120px] pointer-events-none" />

        <motion.div
          style={{ y: heroY, opacity: heroOpacity }}
          className="relative w-full max-w-[1400px] mx-auto px-6 md:px-10"
        >
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-20 items-center">
            {/* Left — copy */}
            <motion.div
              initial="hidden"
              animate="visible"
              variants={stagger}
            >
              <motion.div variants={fadeUp} custom={0} className="mb-6">
                <span className="inline-flex items-center gap-2 text-xs font-medium tracking-widest uppercase text-[#00D4AA]/80 border border-[#00D4AA]/20 rounded-full px-4 py-1.5 bg-[#00D4AA]/[0.06]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#00D4AA] glow-pulse" />
                  Live odds scanning
                </span>
              </motion.div>

              <motion.h1
                variants={fadeUp}
                custom={1}
                className="text-5xl sm:text-6xl md:text-7xl leading-[0.95] tracking-tight mb-8"
                style={{ fontFamily: "'DM Serif Display', serif" }}
              >
                Every parlay.
                <br />
                <span className="text-[#00D4AA]">Optimized.</span>
              </motion.h1>

              <motion.p
                variants={fadeUp}
                custom={2}
                className="text-lg md:text-xl text-white/50 max-w-[520px] leading-relaxed mb-10"
              >
                We scan DraftKings, FanDuel, BetMGM and 9 more books in
                real-time. Our models surface only{" "}
                <span className="text-white/80 font-medium">
                  +EV parlays
                </span>{" "}
                -- the ones where math says you have the edge.
              </motion.p>

              <motion.div
                variants={fadeUp}
                custom={3}
                className="flex flex-wrap gap-4 mb-14"
              >
                <Link
                  href="/parlays"
                  className="group bg-[#00D4AA] text-[#0a0a0a] px-7 py-3.5 text-sm font-semibold rounded-full hover:bg-[#00E8BB] transition-all duration-200 flex items-center gap-2"
                >
                  See Today&apos;s Parlays
                  <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </Link>
                <Link
                  href="/builder"
                  className="border border-white/15 text-white/80 px-7 py-3.5 text-sm font-semibold rounded-full hover:border-white/30 hover:text-white transition-all duration-200"
                >
                  Build Your Own
                </Link>
              </motion.div>

              {/* Stats row */}
              <motion.div
                variants={fadeUp}
                custom={4}
                className="flex gap-6 md:gap-14"
              >
                {[
                  { value: "6", label: "Sports" },
                  { value: "12+", label: "Books" },
                  { value: "+EV", label: "Only" },
                ].map((stat) => (
                  <div key={stat.label}>
                    <div
                      className="text-2xl md:text-3xl font-bold text-white tracking-tight"
                      style={{ fontFamily: "var(--font-geist-mono)" }}
                    >
                      {stat.value}
                    </div>
                    <div className="text-xs uppercase tracking-widest text-white/30 mt-1">
                      {stat.label}
                    </div>
                  </div>
                ))}
              </motion.div>
            </motion.div>

            {/* Right — live preview card */}
            <motion.div
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.4, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
              className="relative overflow-hidden"
            >
              {/* Glow behind card */}
              <div className="absolute -inset-4 bg-[#00D4AA]/[0.06] rounded-3xl blur-2xl" />

              <div className="relative bg-white/[0.03] border border-white/[0.08] rounded-2xl p-6 md:p-8 backdrop-blur-sm">
                {/* Card header */}
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-[#00D4AA] glow-pulse" />
                    <span className="text-xs font-medium uppercase tracking-widest text-white/40">
                      Today&apos;s Top Pick
                    </span>
                  </div>
                  <span
                    className="text-xs text-white/30"
                    style={{ fontFamily: "var(--font-geist-mono)" }}
                  >
                    3-Leg Parlay
                  </span>
                </div>

                {/* Legs */}
                <div className="space-y-3 mb-6">
                  {parlayLegs.map((leg, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.6 + i * 0.15, duration: 0.5 }}
                      className="flex items-center justify-between bg-white/[0.03] border border-white/[0.06] rounded-xl px-5 py-4"
                    >
                      <div className="flex items-center gap-4">
                        <span
                          className="text-[10px] font-bold uppercase tracking-wider text-[#00D4AA]/70 bg-[#00D4AA]/[0.08] px-2 py-0.5 rounded"
                          style={{ fontFamily: "var(--font-geist-mono)" }}
                        >
                          {leg.sport}
                        </span>
                        <span className="text-sm font-medium text-white/90">
                          {leg.pick}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span
                          className="text-sm font-bold text-white/90"
                          style={{ fontFamily: "var(--font-geist-mono)" }}
                        >
                          {leg.odds}
                        </span>
                        <span className="text-[10px] text-white/30 uppercase">
                          {leg.book}
                        </span>
                      </div>
                    </motion.div>
                  ))}
                </div>

                {/* Divider */}
                <div className="h-px bg-white/[0.06] mb-6" />

                {/* Combined odds + EV */}
                <div className="flex items-end justify-between">
                  <div>
                    <div className="text-xs uppercase tracking-widest text-white/30 mb-1">
                      Combined Odds
                    </div>
                    <div
                      className="text-3xl font-bold text-white tracking-tight"
                      style={{ fontFamily: "var(--font-geist-mono)" }}
                    >
                      +487
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs uppercase tracking-widest text-white/30 mb-2">
                      EV Score
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-28 h-2 bg-white/[0.06] rounded-full overflow-hidden">
                        <motion.div
                          className="h-full rounded-full bg-gradient-to-r from-[#00D4AA] to-[#00E8BB]"
                          initial={{ width: 0 }}
                          animate={{ width: "72%" }}
                          transition={{ delay: 1.2, duration: 1, ease: "easeOut" }}
                        />
                      </div>
                      <span
                        className="text-sm font-bold text-[#00D4AA]"
                        style={{ fontFamily: "var(--font-geist-mono)" }}
                      >
                        +7.2%
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </motion.div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="py-16 md:py-40 border-t border-white/[0.04]">
        <div className="w-full max-w-[1400px] mx-auto px-6 md:px-10">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={stagger}
          >
            <motion.p
              variants={fadeUp}
              custom={0}
              className="text-xs font-medium uppercase tracking-[0.2em] text-[#00D4AA]/60 mb-4"
            >
              How it works
            </motion.p>
            <motion.h2
              variants={fadeUp}
              custom={1}
              className="text-4xl md:text-5xl tracking-tight mb-20"
              style={{ fontFamily: "'DM Serif Display', serif" }}
            >
              Three steps to a{" "}
              <span className="text-[#00D4AA]">smarter bet</span>
            </motion.h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-4">
              {[
                {
                  step: "01",
                  icon: ScanLine,
                  title: "We scan every book",
                  desc: "Real-time odds from 12+ sportsbooks. Every line, every market, every second.",
                },
                {
                  step: "02",
                  icon: Zap,
                  title: "AI finds the edge",
                  desc: "Our models calculate expected value across millions of parlay combinations to find +EV opportunities.",
                },
                {
                  step: "03",
                  icon: Crosshair,
                  title: "You place the bet",
                  desc: "We tell you exactly which book has the best odds for each leg. You execute.",
                },
              ].map((item, i) => (
                <motion.div
                  key={item.step}
                  variants={fadeUp}
                  custom={i + 2}
                  className="group relative"
                >
                  <div className="relative border border-white/[0.06] rounded-2xl p-8 md:p-10 bg-white/[0.015] hover:bg-white/[0.03] transition-colors duration-500 h-full">
                    <div className="flex items-center gap-4 mb-6">
                      <span
                        className="text-4xl font-light text-white/[0.08]"
                        style={{ fontFamily: "var(--font-geist-mono)" }}
                      >
                        {item.step}
                      </span>
                      <item.icon className="w-5 h-5 text-[#00D4AA]/60" />
                    </div>
                    <h3 className="text-xl font-semibold mb-3 text-white/90">
                      {item.title}
                    </h3>
                    <p className="text-sm text-white/40 leading-relaxed">
                      {item.desc}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section className="py-16 md:py-40 bg-white/[0.015] border-t border-b border-white/[0.04]">
        <div className="w-full max-w-[1400px] mx-auto px-6 md:px-10">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={stagger}
          >
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-24 items-start">
              {/* Left — text */}
              <div>
                <motion.p
                  variants={fadeUp}
                  custom={0}
                  className="text-xs font-medium uppercase tracking-[0.2em] text-[#00D4AA]/60 mb-4"
                >
                  The toolkit
                </motion.p>
                <motion.h2
                  variants={fadeUp}
                  custom={1}
                  className="text-4xl md:text-5xl tracking-tight mb-6"
                  style={{ fontFamily: "'DM Serif Display', serif" }}
                >
                  Built for bettors
                  <br />
                  who do the math
                </motion.h2>
                <motion.p
                  variants={fadeUp}
                  custom={2}
                  className="text-white/40 text-lg leading-relaxed max-w-[480px]"
                >
                  Every feature exists for one reason: to give you a
                  quantifiable edge. No hype, no hunches.
                </motion.p>
              </div>

              {/* Right — feature list (NOT a card grid) */}
              <div className="space-y-1">
                {[
                  {
                    icon: Activity,
                    title: "Real-Time Odds",
                    desc: "Line movement tracked across every major book. See where the value is before it disappears.",
                  },
                  {
                    icon: BarChart3,
                    title: "EV Calculator",
                    desc: "Input any parlay, get the expected value instantly. Know if your bet has positive or negative expected returns.",
                  },
                  {
                    icon: BookOpen,
                    title: "Parlay Builder",
                    desc: "Combine legs from different books for the best combined odds. We find the optimal mix automatically.",
                  },
                  {
                    icon: Gauge,
                    title: "Sharp Indicators",
                    desc: "See where the sharp money is going. Line movement, steam moves, and reverse line movement alerts.",
                  },
                ].map((feature, i) => (
                  <motion.div
                    key={feature.title}
                    variants={fadeUp}
                    custom={i + 3}
                    className="group flex gap-5 p-5 rounded-xl hover:bg-white/[0.03] transition-colors duration-300 cursor-default"
                  >
                    <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-[#00D4AA]/[0.08] border border-[#00D4AA]/[0.12] flex items-center justify-center mt-0.5">
                      <feature.icon className="w-4.5 h-4.5 text-[#00D4AA]/70" />
                    </div>
                    <div>
                      <h3 className="text-base font-semibold text-white/90 mb-1">
                        {feature.title}
                      </h3>
                      <p className="text-sm text-white/35 leading-relaxed">
                        {feature.desc}
                      </p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── SPORTS MARQUEE ── */}
      <section className="py-6 border-b border-white/[0.04] overflow-hidden bg-[#0a0a0a]">
        <div className="flex animate-marquee whitespace-nowrap">
          {[...sports, ...sports, ...sports].map((sport, i) => (
            <span
              key={i}
              className="mx-8 md:mx-12 text-sm font-medium uppercase tracking-[0.25em] text-white/[0.12] select-none"
              style={{ fontFamily: "var(--font-geist-mono)" }}
            >
              {sport}
            </span>
          ))}
        </div>
      </section>

      {/* ── SAMPLE PARLAYS ── */}
      <section className="py-16 md:py-40">
        <div className="w-full max-w-[1400px] mx-auto px-6 md:px-10">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={stagger}
          >
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-16">
              <div>
                <motion.p
                  variants={fadeUp}
                  custom={0}
                  className="text-xs font-medium uppercase tracking-[0.2em] text-[#00D4AA]/60 mb-4"
                >
                  Today&apos;s picks
                </motion.p>
                <motion.h2
                  variants={fadeUp}
                  custom={1}
                  className="text-4xl md:text-5xl tracking-tight"
                  style={{ fontFamily: "'DM Serif Display', serif" }}
                >
                  Top AI parlays
                </motion.h2>
              </div>
              <motion.div variants={fadeUp} custom={2}>
                <Link
                  href="/parlays"
                  className="text-sm text-[#00D4AA]/70 hover:text-[#00D4AA] transition-colors flex items-center gap-1"
                >
                  View all parlays
                  <ChevronRight className="w-4 h-4" />
                </Link>
              </motion.div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {sampleParlays.map((parlay, i) => (
                <motion.div
                  key={parlay.title}
                  variants={fadeUp}
                  custom={i + 3}
                  className="group border border-white/[0.06] rounded-2xl p-7 bg-white/[0.015] hover:bg-white/[0.03] hover:border-white/[0.1] transition-all duration-500"
                >
                  {/* Header */}
                  <div className="flex items-center justify-between mb-5">
                    <h3 className="text-base font-semibold text-white/80">
                      {parlay.title}
                    </h3>
                    <span
                      className="text-xs text-white/25"
                      style={{ fontFamily: "var(--font-geist-mono)" }}
                    >
                      {parlay.legs.length}-Leg
                    </span>
                  </div>

                  {/* Legs list */}
                  <div className="space-y-2.5 mb-6">
                    {parlay.legs.map((leg, j) => (
                      <div
                        key={j}
                        className="flex items-center justify-between text-sm"
                      >
                        <span className="text-white/50">{leg}</span>
                        <span className="text-[10px] text-white/25 uppercase">
                          {parlay.books[j]}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Divider */}
                  <div className="h-px bg-white/[0.06] mb-5" />

                  {/* Odds + EV + Confidence */}
                  <div className="flex items-end justify-between">
                    <div>
                      <div className="text-[10px] uppercase tracking-widest text-white/25 mb-1">
                        Odds
                      </div>
                      <div
                        className="text-xl font-bold text-white"
                        style={{ fontFamily: "var(--font-geist-mono)" }}
                      >
                        {parlay.combinedOdds}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] uppercase tracking-widest text-white/25 mb-1">
                        EV
                      </div>
                      <div
                        className="text-lg font-bold text-[#00D4AA]"
                        style={{ fontFamily: "var(--font-geist-mono)" }}
                      >
                        +{parlay.ev}%
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] uppercase tracking-widest text-white/25 mb-1">
                        Confidence
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-12 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full bg-[#00D4AA]/70"
                            style={{ width: `${parlay.confidence}%` }}
                          />
                        </div>
                        <span
                          className="text-xs text-white/40"
                          style={{ fontFamily: "var(--font-geist-mono)" }}
                        >
                          {parlay.confidence}
                        </span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── BOTTOM CTA ── */}
      <section className="py-16 md:py-40 border-t border-white/[0.04] relative overflow-hidden">
        {/* Background glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#00D4AA]/[0.03] rounded-full blur-[100px] pointer-events-none" />

        <div className="w-full max-w-[1400px] mx-auto px-6 md:px-10 relative">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={stagger}
            className="text-center max-w-2xl mx-auto"
          >
            <motion.h2
              variants={fadeUp}
              custom={0}
              className="text-4xl sm:text-5xl md:text-6xl tracking-tight mb-6"
              style={{ fontFamily: "'DM Serif Display', serif" }}
            >
              Stop guessing.
              <br />
              <span className="text-[#00D4AA]">Start calculating.</span>
            </motion.h2>
            <motion.p
              variants={fadeUp}
              custom={1}
              className="text-white/40 text-lg mb-10 max-w-md mx-auto leading-relaxed"
            >
              Join thousands of bettors using data-driven parlays to find
              their edge.
            </motion.p>
            <motion.div variants={fadeUp} custom={2}>
              <Link
                href="/builder"
                className="group inline-flex items-center gap-2 bg-[#00D4AA] text-[#0a0a0a] px-8 py-4 text-sm font-semibold rounded-full hover:bg-[#00E8BB] transition-all duration-200"
              >
                Start Building Parlays
                <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="border-t border-white/[0.04] py-16 md:py-20">
        <div className="w-full max-w-[1400px] mx-auto px-6 md:px-10">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 md:gap-8 mb-16">
            {/* Brand */}
            <div className="md:col-span-2">
              <span
                className="text-lg font-black tracking-tight"
                style={{ fontFamily: "var(--font-geist-sans)" }}
              >
                Bay
                <span className="text-[#00D4AA]">Parlays</span>
              </span>
              <p className="text-sm text-white/30 mt-3 max-w-sm leading-relaxed">
                AI-powered parlay optimization. We find the best odds across
                every sportsbook so you can bet with a mathematical edge.
              </p>
            </div>

            {/* Links */}
            <div>
              <h4 className="text-xs uppercase tracking-[0.15em] text-white/20 mb-4 font-medium">
                Product
              </h4>
              <div className="space-y-3">
                {["Parlays", "Odds", "Builder", "EV Calculator"].map(
                  (link) => (
                    <Link
                      key={link}
                      href={`/${link.toLowerCase().replace(" ", "-")}`}
                      className="block text-sm text-white/40 hover:text-white/70 transition-colors"
                    >
                      {link}
                    </Link>
                  )
                )}
              </div>
            </div>

            <div>
              <h4 className="text-xs uppercase tracking-[0.15em] text-white/20 mb-4 font-medium">
                Company
              </h4>
              <div className="space-y-3">
                {["About", "Terms", "Privacy", "Contact"].map((link) => (
                  <Link
                    key={link}
                    href={`/${link.toLowerCase()}`}
                    className="block text-sm text-white/40 hover:text-white/70 transition-colors"
                  >
                    {link}
                  </Link>
                ))}
              </div>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="pt-8 border-t border-white/[0.04] flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-xs text-white/20">
              &copy; {new Date().getFullYear()} BayParlays. All rights
              reserved.
            </p>
            <p className="text-xs text-white/15 max-w-lg text-center md:text-right leading-relaxed">
              For entertainment purposes only. BayParlays does not accept or
              place bets. Please gamble responsibly. If you or someone you
              know has a gambling problem, call 1-800-GAMBLER.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
