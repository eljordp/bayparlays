"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { AppNav } from "@/app/components/AppNav";
import { ResultsTabs } from "@/app/components/ResultsTabs";

interface WinLeg {
  sport?: string;
  game?: string;
  pick?: string;
  market?: string;
  odds?: number;
  book?: string;
}

interface Win {
  id: string;
  createdAt: string;
  legs: WinLeg[];
  combinedOdds: string;
  confidence: number;
  payoutAtUnit: number;
  profitAtUnit: number;
  evPercent: number;
  sports: string[];
  legsTotal: number;
  category: string | null;
}

interface WinsResp {
  wins: Win[];
  nextCursor: string | null;
  unitStake: number;
}

const SPORTS = ["All", "MLB", "NBA", "NHL", "NFL", "NCAAB", "NCAAF"];

function formatRelative(iso: string): string {
  const t = new Date(iso).getTime();
  const now = Date.now();
  const diffMs = now - t;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return mins <= 1 ? "just now" : `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export default function WinsPage() {
  const [wins, setWins] = useState<Win[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [unitStake, setUnitStake] = useState(10);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [sportFilter, setSportFilter] = useState<string>("All");

  const load = useCallback(
    async (reset: boolean) => {
      if (reset) setLoading(true);
      else setLoadingMore(true);
      try {
        const params = new URLSearchParams({ limit: "30" });
        if (!reset && cursor) params.set("cursor", cursor);
        if (sportFilter !== "All") params.set("sport", sportFilter);
        const res = await fetch(`/api/track/wins?${params.toString()}`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error("fetch failed");
        const data = (await res.json()) as WinsResp;
        setUnitStake(data.unitStake);
        setWins((prev) => (reset ? data.wins : [...prev, ...data.wins]));
        setCursor(data.nextCursor);
        setHasMore(data.nextCursor !== null);
      } catch {
        if (reset) setWins([]);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [cursor, sportFilter],
  );

  // Reset and reload when sport filter changes
  useEffect(() => {
    setCursor(null);
    setHasMore(true);
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sportFilter]);

  return (
    <div className="min-h-screen" style={{ background: "#FAFAF7" }}>
      <AppNav />
      <div className="pt-20">
        <ResultsTabs />
      </div>

      <header className="pt-8 pb-8 px-4 md:pt-14 md:pb-14 md:px-6">
        <div className="max-w-[1400px] mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <h1
              className="text-5xl md:text-7xl font-normal leading-[1.05] mb-5"
              style={{ fontFamily: "'DM Serif Display', serif", color: "#0a0a0a" }}
            >
              Wins
            </h1>
            <p
              className="text-lg md:text-xl max-w-2xl"
              style={{ color: "rgba(0,0,0,0.5)", lineHeight: 1.6 }}
            >
              Every parlay the AI has cashed. Receipts in chronological order.
              Numbers shown at ${unitStake} per bet.
            </p>

            {/* Sport filter */}
            <div className="mt-6 flex flex-wrap gap-2">
              {SPORTS.map((s) => (
                <button
                  key={s}
                  onClick={() => setSportFilter(s)}
                  className="text-xs font-semibold px-4 py-2 rounded-full transition-all"
                  style={{
                    background:
                      sportFilter === s ? "#0a0a0a" : "rgba(0,0,0,0.05)",
                    color: sportFilter === s ? "#fff" : "rgba(0,0,0,0.55)",
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </motion.div>
        </div>
      </header>

      <main className="px-4 pb-20 md:px-6 md:pb-32">
        <div className="max-w-[1400px] mx-auto">
          {loading ? (
            <div
              className="rounded-2xl p-8 text-center"
              style={{ background: "rgba(0,0,0,0.03)", color: "rgba(0,0,0,0.45)" }}
            >
              Loading wins…
            </div>
          ) : wins.length === 0 ? (
            <div
              className="rounded-2xl p-8 text-center"
              style={{ background: "rgba(0,0,0,0.03)", color: "rgba(0,0,0,0.45)" }}
            >
              No wins matching this filter yet.
            </div>
          ) : (
            <>
              <div className="space-y-3">
                {wins.map((w, i) => (
                  <motion.div
                    key={w.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i * 0.02, 0.4) }}
                    className="rounded-xl p-5 border"
                    style={{
                      borderColor: "rgba(0,0,0,0.08)",
                      background: "#fff",
                    }}
                  >
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-2">
                          <span
                            className="text-[10px] uppercase tracking-widest font-bold px-2 py-0.5 rounded-full"
                            style={{ background: "#16a34a", color: "#fff" }}
                          >
                            Won
                          </span>
                          <span
                            className="text-base font-mono font-bold"
                            style={{ color: "#0a0a0a" }}
                          >
                            {w.combinedOdds}
                          </span>
                          <span
                            className="text-xs"
                            style={{ color: "rgba(0,0,0,0.45)" }}
                          >
                            · {w.legsTotal} legs
                          </span>
                          <span
                            className="text-xs"
                            style={{ color: "rgba(0,0,0,0.45)" }}
                          >
                            · {(w.sports || []).join("/") || "—"}
                          </span>
                          <span
                            className="text-xs"
                            style={{ color: "rgba(0,0,0,0.45)" }}
                          >
                            · {formatRelative(w.createdAt)}
                          </span>
                        </div>
                        <div className="space-y-1">
                          {w.legs.map((leg, j) => (
                            <div
                              key={j}
                              className="text-sm flex items-center gap-2 flex-wrap"
                            >
                              <span style={{ color: "#0a0a0a", fontWeight: 600 }}>
                                {leg.pick}
                              </span>
                              {leg.odds !== undefined && (
                                <span
                                  className="font-mono text-xs"
                                  style={{ color: "rgba(0,0,0,0.55)" }}
                                >
                                  ({leg.odds > 0 ? "+" : ""}
                                  {leg.odds})
                                </span>
                              )}
                              {leg.game && (
                                <span
                                  className="text-xs"
                                  style={{ color: "rgba(0,0,0,0.4)" }}
                                >
                                  · {leg.game}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="text-right">
                        <div
                          className="text-[10px] uppercase tracking-widest"
                          style={{ color: "rgba(0,0,0,0.4)" }}
                        >
                          Profit @ ${unitStake}
                        </div>
                        <div
                          className="text-2xl font-mono font-bold mt-1"
                          style={{ color: "#16a34a" }}
                        >
                          +${w.profitAtUnit.toFixed(0)}
                        </div>
                        <div
                          className="text-[10px] mt-1"
                          style={{ color: "rgba(0,0,0,0.45)" }}
                        >
                          conf {w.confidence}%
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>

              {hasMore && (
                <div className="mt-8 flex justify-center">
                  <button
                    onClick={() => load(false)}
                    disabled={loadingMore}
                    className="text-sm font-semibold px-6 py-3 rounded-full transition-all disabled:opacity-50"
                    style={{
                      background: "#0a0a0a",
                      color: "#fff",
                    }}
                  >
                    {loadingMore ? "Loading…" : "Load more wins"}
                  </button>
                </div>
              )}
              {!hasMore && wins.length > 0 && (
                <div
                  className="mt-8 text-center text-xs"
                  style={{ color: "rgba(0,0,0,0.4)" }}
                >
                  That&apos;s every win on record. Refresh as new ones cash.
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
