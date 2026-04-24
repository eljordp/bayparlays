"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowUpRight,
  Share2,
  ExternalLink,
  Copy,
  Check,
  Download,
  Camera,
} from "lucide-react";
import type { PlayerRef } from "@remotion/player";
import { AppNav } from "@/app/components/AppNav";
import { EdgePlayer } from "@/app/components/EdgePlayer";
import type { EdgeLegData } from "@/app/components/EdgeShareVideo";

/* ─── Types matching the API response ─── */

interface ApiLeg {
  sport: string;
  game: string;
  gameId?: string;
  pick: string;
  market: string;
  odds: number;
  book: string;
  impliedProb: number;
  fairProb?: number;
  evVsFair?: number;
  sharpEdge?: boolean;
  reasons?: string[];
}

interface EdgesResponse {
  legs: ApiLeg[];
  meta: {
    sportsScanned: string[];
    gamesAnalyzed: number;
    legsEvaluated: number;
    legsScored: number;
    edgesFound: number;
    generatedAt: string;
  };
}

/* ─── Page ─── */

export default function ShareEdgePage() {
  const [leg, setLeg] = useState<EdgeLegData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [format, setFormat] = useState<"square" | "story">("square");
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const playerRef = useRef<PlayerRef>(null);
  const playerWrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function fetchTopEdge() {
      try {
        const res = await fetch(
          "/api/parlays?sports=nba,mlb,nhl,ncaab&format=legs&count=1&tier=admin",
          { cache: "no-store" },
        );
        if (!res.ok) throw new Error("Failed to fetch");
        const data: EdgesResponse = await res.json();
        if (data.legs && data.legs.length > 0) {
          const top = data.legs[0];
          setLeg({
            sport: top.sport,
            game: top.game,
            pick: top.pick,
            market: top.market,
            odds: top.odds,
            book: top.book,
            impliedProb: top.impliedProb,
            fairProb: top.fairProb,
            evVsFair: top.evVsFair,
            sharpEdge: top.sharpEdge,
            reasons: top.reasons,
          });
        } else {
          setError("No sharp edges available right now.");
        }
      } catch {
        setError("Unable to load edge data.");
      } finally {
        setLoading(false);
      }
    }
    fetchTopEdge();
  }, []);

  async function handleCopyLink() {
    try {
      const url =
        typeof window !== "undefined"
          ? window.location.origin + "/share/edge"
          : "https://bayparlays.vercel.app/share/edge";
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* noop */
    }
  }

  async function handleDownloadImage() {
    if (!playerWrapperRef.current || !leg) return;
    setDownloading(true);
    try {
      // Freeze the animation at frame ~90 so all elements (including stats +
      // CTA) have faded in before we snapshot. Without pausing the player
      // could capture an in-flight frame with half-visible text.
      if (playerRef.current) {
        playerRef.current.pauseAndReturnToPlayStart?.();
        playerRef.current.seekTo(90);
        playerRef.current.pause();
        // Give the DOM one paint to settle on the new frame.
        await new Promise((r) => setTimeout(r, 120));
      }
      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(playerWrapperRef.current, {
        pixelRatio: 2, // 2x for crisp IG rendering
        cacheBust: true,
        backgroundColor: "#0a0a0a",
      });
      const a = document.createElement("a");
      const safeSport = (leg.sport || "edge").toLowerCase();
      const safePick = leg.pick
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .slice(0, 40);
      a.download = `bayparlays-${safeSport}-${safePick}-${format}.png`;
      a.href = dataUrl;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      console.error("PNG export failed:", err);
      alert(
        "Couldn't generate the image. Try screenshotting the card instead.",
      );
    } finally {
      // Restart the animation
      if (playerRef.current) {
        playerRef.current.seekTo(0);
        playerRef.current.play();
      }
      setDownloading(false);
    }
  }

  return (
    <div className="min-h-screen" style={{ background: "#0a0a0a" }}>
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
              <Share2 size={16} style={{ color: "#FF3B3B" }} />
              <span
                className="text-xs font-medium tracking-widest uppercase"
                style={{ color: "#FF3B3B" }}
              >
                Sharp Edge Share Card
              </span>
            </div>
            <h1
              className="text-4xl md:text-6xl font-normal leading-[1.1] mb-5"
              style={{
                fontFamily: "'DM Serif Display', serif",
                color: "#ededed",
              }}
            >
              Share Today&apos;s Sharpest Edge
            </h1>
            <p
              className="text-base md:text-lg max-w-lg mx-auto"
              style={{ color: "rgba(255,255,255,0.4)", lineHeight: 1.6 }}
            >
              A single-leg pick where the book is slow. Screenshot or
              screen-record the card to share on your socials.
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
            className="flex justify-center mb-10"
          >
            {loading && (
              <div
                className="flex items-center justify-center rounded-xl"
                style={{
                  width: format === "story" ? 320 : 480,
                  height: format === "story" ? 568 : 480,
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <div className="flex flex-col items-center gap-4">
                  <div
                    className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
                    style={{
                      borderColor: "rgba(255,59,59,0.3)",
                      borderTopColor: "transparent",
                    }}
                  />
                  <span
                    className="text-sm"
                    style={{ color: "rgba(255,255,255,0.3)" }}
                  >
                    Finding the sharpest edge...
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
                    Check back soon — lines move all day.
                  </p>
                </div>
              </div>
            )}

            {!loading && !error && leg && (
              <div ref={playerWrapperRef}>
                <EdgePlayer
                  ref={playerRef}
                  leg={leg}
                  format={format}
                  showControls={true}
                  maxWidth={format === "story" ? 360 : 520}
                />
              </div>
            )}
          </motion.div>

          {/* Instagram helper */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5, duration: 0.5 }}
            className="text-center mb-10"
          >
            <div
              className="inline-flex items-center gap-3 px-5 py-3 rounded-full"
              style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <Camera size={14} style={{ color: "rgba(255,255,255,0.5)" }} />
              <span
                className="text-xs"
                style={{ color: "rgba(255,255,255,0.55)", lineHeight: 1.6 }}
              >
                Share on Instagram: screen-record while it plays, or
                screenshot a frame — paste into your IG Story or Feed.
              </span>
            </div>
          </motion.div>

          {/* Action buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.5 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12"
          >
            <button
              onClick={handleCopyLink}
              className="flex items-center gap-2 px-7 py-3.5 rounded-full text-sm font-semibold transition-all duration-200"
              style={{
                background: "rgba(255,255,255,0.05)",
                color: copied ? "#22c55e" : "rgba(255,255,255,0.8)",
                border: copied
                  ? "1px solid rgba(34,197,94,0.3)"
                  : "1px solid rgba(255,255,255,0.1)",
              }}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? "Link copied" : "Copy shareable link"}
            </button>

            <button
              onClick={handleDownloadImage}
              disabled={downloading || !leg || loading}
              className="flex items-center gap-2 px-7 py-3.5 rounded-full text-sm font-semibold transition-all duration-200 disabled:opacity-50"
              style={{
                background: "rgba(255,255,255,0.05)",
                color: "rgba(255,255,255,0.8)",
                border: "1px solid rgba(255,255,255,0.1)",
              }}
            >
              <Download size={14} />
              {downloading ? "Rendering…" : "Download image"}
            </button>

            <Link
              href="/edges"
              className="flex items-center gap-2 px-7 py-3.5 rounded-full text-sm font-semibold transition-all duration-200"
              style={{ background: "#FF3B3B", color: "#0a0a0a" }}
            >
              See All Edges
              <ArrowUpRight size={14} strokeWidth={2.5} />
            </Link>
          </motion.div>

          {/* Secondary link row */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7, duration: 0.5 }}
            className="flex items-center justify-center gap-6 text-xs"
          >
            <Link
              href="/share"
              className="flex items-center gap-1.5 transition-colors"
              style={{ color: "rgba(255,255,255,0.4)" }}
            >
              <ExternalLink size={12} />
              Share a parlay instead
            </Link>
            <span style={{ color: "rgba(255,255,255,0.15)" }}>·</span>
            <Link
              href="/builder"
              className="flex items-center gap-1.5 transition-colors"
              style={{ color: "rgba(255,255,255,0.4)" }}
            >
              Build your own
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
