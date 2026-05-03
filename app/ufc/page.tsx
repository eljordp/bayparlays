"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Flame, Sparkles } from "lucide-react";
import { AppNav } from "@/app/components/AppNav";

interface UfcPick {
  gameId: string;
  commenceTime: string;
  fighter1: string;
  fighter2: string;
  pick: string;
  pickOdds: number;
  bookForPick: string;
  confidence: number;
  ourProb: number;
  impliedProb: number;
  edge: number;
  evPercent: number;
  reason: string;
  decimalOdds: number;
}

interface PicksResp {
  picks: UfcPick[];
  cachedAt: string;
  fromCache: boolean;
}

function formatOdds(odds: number): string {
  return odds > 0 ? `+${odds}` : `${odds}`;
}

function formatGameTime(iso: string): string {
  const t = new Date(iso);
  const now = Date.now();
  const diff = t.getTime() - now;
  const day = 24 * 60 * 60 * 1000;
  const fmt = t.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).toLowerCase().replace(" ", "");
  if (diff < 0) return "Started";
  if (diff < day) return `Tonight ${fmt}`;
  if (diff < 2 * day) return `Tomorrow ${fmt}`;
  const wd = t.toLocaleDateString("en-US", { weekday: "short" });
  return `${wd} ${fmt}`;
}

function evColor(ev: number): string {
  if (ev >= 10) return "#16a34a";
  if (ev > 0) return "#65a30d";
  if (ev > -5) return "rgba(0,0,0,0.5)";
  return "#dc2626";
}

function confidenceLabel(c: number): { label: string; color: string } {
  if (c >= 70) return { label: "STRONG", color: "#16a34a" };
  if (c >= 55) return { label: "EDGE", color: "#65a30d" };
  if (c >= 45) return { label: "LEAN", color: "#0a0a0a" };
  return { label: "PASS", color: "#dc2626" };
}

export default function UfcPage() {
  const [data, setData] = useState<PicksResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function fetchPicks(force = false) {
    if (force) setRefreshing(true);
    try {
      const res = await fetch(`/api/ufc/picks${force ? "?nocache=1" : ""}`, {
        cache: "no-store",
      });
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    fetchPicks();
  }, []);

  const picks = data?.picks ?? [];
  // Group by date (mainly distinguishes prelims vs main card if events span)
  const byDate = new Map<string, UfcPick[]>();
  for (const p of picks) {
    const k = new Date(p.commenceTime).toISOString().slice(0, 10);
    const arr = byDate.get(k) ?? [];
    arr.push(p);
    byDate.set(k, arr);
  }
  const dates = Array.from(byDate.keys()).sort();

  return (
    <div className="min-h-screen" style={{ background: "#FAFAF7" }}>
      <AppNav />
      <header className="pt-24 pb-6 px-4 md:pt-32 md:pb-12 md:px-6">
        <div className="max-w-[1100px] mx-auto">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <div className="flex items-center gap-3 mb-4">
              <Flame size={20} style={{ color: "#FF3B3B" }} />
              <span
                className="text-xs font-bold tracking-widest uppercase"
                style={{ color: "#FF3B3B" }}
              >
                LLM Picks · Powered by Gemini
              </span>
            </div>
            <h1
              className="text-4xl sm:text-5xl md:text-7xl font-normal leading-[1.05] mb-4"
              style={{ fontFamily: "'DM Serif Display', serif", color: "#0a0a0a" }}
            >
              UFC Fight Card
            </h1>
            <p className="text-base md:text-lg max-w-2xl" style={{ color: "rgba(0,0,0,0.5)" }}>
              The statistical model can&apos;t price fighter sports — too few samples per fighter. Gemini reads each matchup directly using its training-cutoff knowledge of every active fighter&apos;s style, recent form, layoff, and historical edges. {picks.length > 0 ? `${picks.length} fights scored, sorted by edge.` : ""}
            </p>
            <div className="mt-4 flex items-center gap-3 flex-wrap">
              <button
                onClick={() => fetchPicks(true)}
                disabled={refreshing || loading}
                className="text-xs font-semibold px-4 py-2 rounded-full transition-all disabled:opacity-50"
                style={{ background: "rgba(0,0,0,0.08)", color: "#0a0a0a", border: "1px solid rgba(0,0,0,0.25)" }}
              >
                {refreshing ? "Re-scoring (30s)…" : "Refresh"}
              </button>
              {data?.cachedAt && (
                <span className="text-[10px] uppercase tracking-widest" style={{ color: "rgba(0,0,0,0.4)" }}>
                  scored {new Date(data.cachedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                </span>
              )}
            </div>
          </motion.div>
        </div>
      </header>

      <main className="px-4 pb-20 md:px-6 md:pb-32">
        <div className="max-w-[1100px] mx-auto">
          {loading ? (
            <div className="rounded-2xl p-8 text-center" style={{ background: "rgba(0,0,0,0.03)", color: "rgba(0,0,0,0.45)" }}>
              Asking Gemini about the card… (this takes ~30 sec on first load)
            </div>
          ) : picks.length === 0 ? (
            <div className="rounded-2xl p-8 text-center" style={{ background: "rgba(0,0,0,0.03)", color: "rgba(0,0,0,0.45)" }}>
              No upcoming UFC fights in the next 7 days.
            </div>
          ) : (
            <div className="space-y-10">
              {dates.map((date) => (
                <section key={date}>
                  <h2
                    className="text-xl md:text-2xl font-normal mb-3"
                    style={{ fontFamily: "'DM Serif Display', serif" }}
                  >
                    {new Date(date + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
                  </h2>
                  <div className="space-y-3">
                    {byDate.get(date)!.map((p) => {
                      const conf = confidenceLabel(p.confidence);
                      const isPick1 = p.pick === p.fighter1;
                      return (
                        <div
                          key={p.gameId}
                          className="rounded-xl border overflow-hidden"
                          style={{ background: "#fff", borderColor: "rgba(0,0,0,0.08)" }}
                        >
                          {/* Top: matchup + game time */}
                          <div className="px-5 py-3 flex items-center justify-between flex-wrap gap-2"
                            style={{ background: "rgba(0,0,0,0.02)", borderBottom: "1px solid rgba(0,0,0,0.05)" }}
                          >
                            <span className="text-xs uppercase tracking-widest" style={{ color: "rgba(0,0,0,0.5)" }}>
                              {formatGameTime(p.commenceTime)}
                            </span>
                            <span
                              className="text-[10px] uppercase tracking-widest font-bold px-2 py-0.5 rounded-full"
                              style={{ background: `${conf.color}15`, color: conf.color, boxShadow: `inset 0 0 0 1px ${conf.color}30` }}
                            >
                              {conf.label}
                            </span>
                          </div>

                          {/* Matchup row */}
                          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-3 px-5 py-5 items-center">
                            {/* Fighter 1 */}
                            <div className="flex items-center justify-between md:justify-start gap-3">
                              <div>
                                <div className="text-base sm:text-lg font-bold" style={{ color: isPick1 ? "#0a0a0a" : "rgba(0,0,0,0.55)" }}>
                                  {p.fighter1}
                                  {isPick1 && (
                                    <Sparkles size={14} style={{ color: "#FF3B3B", display: "inline-block", marginLeft: 6, verticalAlign: "middle" }} />
                                  )}
                                </div>
                                <div className="text-xs font-mono mt-0.5" style={{ color: "rgba(0,0,0,0.5)" }}>
                                  {formatOdds(p.fighter1 === p.pick ? p.pickOdds : p.fighter2 === p.pick ? -10000 + p.pickOdds : 0)}
                                </div>
                              </div>
                            </div>

                            <div className="text-center text-xs uppercase tracking-widest" style={{ color: "rgba(0,0,0,0.35)" }}>vs</div>

                            {/* Fighter 2 */}
                            <div className="flex items-center justify-between md:justify-end gap-3">
                              <div className="md:text-right">
                                <div className="text-base sm:text-lg font-bold" style={{ color: !isPick1 ? "#0a0a0a" : "rgba(0,0,0,0.55)" }}>
                                  {!isPick1 && (
                                    <Sparkles size={14} style={{ color: "#FF3B3B", display: "inline-block", marginRight: 6, verticalAlign: "middle" }} />
                                  )}
                                  {p.fighter2}
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Pick + reason */}
                          <div className="px-5 py-4" style={{ borderTop: "1px solid rgba(0,0,0,0.05)" }}>
                            <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
                              <div>
                                <div className="text-[10px] uppercase tracking-widest" style={{ color: "rgba(0,0,0,0.4)" }}>
                                  Gemini&apos;s Pick
                                </div>
                                <div className="text-base font-bold" style={{ color: "#0a0a0a" }}>
                                  {p.pick}{" "}
                                  <span className="font-mono text-sm" style={{ color: "rgba(0,0,0,0.6)" }}>
                                    ({formatOdds(p.pickOdds)} · {p.bookForPick})
                                  </span>
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="flex items-center gap-3 flex-wrap justify-end">
                                  <div>
                                    <div className="text-[10px] uppercase tracking-widest" style={{ color: "rgba(0,0,0,0.4)" }}>
                                      Conf
                                    </div>
                                    <div className="text-lg font-mono font-bold">{p.confidence}%</div>
                                  </div>
                                  <div>
                                    <div className="text-[10px] uppercase tracking-widest" style={{ color: "rgba(0,0,0,0.4)" }}>
                                      EV @ $10
                                    </div>
                                    <div
                                      className="text-lg font-mono font-bold"
                                      style={{ color: evColor(p.evPercent) }}
                                    >
                                      {p.evPercent >= 0 ? "+" : ""}
                                      ${(p.evPercent / 10).toFixed(1)}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                            <p className="text-sm mt-2" style={{ color: "rgba(0,0,0,0.7)", lineHeight: 1.5 }}>
                              {p.reason}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}

              <p className="text-xs" style={{ color: "rgba(0,0,0,0.4)", lineHeight: 1.6 }}>
                Picks generated by Gemini 2.5 Flash. Confidence is the model&apos;s win-probability estimate; EV is calculated against the best book&apos;s American odds at fetch time. Gamble responsibly.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
