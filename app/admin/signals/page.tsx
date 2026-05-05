"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/app/components/AuthProvider";
import { ArrowLeft, Shield, RefreshCw, Eye } from "lucide-react";

interface SignalRow {
  source: "actionnetwork" | "pinnacle";
  ml_home: number | null;
  ml_away: number | null;
  total_line: number | null;
  public_pct_home: number | null;
  public_pct_away: number | null;
  money_pct_home: number | null;
  money_pct_away: number | null;
  pinnacle_max_stake: number | null;
}

interface GameBundle {
  home_team: string;
  away_team: string;
  sport: string;
  commence_time: string | null;
  actionnetwork: SignalRow | null;
  pinnacle: SignalRow | null;
}

interface SignalsData {
  games: GameBundle[];
  total_games: number;
  last_capture: string | null;
  message?: string;
}

function fmtOdds(n: number | null): string {
  if (n === null) return "—";
  return n > 0 ? `+${n}` : String(n);
}

function fmtPct(n: number | null): string {
  if (n === null) return "—";
  return `${n.toFixed(0)}%`;
}

function divergenceTone(publicPct: number | null, moneyPct: number | null): {
  label: string;
  color: string;
} {
  if (publicPct === null || moneyPct === null) {
    return { label: "—", color: "rgba(255,255,255,0.3)" };
  }
  const diff = moneyPct - publicPct;
  // Positive divergence = money is on this side MORE than public is = sharp side
  if (diff >= 15) return { label: "SHARP", color: "#22c55e" };
  if (diff >= 8) return { label: "lean sharp", color: "#a3e635" };
  if (diff <= -15) return { label: "SQUARE", color: "#ef4444" };
  if (diff <= -8) return { label: "lean square", color: "#f59e0b" };
  return { label: "neutral", color: "rgba(255,255,255,0.5)" };
}

export default function SignalsAdminPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const [data, setData] = useState<SignalsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshResult, setRefreshResult] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/signals", { cache: "no-store" });
      const json = (await res.json()) as SignalsData;
      setData(json);
    } catch {
      // swallow
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!isAdmin) return;
    load();
  }, [isAdmin]);

  async function refresh() {
    setRefreshing(true);
    setRefreshResult(null);
    try {
      const res = await fetch("/api/cron/fetch-signals", { cache: "no-store" });
      const json = await res.json();
      if (json.error) {
        setRefreshResult(`Error: ${json.error}`);
      } else {
        setRefreshResult(
          `Captured ${json.inserted ?? 0} signals · AN ${json.actionnetwork?.fetched ?? 0} · Pinnacle ${json.pinnacle?.fetched ?? 0}`,
        );
        await load();
      }
    } catch (e) {
      setRefreshResult(`Error: ${e instanceof Error ? e.message : "fetch failed"}`);
    } finally {
      setRefreshing(false);
    }
  }

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#0a0a0a" }}>
        <div
          className="w-8 h-8 rounded-full border-2 animate-spin"
          style={{ borderColor: "rgba(255,59,59,0.2)", borderTopColor: "#FF3B3B" }}
        />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6" style={{ background: "#0a0a0a" }}>
        <div
          className="w-20 h-20 rounded-2xl flex items-center justify-center"
          style={{ background: "rgba(255,59,59,0.08)", border: "1px solid rgba(255,59,59,0.15)" }}
        >
          <Shield size={32} style={{ color: "#FF3B3B" }} />
        </div>
        <h1 className="text-2xl font-semibold" style={{ color: "#ededed" }}>
          Access Denied
        </h1>
        <Link
          href="/login"
          className="px-6 py-3 rounded-full text-sm font-semibold"
          style={{ background: "#FF3B3B", color: "#0a0a0a" }}
        >
          Sign In
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: "#0a0a0a", color: "#ededed" }}>
      <div className="max-w-[1400px] mx-auto px-6 py-10">
        <Link
          href="/admin"
          className="inline-flex items-center gap-2 text-sm mb-8"
          style={{ color: "rgba(255,255,255,0.5)" }}
        >
          <ArrowLeft size={14} /> Back to Admin
        </Link>

        <div className="flex items-center gap-3 mb-3">
          <Eye size={28} style={{ color: "#FF3B3B" }} />
          <h1
            className="text-4xl md:text-5xl"
            style={{ fontFamily: "'DM Serif Display', serif" }}
          >
            Betting Signals
          </h1>
        </div>
        <p className="text-sm mb-3 max-w-3xl" style={{ color: "rgba(255,255,255,0.55)", lineHeight: 1.6 }}>
          Free public sources we mirror beyond the Odds API. Action Network gives us multi-book
          consensus + crowd-vs-money split per game (the headline signal — when public bets one
          way but money flows the other, sharps are on the money side). Pinnacle gives us the
          sharpest book&apos;s line as a benchmark — the de facto &quot;true&quot; price most paid
          handicappers use.
        </p>
        <p className="text-xs mb-8 max-w-3xl" style={{ color: "rgba(255,255,255,0.45)", lineHeight: 1.6 }}>
          <strong style={{ color: "rgba(255,255,255,0.6)" }}>Verdict column</strong> compares public
          % to money % on the home side. Money on the home side &gt; public on the home side by 15+
          points = SHARP money on home. Reverse direction = SQUARE money on home (= sharp on away).
        </p>

        <div className="flex items-center gap-3 flex-wrap mb-8">
          <button
            onClick={refresh}
            disabled={refreshing}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-semibold transition-all disabled:opacity-50"
            style={{ background: "#FF3B3B", color: "#0a0a0a" }}
          >
            <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
            {refreshing ? "Refreshing…" : "Refresh Now"}
          </button>
          {data?.last_capture && (
            <span className="text-xs uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.4)" }}>
              Last capture · {new Date(data.last_capture).toLocaleString()}
            </span>
          )}
          {refreshResult && (
            <span className="text-xs" style={{ color: "rgba(255,255,255,0.7)" }}>
              {refreshResult}
            </span>
          )}
        </div>

        {loading && (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="h-20 rounded-lg animate-pulse"
                style={{ background: "rgba(255,255,255,0.04)" }}
              />
            ))}
          </div>
        )}

        {!loading && data?.message && data.games.length === 0 && (
          <div
            className="rounded-xl p-10 text-center"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            <p className="text-sm" style={{ color: "rgba(255,255,255,0.55)" }}>
              {data.message}
            </p>
          </div>
        )}

        {!loading && data && data.games.length > 0 && (
          <div className="space-y-3">
            {data.games.map((g, idx) => {
              const an = g.actionnetwork;
              const p = g.pinnacle;
              const verdict = an
                ? divergenceTone(an.public_pct_home, an.money_pct_home)
                : { label: "—", color: "rgba(255,255,255,0.3)" };
              return (
                <div
                  key={idx}
                  className="rounded-xl p-5"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  <div className="flex items-baseline justify-between mb-4 flex-wrap gap-2">
                    <div>
                      <div className="text-base font-semibold" style={{ color: "#ededed" }}>
                        {g.away_team} @ {g.home_team}
                      </div>
                      <div className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>
                        {g.sport}
                        {g.commence_time && ` · ${new Date(g.commence_time).toLocaleString()}`}
                      </div>
                    </div>
                    <span
                      className="text-[11px] uppercase tracking-widest font-bold px-3 py-1 rounded-full"
                      style={{ color: verdict.color, border: `1px solid ${verdict.color}` }}
                    >
                      {verdict.label}
                    </span>
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    {/* Action Network panel */}
                    <div
                      className="rounded-lg p-4"
                      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
                    >
                      <div className="text-[10px] uppercase tracking-widest mb-3" style={{ color: "rgba(255,255,255,0.4)" }}>
                        Action Network · public/money
                      </div>
                      {an ? (
                        <div className="space-y-2">
                          <div className="grid grid-cols-3 text-xs gap-2" style={{ fontFamily: "var(--font-geist-mono)" }}>
                            <div style={{ color: "rgba(255,255,255,0.45)" }}>Side</div>
                            <div className="text-right" style={{ color: "rgba(255,255,255,0.45)" }}>Public</div>
                            <div className="text-right" style={{ color: "rgba(255,255,255,0.45)" }}>Money</div>
                          </div>
                          <div className="grid grid-cols-3 text-sm gap-2" style={{ fontFamily: "var(--font-geist-mono)" }}>
                            <div style={{ color: "rgba(255,255,255,0.7)" }}>
                              {an.ml_home !== null ? `Home ${fmtOdds(an.ml_home)}` : "Home"}
                            </div>
                            <div className="text-right" style={{ color: "rgba(255,255,255,0.6)" }}>
                              {fmtPct(an.public_pct_home)}
                            </div>
                            <div className="text-right" style={{ color: "rgba(255,255,255,0.85)", fontWeight: 600 }}>
                              {fmtPct(an.money_pct_home)}
                            </div>
                          </div>
                          <div className="grid grid-cols-3 text-sm gap-2" style={{ fontFamily: "var(--font-geist-mono)" }}>
                            <div style={{ color: "rgba(255,255,255,0.7)" }}>
                              {an.ml_away !== null ? `Away ${fmtOdds(an.ml_away)}` : "Away"}
                            </div>
                            <div className="text-right" style={{ color: "rgba(255,255,255,0.6)" }}>
                              {fmtPct(an.public_pct_away)}
                            </div>
                            <div className="text-right" style={{ color: "rgba(255,255,255,0.85)", fontWeight: 600 }}>
                              {fmtPct(an.money_pct_away)}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>No AN data yet</div>
                      )}
                    </div>

                    {/* Pinnacle panel */}
                    <div
                      className="rounded-lg p-4"
                      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
                    >
                      <div className="text-[10px] uppercase tracking-widest mb-3" style={{ color: "rgba(255,255,255,0.4)" }}>
                        Pinnacle · sharp benchmark
                      </div>
                      {p ? (
                        <div className="space-y-2 text-sm" style={{ fontFamily: "var(--font-geist-mono)" }}>
                          <div className="flex justify-between">
                            <span style={{ color: "rgba(255,255,255,0.7)" }}>Home ML</span>
                            <span style={{ color: "#ededed", fontWeight: 600 }}>{fmtOdds(p.ml_home)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span style={{ color: "rgba(255,255,255,0.7)" }}>Away ML</span>
                            <span style={{ color: "#ededed", fontWeight: 600 }}>{fmtOdds(p.ml_away)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span style={{ color: "rgba(255,255,255,0.7)" }}>Total</span>
                            <span style={{ color: "#ededed", fontWeight: 600 }}>
                              {p.total_line !== null ? p.total_line.toFixed(1) : "—"}
                            </span>
                          </div>
                          {p.pinnacle_max_stake !== null && (
                            <div className="flex justify-between text-xs pt-2" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                              <span style={{ color: "rgba(255,255,255,0.45)" }}>Max stake</span>
                              <span style={{ color: "rgba(255,255,255,0.65)" }}>${p.pinnacle_max_stake.toLocaleString()}</span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>No Pinnacle data yet</div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
