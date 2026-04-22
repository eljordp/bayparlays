"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowUpRight, Menu, X, Share2, ExternalLink } from "lucide-react";
import { NavUser } from "@/app/components/NavUser";
import { Logo } from "@/app/components/Logo";
import { ParlayPlayer } from "../components/ParlayPlayer";
import type { ParlayLeg } from "../components/ParlayVideo";

/* ─── Types matching the API response ─── */

interface ApiLeg {
  sport: string;
  game: string;
  pick: string;
  market: string;
  odds: number;
  book: string;
  impliedProb: number;
  edgeScore: number;
}

interface ApiParlay {
  id: string;
  legs: ApiLeg[];
  combinedOdds: string;
  combinedDecimal: number;
  ev: number;
  evPercent: number;
  confidence: number;
  payout: number;
  timestamp: string;
}

interface ApiResponse {
  parlays: ApiParlay[];
  meta: {
    sportsScanned: string[];
    gamesAnalyzed: number;
    legsEvaluated: number;
    generatedAt: string;
  };
}

/* ─── Page ─── */

export default function SharePage() {
  const [parlay, setParlay] = useState<ApiParlay | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [format, setFormat] = useState<"square" | "story">("square");

  useEffect(() => {
    async function fetchTopParlay() {
      try {
        const res = await fetch("/api/parlays?count=1&legs=3");
        if (!res.ok) throw new Error("Failed to fetch");
        const data: ApiResponse = await res.json();
        if (data.parlays.length > 0) {
          setParlay(data.parlays[0]);
        } else {
          setError("No parlays available right now.");
        }
      } catch {
        setError("Unable to load parlay data.");
      } finally {
        setLoading(false);
      }
    }
    fetchTopParlay();
  }, []);

  /* Transform API legs to ParlayVideo legs */
  const videoLegs: ParlayLeg[] = parlay
    ? parlay.legs.map((leg) => ({
        sport: leg.sport,
        pick: leg.pick,
        odds: leg.odds,
        book: leg.book,
        game: leg.game,
      }))
    : [];

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
            <Link
              href="/"
              className="flex items-center"
            >
              <Logo />
            </Link>
            <div className="hidden md:flex items-center gap-8">
              {[
                { href: "/", label: "Home" },
                { href: "/parlays", label: "AI Parlays" },
                { href: "/props", label: "Props" },
                { href: "/odds", label: "Odds" },
                { href: "/builder", label: "Builder" },
                { href: "/results", label: "Results" },
                { href: "/simulator", label: "Simulator" },
                { href: "/share", label: "Share" },
              ].map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-sm transition-colors duration-200"
                  style={{
                    color:
                      link.href === "/share"
                        ? "#FF3B3B"
                        : "rgba(255,255,255,0.5)",
                    fontWeight: link.href === "/share" ? 600 : 400,
                  }}
                  onMouseEnter={(e) => {
                    if (link.href !== "/share")
                      e.currentTarget.style.color = "rgba(255,255,255,0.9)";
                  }}
                  onMouseLeave={(e) => {
                    if (link.href !== "/share")
                      e.currentTarget.style.color = "rgba(255,255,255,0.5)";
                  }}
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
                  { href: "/props", label: "Props" },
                  { href: "/odds", label: "Odds" },
                  { href: "/builder", label: "Builder" },
                  { href: "/results", label: "Results" },
                  { href: "/simulator", label: "Simulator" },
                  { href: "/share", label: "Share" },
                ].map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className="py-3 px-4 rounded-lg text-sm font-medium transition-colors duration-150"
                    style={{
                      color:
                        link.href === "/share"
                          ? "#FF3B3B"
                          : "rgba(255,255,255,0.6)",
                      background:
                        link.href === "/share"
                          ? "rgba(255,59,59,0.08)"
                          : "transparent",
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

      {/* ─── Content ─── */}
      <main className="pt-28 pb-20 px-4 md:pt-36 md:pb-32 md:px-6">
        <div className="max-w-[900px] mx-auto">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center mb-12"
          >
            <div className="flex items-center justify-center gap-3 mb-6">
              <Share2 size={16} style={{ color: "#FF3B3B" }} />
              <span
                className="text-xs font-medium tracking-widest uppercase"
                style={{ color: "#FF3B3B" }}
              >
                Share Card
              </span>
            </div>
            <h1
              className="text-4xl md:text-6xl font-normal leading-[1.1] mb-5"
              style={{
                fontFamily: "'DM Serif Display', serif",
                color: "#ededed",
              }}
            >
              Share Today&apos;s Top Pick
            </h1>
            <p
              className="text-base md:text-lg max-w-lg mx-auto"
              style={{ color: "rgba(255,255,255,0.4)", lineHeight: 1.6 }}
            >
              Screenshot or screen-record the animated card below to share on
              your social channels.
            </p>
          </motion.div>

          {/* Format toggle */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            className="flex items-center justify-center gap-3 mb-10"
          >
            {(["square", "story"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFormat(f)}
                className="px-7 py-3 rounded-full text-sm font-bold uppercase tracking-wider transition-all duration-200"
                style={{
                  background:
                    format === f ? "#FF3B3B" : "rgba(255,255,255,0.06)",
                  color: format === f ? "#0a0a0a" : "rgba(255,255,255,0.6)",
                  border:
                    format === f
                      ? "2px solid #FF3B3B"
                      : "2px solid rgba(255,255,255,0.12)",
                  boxShadow:
                    format === f
                      ? "0 0 20px rgba(255,59,59,0.25)"
                      : "none",
                }}
              >
                {f === "square" ? "Square (Feed)" : "Vertical (Story)"}
              </button>
            ))}
          </motion.div>

          {/* Player area */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.6 }}
            className="flex justify-center mb-12"
          >
            {loading && (
              <div
                className="flex items-center justify-center rounded-xl"
                style={{
                  width: format === "story" ? 300 : 400,
                  height: format === "story" ? 533 : 400,
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <div className="flex flex-col items-center gap-4">
                  <div
                    className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
                    style={{ borderColor: "rgba(255,59,59,0.3)", borderTopColor: "transparent" }}
                  />
                  <span
                    className="text-sm"
                    style={{ color: "rgba(255,255,255,0.3)" }}
                  >
                    Loading today&apos;s pick...
                  </span>
                </div>
              </div>
            )}

            {!loading && error && (
              <div
                className="flex items-center justify-center rounded-xl"
                style={{
                  width: 400,
                  height: 300,
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <div className="text-center px-8">
                  <p
                    className="text-base font-medium mb-2"
                    style={{ color: "rgba(255,255,255,0.6)" }}
                  >
                    {error}
                  </p>
                  <p
                    className="text-sm"
                    style={{ color: "rgba(255,255,255,0.3)" }}
                  >
                    Check back soon.
                  </p>
                </div>
              </div>
            )}

            {!loading && !error && parlay && (
              <ParlayPlayer
                legs={videoLegs}
                combinedOdds={parlay.combinedOdds}
                evPercent={parlay.evPercent}
                confidence={parlay.confidence}
                payout={parlay.payout}
                format={format}
                showControls={true}
                maxWidth={format === "story" ? 340 : 500}
              />
            )}
          </motion.div>

          {/* Instructions */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5, duration: 0.5 }}
            className="text-center mb-14"
          >
            <p
              className="text-sm"
              style={{ color: "rgba(255,255,255,0.3)", lineHeight: 1.7 }}
            >
              Tip: Use your device&apos;s screen recorder while the animation
              plays for a video clip, or screenshot any frame for a static image.
            </p>
          </motion.div>

          {/* Action buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.5 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <Link
              href="/parlays"
              className="flex items-center gap-2 px-7 py-3.5 rounded-full text-sm font-semibold transition-all duration-200"
              style={{
                background: "rgba(255,255,255,0.05)",
                color: "rgba(255,255,255,0.8)",
                border: "1px solid rgba(255,255,255,0.1)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(255,255,255,0.08)";
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.2)";
                e.currentTarget.style.color = "#ededed";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "rgba(255,255,255,0.05)";
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)";
                e.currentTarget.style.color = "rgba(255,255,255,0.8)";
              }}
            >
              <ExternalLink size={14} />
              See All Parlays
            </Link>
            <Link
              href="/builder"
              className="flex items-center gap-2 px-7 py-3.5 rounded-full text-sm font-semibold transition-all duration-200"
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
          </motion.div>
        </div>
      </main>

      {/* ─── Footer ─── */}
      <footer
        className="px-6 py-12"
        style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
      >
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
