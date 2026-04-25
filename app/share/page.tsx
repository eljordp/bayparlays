"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowUpRight, Share2, ExternalLink, Download } from "lucide-react";
import { AppNav } from "@/app/components/AppNav";

// Static share-card preview. Pulls today's top parlay from /api/parlays and
// renders the OG image (the same edge-runtime route at /api/og/parlay) inline
// so users can right-click → save, or click the explicit "Download" button.
//
// Replaces the prior Remotion video flow — static PNG cards pattern-break
// dark-mode timelines on Twitter/IG much better than dark animated MP4s,
// and a 1200x630 PNG saves cleanly to camera roll on mobile without any
// screen-recording dance.

interface ApiLeg {
  sport: string;
  game: string;
  pick: string;
  odds: number;
}

interface ApiParlay {
  legs: ApiLeg[];
  combinedOdds: string;
  payout: number;
  evPercent: number;
  confidence: number;
}

function formatOdds(odds: number): string {
  return odds > 0 ? `+${odds}` : `${odds}`;
}

export default function SharePage() {
  const [parlay, setParlay] = useState<ApiParlay | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(
          "/api/parlays?sports=nba,mlb,nhl&legs=3&count=1&sort=confidence",
        );
        if (!res.ok) throw new Error("Failed to load parlay");
        const data = await res.json();
        if (data.parlays?.length > 0) setParlay(data.parlays[0]);
        else throw new Error("No parlay available right now");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const ogParams = parlay
    ? new URLSearchParams({
        legs: JSON.stringify(
          parlay.legs.map((l) => ({
            sport: l.sport,
            pick: l.pick,
            game: l.game,
            odds: formatOdds(l.odds),
          })),
        ),
        combined: parlay.combinedOdds,
        payout: `$${Math.round(parlay.payout)}`,
        ev: parlay.evPercent.toFixed(1),
        confidence: parlay.confidence.toFixed(0),
      })
    : null;

  const ogUrl = ogParams ? `/api/og/parlay?${ogParams.toString()}` : null;
  const absoluteOgUrl = ogParams
    ? `https://bayparlays.vercel.app/api/og/parlay?${ogParams.toString()}`
    : null;

  async function downloadImage() {
    if (!ogUrl) return;
    try {
      const res = await fetch(ogUrl);
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = `bayparlays-share-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(href);
    } catch {
      if (ogUrl) window.open(ogUrl, "_blank");
    }
  }

  return (
    <div className="min-h-screen" style={{ background: "#FAFAF7" }}>
      <AppNav />
      <div className="max-w-3xl mx-auto px-6 pt-32 pb-16">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <div className="flex items-center gap-2 mb-4 text-sm" style={{ color: "rgba(0,0,0,0.5)" }}>
            <Share2 size={14} />
            <span className="uppercase tracking-widest font-semibold">Share Card</span>
          </div>
          <h1
            className="text-4xl md:text-6xl mb-3 leading-[1.05]"
            style={{ fontFamily: "'DM Serif Display', serif", color: "#0a0a0a" }}
          >
            Today&apos;s Top Pick
          </h1>
          <p className="text-base mb-12" style={{ color: "rgba(0,0,0,0.5)", lineHeight: 1.6 }}>
            Static share card optimized for Twitter / IG / iMessage. Save it, post it,
            DM it. Renders identically on every device.
          </p>

          {/* Card preview */}
          {loading && (
            <div
              className="w-full aspect-[1200/630] rounded-2xl flex items-center justify-center"
              style={{ background: "rgba(0,0,0,0.04)" }}
            >
              <span className="text-sm" style={{ color: "rgba(0,0,0,0.4)" }}>
                Generating today&apos;s card…
              </span>
            </div>
          )}

          {error && (
            <div
              className="w-full p-6 rounded-2xl text-sm"
              style={{
                background: "rgba(239,68,68,0.06)",
                border: "1px solid rgba(239,68,68,0.2)",
                color: "#991b1b",
              }}
            >
              {error}
            </div>
          )}

          {ogUrl && !loading && !error && (
            <>
              <div
                className="w-full rounded-2xl overflow-hidden"
                style={{
                  background: "#FFFFFF",
                  border: "1px solid rgba(0,0,0,0.08)",
                  boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
                }}
              >
                {/* Static PNG preview — same image you'd save / post */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={ogUrl}
                  alt="BayParlays share card"
                  width={1200}
                  height={630}
                  style={{ width: "100%", height: "auto", display: "block" }}
                />
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-3 mt-6">
                <button
                  onClick={downloadImage}
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-full text-sm font-semibold transition-colors"
                  style={{
                    background: "#0a0a0a",
                    color: "#ffffff",
                  }}
                >
                  <Download size={16} />
                  Download image
                </button>
                {absoluteOgUrl && (
                  <a
                    href={absoluteOgUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-5 py-3 rounded-full text-sm font-semibold transition-colors"
                    style={{
                      background: "rgba(0,0,0,0.04)",
                      border: "1px solid rgba(0,0,0,0.08)",
                      color: "#0a0a0a",
                    }}
                  >
                    <ExternalLink size={16} />
                    Open card URL
                  </a>
                )}
                <Link
                  href="/parlays"
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-full text-sm font-semibold transition-colors"
                  style={{
                    background: "rgba(0,0,0,0.04)",
                    border: "1px solid rgba(0,0,0,0.08)",
                    color: "#0a0a0a",
                  }}
                >
                  <ArrowUpRight size={16} />
                  See all parlays
                </Link>
              </div>

              <p className="text-xs mt-6" style={{ color: "rgba(0,0,0,0.4)", lineHeight: 1.6 }}>
                Tip: paste the card URL in any social post — Twitter / iMessage /
                Discord / Instagram DMs auto-generate the preview from the link.
              </p>
            </>
          )}
        </motion.div>
      </div>
    </div>
  );
}
