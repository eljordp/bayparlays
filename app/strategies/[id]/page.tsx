"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { AppNav } from "@/app/components/AppNav";

interface PickLeg {
  pick?: string;
  game?: string;
  odds?: number;
  market?: string;
}

interface Pick {
  id: string;
  createdAt: string;
  legs: PickLeg[];
  combinedOdds: string;
  confidence: number;
  status: string;
  profitAtUnit: number;
  payoutAtUnit: number;
  evPercent: number;
  sports: string[];
  legsTotal: number;
  category: string | null;
}

interface Detail {
  strategy: {
    id: string;
    name: string;
    description: string;
    isSweetSpot: boolean;
  };
  summary: {
    picks: number;
    resolved: number;
    wins: number;
    losses: number;
    pending: number;
    hitRate: number;
    roi: number;
    profitAtUnit: number;
    avgPayoutWhenWin: number;
    bestWinAtUnit: number;
    streakType: "W" | "L";
    streakCount: number;
  };
  recentPicks: Pick[];
  recentWins: Pick[];
  performanceByDay: { date: string; wins: number; losses: number; profit: number }[];
  bySport: { sport: string; picks: number; wins: number; losses: number; hitRate: number; profit: number }[];
  byLegCount: { legs: number; picks: number; wins: number; losses: number; hitRate: number; profit: number }[];
  unitStake: number;
}

function formatRelative(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return mins <= 1 ? "just now" : `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const STATUS_COLORS: Record<string, { bg: string; fg: string; label: string }> = {
  won: { bg: "#16a34a", fg: "#fff", label: "Won" },
  lost: { bg: "rgba(220,38,38,0.85)", fg: "#fff", label: "Lost" },
  pending: { bg: "rgba(0,0,0,0.08)", fg: "rgba(0,0,0,0.6)", label: "Pending" },
};

export default function StrategyDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const { id } = params;
  const [data, setData] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    fetch(`/api/track/strategies/${id}`, { cache: "no-store" })
      .then(async (r) => {
        if (r.status === 404) {
          setNotFound(true);
          return null;
        }
        return r.ok ? r.json() : null;
      })
      .then((d) => {
        if (d) setData(d);
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (notFound) {
    return (
      <div className="min-h-screen" style={{ background: "#FAFAF7" }}>
        <AppNav />
        <div className="pt-32 px-6 max-w-[800px] mx-auto text-center">
          <h1 className="text-3xl font-normal mb-4" style={{ fontFamily: "'DM Serif Display', serif" }}>
            Strategy not found
          </h1>
          <Link
            href="/strategies"
            className="text-sm font-semibold underline"
            style={{ color: "#0a0a0a" }}
          >
            ← Back to Strategies
          </Link>
        </div>
      </div>
    );
  }

  if (loading || !data) {
    return (
      <div className="min-h-screen" style={{ background: "#FAFAF7" }}>
        <AppNav />
        <div className="pt-32 px-6 max-w-[1400px] mx-auto">
          <div className="rounded-2xl p-8 text-center" style={{ background: "rgba(0,0,0,0.03)", color: "rgba(0,0,0,0.45)" }}>
            Loading strategy detail…
          </div>
        </div>
      </div>
    );
  }

  const s = data.summary;
  const unit = data.unitStake;
  const maxDayProfit = Math.max(
    1,
    ...data.performanceByDay.map((d) => Math.abs(d.profit)),
  );

  return (
    <div className="min-h-screen" style={{ background: "#FAFAF7" }}>
      <AppNav />

      <div className="pt-24 px-4 md:px-6">
        <div className="max-w-[1400px] mx-auto">
          <Link
            href="/strategies"
            className="inline-flex items-center gap-2 text-sm transition-colors"
            style={{ color: "rgba(0,0,0,0.55)" }}
          >
            <ArrowLeft size={16} />
            All Strategies
          </Link>
        </div>
      </div>

      <header className="pt-6 pb-8 px-4 md:pt-10 md:pb-12 md:px-6">
        <div className="max-w-[1400px] mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="flex items-center gap-3 flex-wrap mb-4">
              <h1
                className="text-4xl md:text-6xl font-normal leading-[1.05]"
                style={{ fontFamily: "'DM Serif Display', serif", color: "#0a0a0a" }}
              >
                {data.strategy.name}
              </h1>
              {data.strategy.isSweetSpot && (
                <span
                  className="text-[11px] uppercase tracking-widest font-bold px-3 py-1 rounded-full"
                  style={{ background: "#FF3B3B", color: "#fff" }}
                >
                  Recommended
                </span>
              )}
            </div>
            <p className="text-base md:text-lg max-w-2xl" style={{ color: "rgba(0,0,0,0.5)" }}>
              {data.strategy.description}
            </p>
          </motion.div>
        </div>
      </header>

      <main className="px-4 pb-20 md:px-6 md:pb-32">
        <div className="max-w-[1400px] mx-auto">
          {/* Hero stat cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-10">
            <StatCard
              label="Hit Rate"
              value={`${s.hitRate.toFixed(1)}%`}
              sub={`${s.wins}W / ${s.losses}L`}
              tone={s.hitRate >= 35 ? "green" : "neutral"}
            />
            <StatCard
              label="ROI"
              value={`${s.roi >= 0 ? "+" : ""}${s.roi.toFixed(1)}%`}
              sub={`at $${unit}/bet`}
              tone={s.roi > 0 ? "green" : s.roi < 0 ? "red" : "neutral"}
            />
            <StatCard
              label={`Profit @ $${unit}`}
              value={`${s.profitAtUnit >= 0 ? "+" : ""}$${Math.round(s.profitAtUnit)}`}
              sub={`${s.resolved} resolved`}
              tone={s.profitAtUnit > 0 ? "green" : s.profitAtUnit < 0 ? "red" : "neutral"}
            />
            <StatCard
              label="Current Streak"
              value={`${s.streakType}${s.streakCount}`}
              sub={s.streakType === "W" ? "winning" : "losing"}
              tone={s.streakType === "W" ? "green" : "red"}
            />
            <StatCard
              label="Total Picks"
              value={String(s.picks)}
              sub={`${s.pending} pending`}
              tone="neutral"
            />
            <StatCard
              label="Avg Win"
              value={`$${s.avgPayoutWhenWin.toFixed(0)}`}
              sub={`when one hits`}
              tone="neutral"
            />
            <StatCard
              label="Best Win"
              value={`$${s.bestWinAtUnit.toFixed(0)}`}
              sub={`single parlay`}
              tone="green"
            />
            <StatCard
              label="Resolved"
              value={String(s.resolved)}
              sub={`${s.wins} wins`}
              tone="neutral"
            />
          </div>

          {/* Last 14 days bar chart */}
          {data.performanceByDay.length > 0 && (
            <section className="mb-12">
              <h2
                className="text-xl md:text-2xl font-normal mb-4"
                style={{ fontFamily: "'DM Serif Display', serif" }}
              >
                Last 14 Days
              </h2>
              <div
                className="rounded-2xl p-4 md:p-6 border"
                style={{ background: "#fff", borderColor: "rgba(0,0,0,0.08)" }}
              >
                <div className="flex items-end gap-1 md:gap-2 h-32">
                  {data.performanceByDay.map((d) => {
                    const heightPct =
                      Math.abs(d.profit) / maxDayProfit * 100;
                    return (
                      <div
                        key={d.date}
                        className="flex-1 flex flex-col items-center gap-1"
                        title={`${d.date}: ${d.wins}W/${d.losses}L · ${d.profit >= 0 ? "+" : ""}$${Math.round(d.profit)}`}
                      >
                        <div
                          className="w-full rounded transition-all"
                          style={{
                            height: `${Math.max(2, heightPct)}%`,
                            background: d.profit >= 0 ? "#16a34a" : "#dc2626",
                            opacity: 0.85,
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
                <div
                  className="flex justify-between mt-3 text-[10px]"
                  style={{ color: "rgba(0,0,0,0.4)" }}
                >
                  <span>{data.performanceByDay[0]?.date.slice(5)}</span>
                  <span>{data.performanceByDay[data.performanceByDay.length - 1]?.date.slice(5)}</span>
                </div>
              </div>
            </section>
          )}

          {/* Breakdowns */}
          <div className="grid md:grid-cols-2 gap-6 mb-12">
            {/* By Sport */}
            <section>
              <h2
                className="text-xl md:text-2xl font-normal mb-4"
                style={{ fontFamily: "'DM Serif Display', serif" }}
              >
                By Sport
              </h2>
              <div
                className="rounded-2xl border overflow-hidden"
                style={{ background: "#fff", borderColor: "rgba(0,0,0,0.08)" }}
              >
                {data.bySport.length === 0 ? (
                  <div className="p-6 text-center text-sm" style={{ color: "rgba(0,0,0,0.4)" }}>
                    No data yet
                  </div>
                ) : (
                  data.bySport.map((row, i) => (
                    <div
                      key={row.sport}
                      className="px-5 py-4 flex items-center justify-between"
                      style={{
                        borderBottom: i < data.bySport.length - 1 ? "1px solid rgba(0,0,0,0.05)" : "none",
                      }}
                    >
                      <div>
                        <div className="text-sm font-semibold">{row.sport}</div>
                        <div className="text-xs" style={{ color: "rgba(0,0,0,0.5)" }}>
                          {row.picks} picks · {row.wins}W/{row.losses}L
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-mono font-bold">{row.hitRate.toFixed(0)}%</div>
                        <div
                          className="text-xs font-mono"
                          style={{ color: row.profit >= 0 ? "#16a34a" : "#dc2626" }}
                        >
                          {row.profit >= 0 ? "+" : ""}${Math.round(row.profit)}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>

            {/* By Leg Count */}
            <section>
              <h2
                className="text-xl md:text-2xl font-normal mb-4"
                style={{ fontFamily: "'DM Serif Display', serif" }}
              >
                By Leg Count
              </h2>
              <div
                className="rounded-2xl border overflow-hidden"
                style={{ background: "#fff", borderColor: "rgba(0,0,0,0.08)" }}
              >
                {data.byLegCount.length === 0 ? (
                  <div className="p-6 text-center text-sm" style={{ color: "rgba(0,0,0,0.4)" }}>
                    No data yet
                  </div>
                ) : (
                  data.byLegCount.map((row, i) => (
                    <div
                      key={row.legs}
                      className="px-5 py-4 flex items-center justify-between"
                      style={{
                        borderBottom: i < data.byLegCount.length - 1 ? "1px solid rgba(0,0,0,0.05)" : "none",
                      }}
                    >
                      <div>
                        <div className="text-sm font-semibold">
                          {row.legs}-leg parlays
                        </div>
                        <div className="text-xs" style={{ color: "rgba(0,0,0,0.5)" }}>
                          {row.picks} picks · {row.wins}W/{row.losses}L
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-mono font-bold">{row.hitRate.toFixed(0)}%</div>
                        <div
                          className="text-xs font-mono"
                          style={{ color: row.profit >= 0 ? "#16a34a" : "#dc2626" }}
                        >
                          {row.profit >= 0 ? "+" : ""}${Math.round(row.profit)}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>

          {/* Recent picks */}
          <section className="mb-12">
            <h2
              className="text-xl md:text-2xl font-normal mb-4"
              style={{ fontFamily: "'DM Serif Display', serif" }}
            >
              Recent Picks
            </h2>
            <div className="space-y-3">
              {data.recentPicks.map((p) => {
                const status = STATUS_COLORS[p.status] ?? STATUS_COLORS.pending;
                return (
                  <div
                    key={p.id}
                    className="rounded-xl p-4 border"
                    style={{ background: "#fff", borderColor: "rgba(0,0,0,0.08)" }}
                  >
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-2">
                          <span
                            className="text-[10px] uppercase tracking-widest font-bold px-2 py-0.5 rounded-full"
                            style={{ background: status.bg, color: status.fg }}
                          >
                            {status.label}
                          </span>
                          <span className="text-sm font-mono font-bold">{p.combinedOdds}</span>
                          <span className="text-xs" style={{ color: "rgba(0,0,0,0.45)" }}>
                            · conf {p.confidence}%
                          </span>
                          <span className="text-xs" style={{ color: "rgba(0,0,0,0.45)" }}>
                            · {p.legsTotal} legs
                          </span>
                          <span className="text-xs" style={{ color: "rgba(0,0,0,0.45)" }}>
                            · {(p.sports || []).join("/") || "—"}
                          </span>
                          <span className="text-xs" style={{ color: "rgba(0,0,0,0.45)" }}>
                            · {formatRelative(p.createdAt)}
                          </span>
                        </div>
                        <div className="space-y-0.5">
                          {p.legs.map((leg, i) => (
                            <div key={i} className="text-sm flex items-center gap-2 flex-wrap">
                              <span style={{ fontWeight: 600 }}>{(leg as PickLeg).pick}</span>
                              {(leg as PickLeg).odds !== undefined && (
                                <span className="font-mono text-xs" style={{ color: "rgba(0,0,0,0.55)" }}>
                                  ({(leg as PickLeg).odds! > 0 ? "+" : ""}
                                  {(leg as PickLeg).odds})
                                </span>
                              )}
                              {(leg as PickLeg).game && (
                                <span className="text-xs" style={{ color: "rgba(0,0,0,0.4)" }}>
                                  · {(leg as PickLeg).game}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="text-right">
                        {p.status !== "pending" && (
                          <>
                            <div
                              className="text-[10px] uppercase tracking-widest"
                              style={{ color: "rgba(0,0,0,0.4)" }}
                            >
                              {p.status === "won" ? "Profit" : "Loss"}
                            </div>
                            <div
                              className="text-lg font-mono font-bold"
                              style={{ color: p.profitAtUnit >= 0 ? "#16a34a" : "#dc2626" }}
                            >
                              {p.profitAtUnit >= 0 ? "+" : ""}${p.profitAtUnit.toFixed(0)}
                            </div>
                          </>
                        )}
                        {p.status === "pending" && (
                          <>
                            <div
                              className="text-[10px] uppercase tracking-widest"
                              style={{ color: "rgba(0,0,0,0.4)" }}
                            >
                              To Win
                            </div>
                            <div className="text-lg font-mono font-bold" style={{ color: "rgba(0,0,0,0.7)" }}>
                              ${(p.payoutAtUnit - unit).toFixed(0)}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              {data.recentPicks.length === 0 && (
                <div
                  className="rounded-xl p-6 text-center text-sm"
                  style={{ background: "rgba(0,0,0,0.03)", color: "rgba(0,0,0,0.45)" }}
                >
                  No picks yet for this strategy.
                </div>
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone: "green" | "red" | "neutral";
}) {
  const valueColor =
    tone === "green" ? "#16a34a" : tone === "red" ? "#dc2626" : "#0a0a0a";
  return (
    <div
      className="rounded-xl border p-4"
      style={{ background: "#fff", borderColor: "rgba(0,0,0,0.08)" }}
    >
      <div
        className="text-[10px] uppercase tracking-widest mb-1"
        style={{ color: "rgba(0,0,0,0.4)" }}
      >
        {label}
      </div>
      <div className="text-2xl md:text-3xl font-mono font-bold" style={{ color: valueColor }}>
        {value}
      </div>
      <div className="text-xs mt-1" style={{ color: "rgba(0,0,0,0.45)" }}>
        {sub}
      </div>
    </div>
  );
}
