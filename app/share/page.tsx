"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowUpRight, Share2, ExternalLink, Download } from "lucide-react";
import type { PlayerRef } from "@remotion/player";
import { AppNav } from "@/app/components/AppNav";
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
  const [format, setFormat] = useState<"square" | "story">("square");
  const [downloading, setDownloading] = useState(false);
  const playerRef = useRef<PlayerRef>(null);
  const playerWrapperRef = useRef<HTMLDivElement>(null);

  async function handleDownloadImage() {
    if (!playerWrapperRef.current || !parlay) return;
    setDownloading(true);
    try {
      // Seek to a late frame so all elements (legs, odds, stats) have
      // finished their fade-in before we capture. ParlayVideo runs 180
      // frames at 30fps = 6s total; frame 140 is a safe "everything visible".
      if (playerRef.current) {
        playerRef.current.pause();
        playerRef.current.seekTo(140);
        await new Promise((r) => setTimeout(r, 150));
      }
      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(playerWrapperRef.current, {
        pixelRatio: 2,
        cacheBust: true,
        backgroundColor: "#0a0a0a",
      });
      const a = document.createElement("a");
      a.download = `bayparlays-parlay-${parlay.combinedOdds}-${format}.png`;
      a.href = dataUrl;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      console.error("PNG export failed:", err);
      alert("Couldn't generate the image. Try screenshotting the card instead.");
    } finally {
      if (playerRef.current) {
        playerRef.current.seekTo(0);
        playerRef.current.play();
      }
      setDownloading(false);
    }
  }

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
    <div className="min-h-screen" style={{ background: "#FAFAF7" }}>
      <AppNav />

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
              <Share2 size={16} style={{ color: "#0a0a0a" }} />
              <span
                className="text-xs font-medium tracking-widest uppercase"
                style={{ color: "#0a0a0a" }}
              >
                Share Card
              </span>
            </div>
            <h1
              className="text-4xl md:text-6xl font-normal leading-[1.1] mb-5"
              style={{
                fontFamily: "'DM Serif Display', serif",
                color: "#0a0a0a",
              }}
            >
              Share Today&apos;s Top Pick
            </h1>
            <p
              className="text-base md:text-lg max-w-lg mx-auto"
              style={{ color: "rgba(0,0,0,0.45)", lineHeight: 1.6 }}
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
                    format === f ? "#0a0a0a" : "rgba(0,0,0,0.06)",
                  color: format === f ? "#FAFAF7" : "rgba(0,0,0,0.6)",
                  border:
                    format === f
                      ? "2px solid #0a0a0a"
                      : "2px solid rgba(0,0,0,0.12)",
                  boxShadow:
                    format === f
                      ? "0 0 20px rgba(0,0,0,0.18)"
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
                  background: "rgba(0,0,0,0.03)",
                  border: "1px solid rgba(0,0,0,0.06)",
                }}
              >
                <div className="flex flex-col items-center gap-4">
                  <div
                    className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
                    style={{ borderColor: "rgba(0,0,0,0.25)", borderTopColor: "transparent" }}
                  />
                  <span
                    className="text-sm"
                    style={{ color: "rgba(0,0,0,0.4)" }}
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
                  background: "rgba(0,0,0,0.03)",
                  border: "1px solid rgba(0,0,0,0.06)",
                }}
              >
                <div className="text-center px-8">
                  <p
                    className="text-base font-medium mb-2"
                    style={{ color: "rgba(0,0,0,0.6)" }}
                  >
                    {error}
                  </p>
                  <p
                    className="text-sm"
                    style={{ color: "rgba(0,0,0,0.4)" }}
                  >
                    Check back soon.
                  </p>
                </div>
              </div>
            )}

            {!loading && !error && parlay && (
              <div ref={playerWrapperRef}>
                <ParlayPlayer
                  ref={playerRef}
                  legs={videoLegs}
                  combinedOdds={parlay.combinedOdds}
                  evPercent={parlay.evPercent}
                  confidence={parlay.confidence}
                  payout={parlay.payout}
                  format={format}
                  showControls={true}
                  maxWidth={format === "story" ? 340 : 500}
                />
              </div>
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
              style={{ color: "rgba(0,0,0,0.4)", lineHeight: 1.7 }}
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
            <button
              onClick={handleDownloadImage}
              disabled={downloading || !parlay || loading}
              className="flex items-center gap-2 px-7 py-3.5 rounded-full text-sm font-semibold transition-all duration-200 disabled:opacity-50"
              style={{
                background: "rgba(0,0,0,0.06)",
                color: "rgba(0,0,0,0.85)",
                border: "1px solid rgba(0,0,0,0.1)",
              }}
            >
              <Download size={14} />
              {downloading ? "Rendering…" : "Download image"}
            </button>

            <Link
              href="/parlays"
              className="flex items-center gap-2 px-7 py-3.5 rounded-full text-sm font-semibold transition-all duration-200"
              style={{
                background: "rgba(0,0,0,0.06)",
                color: "rgba(0,0,0,0.85)",
                border: "1px solid rgba(0,0,0,0.1)",
              }}
            >
              <ExternalLink size={14} />
              See All Parlays
            </Link>
            <Link
              href="/builder"
              className="flex items-center gap-2 px-7 py-3.5 rounded-full text-sm font-semibold transition-all duration-200"
              style={{ background: "#0a0a0a", color: "#FAFAF7" }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "#1a1a1a";
                e.currentTarget.style.transform = "translateY(-1px)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "#0a0a0a";
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
        style={{ borderTop: "1px solid rgba(0,0,0,0.06)" }}
      >
        <div className="max-w-[1400px] mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm" style={{ color: "rgba(0,0,0,0.4)" }}>
            BayParlays. AI-powered parlay optimization.
          </p>
          <p className="text-xs" style={{ color: "rgba(0,0,0,0.25)" }}>
            Not financial advice. Gamble responsibly.
          </p>
        </div>
      </footer>
    </div>
  );
}
