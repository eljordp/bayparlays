"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { AppNav } from "@/app/components/AppNav";
import { PicksTabs } from "@/app/components/PicksTabs";
import { TrendingUp, Target, Zap, Clock, BarChart3, DollarSign } from "lucide-react";

interface Stats {
  total: number;
  won: number;
  lost: number;
  pending: number;
  winRate: number;
  totalProfit: number;
  roi: number;
  avgClv: number | null;
  clvSample: number;
  resolved: number;
  smallSample: boolean;
}

interface Recent {
  id: string;
  createdAt: string;
  sport: string;
  game: string;
  market: string;
  pick: string;
  odds: number;
  book: string;
  evVsFair: number | null;
  fairProb: number | null;
  impliedProb: number;
  status: string;
  profit: number;
  clvPercent: number | null;
  closingOdds: number | null;
}

interface BySport {
  sport: string;
  won: number;
  lost: number;
  winRate: number;
  profit: number;
}

interface Data {
  stats: Stats | null;
  bySport: BySport[];
  recent: Recent[];
  migrationPending?: boolean;
  error?: string;
  details?: string;
}

function fmtMoney(n: number): string {
  const abs = Math.abs(n);
  const v = abs >= 1000 ? `${(abs / 1000).toFixed(1)}K` : abs.toFixed(0);
  return n >= 0 ? `+$${v}` : `-$${v}`;
}

function fmtPct(n: number): string {
  return `${n > 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function fmtOdds(n: number): string {
  return n > 0 ? `+${n}` : `${n}`;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function EdgesHistoryPage() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/track/edges-results", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: Data) => setData(d))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen" style={{ background: "#0a0a0a", color: "#ededed" }}>
      <AppNav />
      <div className="pt-20">
        <PicksTabs />
      </div>

      <section className="border-b" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
        <div className="max-w-[1400px] mx-auto px-6 py-10 md:py-14">
          <div className="flex items-center gap-3 mb-3">
            <Link
              href="/edges"
              className="text-xs uppercase tracking-wider hover:opacity-80"
              style={{ color: "rgba(255,255,255,0.4)" }}
            >
              ← Sharp Edges
            </Link>
          </div>
          <h1
            className="text-4xl md:text-5xl leading-none mb-3"
            style={{ fontFamily: "'DM Serif Display', serif" }}
          >
            Edge Track Record
          </h1>
          <p className="text-sm md:text-base max-w-3xl" style={{ color: "rgba(255,255,255,0.55)" }}>
            Every sharp-edge single-leg pick the model has flagged, graded on game result. No cherry-picking, no hidden losses. If this number is positive over a real sample, the model has edge. If not, it doesn&apos;t.
          </p>
        </div>
      </section>

      <main className="max-w-[1400px] mx-auto px-6 py-10 md:py-14 space-y-12">
        {loading && (
          <div className="text-sm" style={{ color: "rgba(255,255,255,0.4)" }}>
            Loading track record…
          </div>
        )}

        {!loading && data?.migrationPending && (
          <div className="rounded-lg p-6" style={{ background: "rgba(234,179,8,0.08)", border: "1px solid rgba(234,179,8,0.25)" }}>
            <div className="text-sm font-semibold mb-2" style={{ color: "#eab308" }}>
              Setup pending
            </div>
            <div className="text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.6)" }}>
              The edge archive requires a one-time database migration to store graded picks. Run <code style={{ fontFamily: "var(--font-geist-mono)", background: "rgba(255,255,255,0.05)", padding: "1px 6px", borderRadius: 3 }}>supabase/migrations/013_edge_picks.sql</code> in the Supabase SQL editor, then reload. From that point on, every sharp edge /edges flags will automatically log, grade, and appear here.
            </div>
          </div>
        )}

        {!loading && data?.error && !data.migrationPending && (
          <div className="rounded-lg p-6" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
            <div className="text-sm font-semibold mb-1" style={{ color: "#ef4444" }}>
              Couldn&apos;t load track record
            </div>
            <div className="text-xs" style={{ color: "rgba(255,255,255,0.55)" }}>
              {data.details || data.error}
            </div>
          </div>
        )}

        {!loading && data && !data.stats && !data.migrationPending && !data.error && (
          <div className="rounded-lg p-10 text-center" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
            <div className="text-base mb-2" style={{ color: "rgba(255,255,255,0.8)" }}>
              No picks logged yet
            </div>
            <div className="text-xs max-w-md mx-auto" style={{ color: "rgba(255,255,255,0.5)" }}>
              The archive is live and watching. Once /edges finds its first sharp mispricing on a game within the next 3 days, it&apos;ll land here automatically.
            </div>
          </div>
        )}

        {!loading && data?.stats && !data.migrationPending && (
          <>
            {data.stats.smallSample && (
              <div className="rounded-lg p-4" style={{ background: "rgba(234,179,8,0.08)", border: "1px solid rgba(234,179,8,0.2)" }}>
                <div className="text-xs" style={{ color: "#eab308" }}>
                  ⚠ Early sample ({data.stats.resolved} graded picks). Noise still dominates — meaningful read requires 30+.
                </div>
              </div>
            )}

            {/* Stats grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <StatCard
                icon={<Target size={14} />}
                label="Win Rate"
                value={`${data.stats.winRate.toFixed(1)}%`}
                valueColor={data.stats.winRate >= 52.4 ? "#22c55e" : "#ef4444"}
                sub={`${data.stats.won}W – ${data.stats.lost}L`}
              />
              <StatCard
                icon={<DollarSign size={14} />}
                label="ROI"
                value={`${data.stats.roi >= 0 ? "+" : ""}${data.stats.roi.toFixed(2)}%`}
                valueColor={data.stats.roi > 0 ? "#22c55e" : "#ef4444"}
                sub={fmtMoney(data.stats.totalProfit)}
              />
              <StatCard
                icon={<BarChart3 size={14} />}
                label="Avg CLV"
                value={
                  data.stats.avgClv !== null
                    ? fmtPct(data.stats.avgClv)
                    : "—"
                }
                valueColor={
                  data.stats.avgClv !== null && data.stats.avgClv > 0
                    ? "#22c55e"
                    : data.stats.avgClv !== null
                      ? "#ef4444"
                      : "rgba(255,255,255,0.5)"
                }
                sub={`${data.stats.clvSample} with CLV`}
              />
              <StatCard
                icon={<Zap size={14} />}
                label="Total Picks"
                value={String(data.stats.total)}
                valueColor="#ededed"
                sub={`${data.stats.pending} pending`}
              />
              <StatCard
                icon={<TrendingUp size={14} />}
                label="Breakeven"
                value="52.4%"
                valueColor="rgba(255,255,255,0.5)"
                sub="At -110 odds"
              />
              <StatCard
                icon={<Clock size={14} />}
                label="Resolved"
                value={String(data.stats.resolved)}
                valueColor="rgba(255,255,255,0.8)"
                sub="Graded picks"
              />
            </div>

            {/* By sport */}
            {data.bySport.length > 0 && (
              <div>
                <h2 className="text-2xl mb-6" style={{ fontFamily: "'DM Serif Display', serif" }}>
                  By Sport
                </h2>
                <div className="space-y-3">
                  {data.bySport.map((s) => (
                    <div key={s.sport} className="flex items-center justify-between py-3 border-b" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
                      <div className="flex items-center gap-4">
                        <span className="text-sm font-semibold w-14">{s.sport}</span>
                        <span className="text-xs" style={{ color: "rgba(255,255,255,0.5)", fontFamily: "var(--font-geist-mono)" }}>
                          {s.won}W – {s.lost}L
                        </span>
                      </div>
                      <div className="flex items-center gap-6">
                        <span className="text-sm" style={{ color: s.winRate >= 52.4 ? "#22c55e" : "rgba(255,255,255,0.7)", fontFamily: "var(--font-geist-mono)" }}>
                          {s.winRate.toFixed(1)}%
                        </span>
                        <span className="text-sm" style={{ color: s.profit > 0 ? "#22c55e" : s.profit < 0 ? "#ef4444" : "rgba(255,255,255,0.5)", fontFamily: "var(--font-geist-mono)", minWidth: 80, textAlign: "right" }}>
                          {fmtMoney(s.profit)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recent picks */}
            <div>
              <h2 className="text-2xl mb-6" style={{ fontFamily: "'DM Serif Display', serif" }}>
                Recent Picks
              </h2>
              {data.recent.length === 0 && (
                <p className="text-sm" style={{ color: "rgba(255,255,255,0.5)" }}>
                  No picks logged yet. Once /edges finds its first sharp mispricing, it&apos;ll land here.
                </p>
              )}
              <div className="space-y-2">
                {data.recent.map((p) => (
                  <motion.div
                    key={p.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex items-center gap-4 py-3 px-4 rounded-lg"
                    style={{
                      background: "rgba(255,255,255,0.02)",
                      border: `1px solid ${p.status === "won" ? "rgba(34,197,94,0.15)" : p.status === "lost" ? "rgba(239,68,68,0.15)" : "rgba(255,255,255,0.05)"}`,
                    }}
                  >
                    <div className="text-xs flex-shrink-0 w-16" style={{ color: "rgba(255,255,255,0.4)", fontFamily: "var(--font-geist-mono)" }}>
                      {fmtDate(p.createdAt)}
                    </div>
                    <div className="text-xs flex-shrink-0 w-12 font-semibold" style={{ color: "#3b82f6" }}>
                      {p.sport}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm truncate">{p.pick}</div>
                      <div className="text-xs truncate" style={{ color: "rgba(255,255,255,0.4)" }}>{p.game}</div>
                    </div>
                    <div className="text-xs flex-shrink-0" style={{ color: "#FF3B3B", fontFamily: "var(--font-geist-mono)" }}>
                      {fmtOdds(p.odds)}
                    </div>
                    <div className="text-xs flex-shrink-0 w-16 text-right" style={{
                      color: p.evVsFair && p.evVsFair >= 0.02 ? "#22c55e" : "rgba(255,255,255,0.5)",
                      fontFamily: "var(--font-geist-mono)",
                    }}>
                      {p.evVsFair !== null ? `${(p.evVsFair * 100).toFixed(1)}%` : "—"}
                    </div>
                    <div className="text-xs flex-shrink-0 w-20 text-right" style={{
                      color: p.status === "won" ? "#22c55e" : p.status === "lost" ? "#ef4444" : "rgba(255,255,255,0.5)",
                      fontFamily: "var(--font-geist-mono)",
                      fontWeight: 600,
                      textTransform: "uppercase",
                    }}>
                      {p.status}
                    </div>
                    <div className="text-xs flex-shrink-0 w-20 text-right" style={{
                      color: p.profit > 0 ? "#22c55e" : p.profit < 0 ? "#ef4444" : "rgba(255,255,255,0.5)",
                      fontFamily: "var(--font-geist-mono)",
                    }}>
                      {p.status === "pending" ? "—" : fmtMoney(p.profit)}
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  valueColor,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueColor: string;
  sub: string;
}) {
  return (
    <div className="rounded-lg p-4" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
      <div className="flex items-center gap-2 text-xs mb-2 uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.4)" }}>
        {icon}
        {label}
      </div>
      <div className="text-2xl leading-none" style={{ color: valueColor, fontFamily: "var(--font-geist-mono)", fontWeight: 500 }}>
        {value}
      </div>
      <div className="text-xs mt-2" style={{ color: "rgba(255,255,255,0.4)" }}>
        {sub}
      </div>
    </div>
  );
}
