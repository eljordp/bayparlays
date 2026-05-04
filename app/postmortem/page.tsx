"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  AlertTriangle,
  Flame,
  Snowflake,
} from "lucide-react";
import { AppNav } from "@/app/components/AppNav";

interface AvgBucket {
  confidence: number;
  evPercent: number;
  combinedDecimal: number;
  legCount: number;
}

interface WindowSummary {
  hitRate: number;
  roi: number;
  profit: number;
  clv: number;
  resolved: number;
}

interface AttribRow {
  key: string;
  wins: number;
  losses: number;
  total: number;
  hitRate: number;
  roi: number;
  profit: number;
}

interface StreakRow {
  subject: string;
  status: string;
  streakLen: number;
  totalAppearances: number;
  lastSeen: string;
}

interface CalibRow {
  sport: string;
  samples: number;
  claimedConfidence: number;
  actualHitRate: number;
  gap: number;
  verdict: "overconfident" | "under-confident" | "calibrated";
}

interface Recommendation {
  kind: string;
  text: string;
  impact?: string;
}

interface Postmortem {
  totalResolved: number;
  totalWins: number;
  totalLosses: number;
  trend: { current: WindowSummary; previous: WindowSummary };
  winAvg: AvgBucket;
  lossAvg: AvgBucket;
  attribution: {
    bySport: AttribRow[];
    byLegCount: AttribRow[];
    byConfidenceBand: AttribRow[];
  };
  hotStreaks: StreakRow[];
  coldStreaks: StreakRow[];
  calibration: CalibRow[];
  recommendations: Recommendation[];
  unitStake: number;
}

function deltaTone(delta: number): { color: string; arrow: typeof ArrowUpRight } {
  if (delta > 0) return { color: "#16a34a", arrow: ArrowUpRight };
  if (delta < 0) return { color: "#dc2626", arrow: ArrowDownRight };
  return { color: "rgba(0,0,0,0.45)", arrow: ArrowUpRight };
}

export default function PostmortemPage() {
  const [data, setData] = useState<Postmortem | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/track/postmortem", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  if (loading || !data) {
    return (
      <div className="min-h-screen" style={{ background: "#FAFAF7" }}>
        <AppNav />
        <div className="pt-32 px-6 max-w-[1100px] mx-auto">
          <div className="rounded-2xl p-8 text-center" style={{ background: "rgba(0,0,0,0.03)", color: "rgba(0,0,0,0.45)" }}>
            {loading ? "Crunching..." : "No data yet."}
          </div>
        </div>
      </div>
    );
  }

  const { trend } = data;
  const dHitRate = trend.current.hitRate - trend.previous.hitRate;
  const dRoi = trend.current.roi - trend.previous.roi;
  const dProfit = trend.current.profit - trend.previous.profit;
  const dClv = trend.current.clv - trend.previous.clv;

  return (
    <div className="min-h-screen" style={{ background: "#FAFAF7" }}>
      <AppNav />
      <header className="pt-24 pb-6 px-4 md:pt-32 md:pb-10 md:px-6">
        <div className="max-w-[1200px] mx-auto">
          <Link href="/strategies" className="inline-block text-sm mb-4" style={{ color: "rgba(0,0,0,0.55)" }}>
            ← Strategies
          </Link>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <h1
              className="text-5xl md:text-7xl font-normal leading-[1.05] mb-3"
              style={{ fontFamily: "'DM Serif Display', serif", color: "#0a0a0a" }}
            >
              Postmortem
            </h1>
            <p className="text-base md:text-lg max-w-2xl" style={{ color: "rgba(0,0,0,0.5)" }}>
              What hit, what didn&apos;t, and what to tweak. {data.totalResolved} resolved · {data.totalWins} wins · {data.totalLosses} losses.
            </p>
          </motion.div>
        </div>
      </header>

      <main className="px-4 pb-20 md:px-6 md:pb-32">
        <div className="max-w-[1200px] mx-auto space-y-12">

          {/* Headline scorecard with 7d trend */}
          <section>
            <h2 className="text-xl md:text-2xl font-normal mb-4" style={{ fontFamily: "'DM Serif Display', serif" }}>
              Last 7 Days vs Prior 7
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <TrendCard label="Hit Rate" current={`${trend.current.hitRate.toFixed(1)}%`} delta={dHitRate} suffix="pp" />
              <TrendCard label="ROI" current={`${trend.current.roi >= 0 ? "+" : ""}${trend.current.roi.toFixed(1)}%`} delta={dRoi} suffix="pp" />
              <TrendCard label={`Profit @ $${data.unitStake}`} current={`${trend.current.profit >= 0 ? "+" : ""}$${Math.round(trend.current.profit)}`} delta={dProfit} prefix="$" />
              <TrendCard label="Avg CLV" current={`${trend.current.clv >= 0 ? "+" : ""}${trend.current.clv.toFixed(2)}%`} delta={dClv} suffix="pp" />
            </div>
            <p className="text-xs mt-3" style={{ color: "rgba(0,0,0,0.45)" }}>
              {trend.current.resolved} resolved this week · {trend.previous.resolved} resolved the week before. Deltas show whether the model is improving or regressing.
            </p>
          </section>

          {/* Auto-system banner — many of the tweaks below are now applied
              automatically by the calibration + CLV gate. Surface that
              context so JP doesn't manually do work the system already does. */}
          <section
            className="rounded-xl p-4 border flex items-start gap-3"
            style={{
              background: "rgba(34,197,94,0.05)",
              borderColor: "rgba(34,197,94,0.25)",
            }}
          >
            <div
              className="flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center mt-0.5"
              style={{ background: "rgba(34,197,94,0.12)" }}
            >
              <span style={{ color: "#15803d", fontSize: 18 }}>✓</span>
            </div>
            <div className="flex-1 text-sm" style={{ color: "rgba(0,0,0,0.75)" }}>
              <strong style={{ color: "#0a0a0a" }}>Most of this is automated now.</strong>{" "}
              Per-bucket calibration adjusts sport / market / odds-bucket
              probabilities every night.{" "}
              <a href="/admin/calibration" className="underline" style={{ color: "#15803d" }}>
                Calibration table
              </a>{" "}
              shows what&apos;s currently boosted vs penalized. The CLV gate
              auto-blocks losing buckets with 5% exploration to keep them
              under test. Tweaks below are flagged as additional context —
              act on them only if the auto-system isn&apos;t catching them.
            </div>
          </section>

          {/* Recommendations */}
          {data.recommendations.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle size={18} style={{ color: "#FF3B3B" }} />
                <h2 className="text-xl md:text-2xl font-normal" style={{ fontFamily: "'DM Serif Display', serif" }}>
                  Tweaks to Consider
                </h2>
              </div>
              <div className="space-y-3">
                {data.recommendations.map((r, i) => (
                  <div
                    key={i}
                    className="rounded-xl p-4 border flex items-start gap-3"
                    style={{ background: "rgba(255,59,59,0.04)", borderColor: "rgba(255,59,59,0.25)" }}
                  >
                    <div className="flex-1">
                      <p className="text-sm" style={{ color: "#0a0a0a" }}>{r.text}</p>
                    </div>
                    {r.impact && (
                      <span
                        className="text-xs uppercase tracking-widest font-bold px-2 py-1 rounded-full whitespace-nowrap"
                        style={{ background: "#16a34a", color: "#fff" }}
                      >
                        {r.impact}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Profit attribution */}
          <section>
            <h2 className="text-xl md:text-2xl font-normal mb-2" style={{ fontFamily: "'DM Serif Display', serif" }}>
              Where the Money Goes
            </h2>
            <p className="text-xs mb-4" style={{ color: "rgba(0,0,0,0.5)" }}>
              Profit attributed by sport, leg count, and confidence band. Sorted by profit. Negative values are bleed.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <AttribTable title="By Sport" rows={data.attribution.bySport} unit={data.unitStake} />
              <AttribTable title="By Leg Count" rows={data.attribution.byLegCount} unit={data.unitStake} />
              <AttribTable title="By Confidence" rows={data.attribution.byConfidenceBand} unit={data.unitStake} />
            </div>
          </section>

          {/* Hot / Cold streaks */}
          <section>
            <h2 className="text-xl md:text-2xl font-normal mb-2" style={{ fontFamily: "'DM Serif Display', serif" }}>
              Active Streaks (Last 14 Days)
            </h2>
            <p className="text-xs mb-4" style={{ color: "rgba(0,0,0,0.5)" }}>
              Teams or pick subjects on a meaningful run. Hot = 3+ wins in a row. Cold = 4+ losses. Ride the hot ones, block the cold ones manually.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <StreakPanel kind="hot" rows={data.hotStreaks} />
              <StreakPanel kind="cold" rows={data.coldStreaks} />
            </div>
          </section>

          {/* Wins vs Losses pick profile */}
          <section>
            <h2 className="text-xl md:text-2xl font-normal mb-2" style={{ fontFamily: "'DM Serif Display', serif" }}>
              What a Winning Pick Looks Like vs a Losing One
            </h2>
            <p className="text-xs mb-4" style={{ color: "rgba(0,0,0,0.5)" }}>
              Big gaps reveal structural bias. If wins average lower combined odds than losses, the model is wasting picks on longshots.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <AvgPanel label="Wins" tone="green" data={data.winAvg} count={data.totalWins} />
              <AvgPanel label="Losses" tone="red" data={data.lossAvg} count={data.totalLosses} />
            </div>
          </section>

          {/* Calibration */}
          <section>
            <h2 className="text-xl md:text-2xl font-normal mb-2" style={{ fontFamily: "'DM Serif Display', serif" }}>
              Per-Sport Model Health
            </h2>
            <p className="text-xs mb-4" style={{ color: "rgba(0,0,0,0.5)" }}>
              Compares the model&apos;s avg claimed confidence to its actual hit rate. Big positive gap = overconfident on that sport.
            </p>
            <div className="space-y-2">
              {data.calibration.length === 0 ? (
                <div className="rounded-xl p-6 text-center text-sm" style={{ background: "rgba(0,0,0,0.03)", color: "rgba(0,0,0,0.45)" }}>
                  Not enough data yet
                </div>
              ) : (
                data.calibration.map((c) => <CalibBar key={c.sport} c={c} />)
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

function TrendCard({
  label,
  current,
  delta,
  prefix = "",
  suffix = "",
}: {
  label: string;
  current: string;
  delta: number;
  prefix?: string;
  suffix?: string;
}) {
  const tone = deltaTone(delta);
  const Arrow = tone.arrow;
  const sign = delta > 0 ? "+" : "";
  return (
    <div className="rounded-xl p-4 border" style={{ background: "#fff", borderColor: "rgba(0,0,0,0.08)" }}>
      <div className="text-[10px] uppercase tracking-widest" style={{ color: "rgba(0,0,0,0.4)" }}>
        {label}
      </div>
      <div className="text-2xl md:text-3xl font-mono font-bold mt-1" style={{ color: "#0a0a0a" }}>
        {current}
      </div>
      <div className="flex items-center gap-1 mt-1.5 text-xs font-mono" style={{ color: tone.color }}>
        <Arrow size={12} />
        <span>{sign}{Math.abs(delta).toFixed(suffix === "$" ? 0 : 1)}{suffix === "pp" ? "pp" : suffix === "$" ? "" : ""}{prefix && suffix !== "pp" ? prefix : ""}</span>
        <span style={{ color: "rgba(0,0,0,0.35)" }} className="ml-1">vs prior 7d</span>
      </div>
    </div>
  );
}

function AttribTable({ title, rows, unit }: { title: string; rows: AttribRow[]; unit: number }) {
  return (
    <div className="rounded-xl border overflow-hidden" style={{ background: "#fff", borderColor: "rgba(0,0,0,0.08)" }}>
      <div className="px-4 py-3 border-b text-sm font-semibold" style={{ borderColor: "rgba(0,0,0,0.05)", color: "#0a0a0a" }}>
        {title}
      </div>
      {rows.length === 0 ? (
        <div className="px-4 py-6 text-sm text-center" style={{ color: "rgba(0,0,0,0.45)" }}>
          No data
        </div>
      ) : (
        rows.map((r, i) => (
          <div
            key={r.key}
            className="px-4 py-3 flex items-center justify-between"
            style={{ borderBottom: i < rows.length - 1 ? "1px solid rgba(0,0,0,0.05)" : "none" }}
          >
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold truncate">{r.key}</div>
              <div className="text-xs" style={{ color: "rgba(0,0,0,0.5)" }}>
                {r.wins}W / {r.losses}L · {r.hitRate.toFixed(1)}%
              </div>
            </div>
            <div className="text-right ml-2">
              <div
                className="text-base font-mono font-bold"
                style={{ color: r.profit > 0 ? "#16a34a" : r.profit < 0 ? "#dc2626" : "#0a0a0a" }}
              >
                {r.profit >= 0 ? "+" : ""}${Math.round(r.profit)}
              </div>
              <div className="text-[10px]" style={{ color: "rgba(0,0,0,0.4)" }}>
                @ ${unit}
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function StreakPanel({ kind, rows }: { kind: "hot" | "cold"; rows: StreakRow[] }) {
  const isHot = kind === "hot";
  const Icon = isHot ? Flame : Snowflake;
  const accent = isHot ? "#16a34a" : "#dc2626";
  const label = isHot ? "Hot Hands — ride these" : "Cold Streaks — block manually";
  return (
    <div className="rounded-xl border overflow-hidden" style={{ background: "#fff", borderColor: "rgba(0,0,0,0.08)" }}>
      <div className="flex items-center gap-2 px-5 py-3 border-b" style={{ borderColor: "rgba(0,0,0,0.05)" }}>
        <Icon size={14} color={accent} />
        <span className="text-sm font-semibold">{label}</span>
      </div>
      {rows.length === 0 ? (
        <div className="px-5 py-6 text-sm text-center" style={{ color: "rgba(0,0,0,0.45)" }}>
          No active {isHot ? "hot streaks" : "cold streaks"} right now
        </div>
      ) : (
        <div>
          {rows.map((r, i) => (
            <div
              key={r.subject}
              className="px-5 py-2.5 flex items-center justify-between"
              style={{ borderBottom: i < rows.length - 1 ? "1px solid rgba(0,0,0,0.04)" : "none" }}
            >
              <div className="flex-1 truncate text-sm">{r.subject}</div>
              <div className="text-xs ml-3" style={{ color: "rgba(0,0,0,0.55)" }}>
                {r.totalAppearances} picks · 14d
              </div>
              <div className="ml-3 text-sm font-mono font-bold w-14 text-right" style={{ color: accent }}>
                {isHot ? <TrendingUp size={14} className="inline mr-1" /> : <TrendingDown size={14} className="inline mr-1" />}
                {r.streakLen}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CalibBar({ c }: { c: CalibRow }) {
  const verdictColor =
    c.verdict === "overconfident"
      ? "#dc2626"
      : c.verdict === "under-confident"
        ? "#3b82f6"
        : "#16a34a";
  // Bar visualization: 0-100 scale, claimed and actual side by side
  const claimedPct = Math.min(100, Math.max(0, c.claimedConfidence));
  const actualPct = Math.min(100, Math.max(0, c.actualHitRate));
  return (
    <div className="rounded-xl p-4 border" style={{ background: "#fff", borderColor: "rgba(0,0,0,0.08)" }}>
      <div className="flex items-center justify-between mb-2">
        <div>
          <span className="text-sm font-semibold">{c.sport}</span>
          <span className="text-xs ml-2" style={{ color: "rgba(0,0,0,0.45)" }}>
            {c.samples} samples
          </span>
        </div>
        <span
          className="text-[10px] uppercase tracking-widest font-bold px-2 py-0.5 rounded-full"
          style={{
            background:
              c.verdict === "overconfident"
                ? "rgba(220,38,38,0.12)"
                : c.verdict === "under-confident"
                  ? "rgba(59,130,246,0.12)"
                  : "rgba(34,197,94,0.12)",
            color: verdictColor,
          }}
        >
          {c.verdict}
        </span>
      </div>
      <div className="space-y-2">
        <BarRow label={`Claimed conf ${c.claimedConfidence.toFixed(0)}%`} pct={claimedPct} color="rgba(0,0,0,0.35)" />
        <BarRow label={`Actual hit ${c.actualHitRate.toFixed(0)}%`} pct={actualPct} color="#0a0a0a" />
      </div>
      <div className="text-xs mt-2" style={{ color: "rgba(0,0,0,0.55)" }}>
        Gap: <span style={{ color: verdictColor, fontWeight: 600 }}>
          {c.gap >= 0 ? "+" : ""}{c.gap.toFixed(1)}pp
        </span>
      </div>
    </div>
  );
}

function BarRow({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <div>
      <div className="flex items-center justify-between text-[10px] mb-1" style={{ color: "rgba(0,0,0,0.45)" }}>
        <span>{label}</span>
      </div>
      <div className="h-2 rounded-full" style={{ background: "rgba(0,0,0,0.06)" }}>
        <div className="h-2 rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

function AvgPanel({ label, tone, data, count }: { label: string; tone: "green" | "red"; data: AvgBucket; count: number }) {
  const accent = tone === "green" ? "#16a34a" : "#dc2626";
  return (
    <div className="rounded-xl p-5 border" style={{ background: "#fff", borderColor: "rgba(0,0,0,0.08)" }}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-[10px] uppercase tracking-widest" style={{ color: "rgba(0,0,0,0.45)" }}>
            {label}
          </div>
          <div className="text-3xl font-mono font-bold" style={{ color: accent }}>
            n = {count}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 mt-2">
        <Stat label="Avg Confidence" value={`${data.confidence}%`} />
        <Stat label="Avg EV claimed" value={`${data.evPercent}%`} />
        <Stat label="Avg combined" value={`${data.combinedDecimal}x`} />
        <Stat label="Avg legs" value={`${data.legCount}`} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest" style={{ color: "rgba(0,0,0,0.4)" }}>
        {label}
      </div>
      <div className="text-base font-mono font-semibold mt-1" style={{ color: "#0a0a0a" }}>
        {value}
      </div>
    </div>
  );
}
