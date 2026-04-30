"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, AlertTriangle } from "lucide-react";
import { AppNav } from "@/app/components/AppNav";

interface Leg {
  pick?: string;
  market?: string;
  sport?: string;
  game?: string;
  odds?: number;
}

interface PickRow {
  id: string;
  createdAt: string;
  legs: Leg[];
  combinedDecimal: number;
  confidence: number;
  evPercent: number;
  profitAtUnit: number;
}

interface AvgBucket {
  confidence: number;
  evPercent: number;
  combinedDecimal: number;
  legCount: number;
}

interface MarketRow { market: string; wins: number; losses: number; total: number; hitRate: number }
interface SportRow { sport: string; wins: number; losses: number; total: number; hitRate: number; roi: number; profit: number }
interface TeamRow { subject: string; wins: number; losses: number; total: number; hitRate: number }
interface LegBucketRow { legs: number; wins: number; losses: number; total: number; hitRate: number; roi: number; profit: number }

interface Postmortem {
  totalResolved: number;
  totalWins: number;
  totalLosses: number;
  overallHitRate: number;
  winAvg: AvgBucket;
  lossAvg: AvgBucket;
  byMarket: MarketRow[];
  bySport: SportRow[];
  byLegCount: LegBucketRow[];
  topWinners: TeamRow[];
  topLosers: TeamRow[];
  mostFrequent: TeamRow[];
  recentWins: PickRow[];
  recentLosses: PickRow[];
  recommendations: string[];
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

  return (
    <div className="min-h-screen" style={{ background: "#FAFAF7" }}>
      <AppNav />
      <header className="pt-24 pb-8 px-4 md:pt-32 md:pb-12 md:px-6">
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
              className="text-5xl md:text-7xl font-normal leading-[1.05] mb-4"
              style={{ fontFamily: "'DM Serif Display', serif", color: "#0a0a0a" }}
            >
              Postmortem
            </h1>
            <p className="text-base md:text-lg max-w-2xl" style={{ color: "rgba(0,0,0,0.5)" }}>
              What hit, what didn&apos;t, and what to tweak. {data.totalResolved} resolved parlays · {data.totalWins} wins · {data.totalLosses} losses · {data.overallHitRate}% overall hit rate.
            </p>
          </motion.div>
        </div>
      </header>

      <main className="px-4 pb-20 md:px-6 md:pb-32">
        <div className="max-w-[1200px] mx-auto space-y-12">

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
                    className="rounded-xl p-4 border"
                    style={{ background: "rgba(255,59,59,0.04)", borderColor: "rgba(255,59,59,0.25)" }}
                  >
                    <p className="text-sm" style={{ color: "#0a0a0a" }}>{r}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* WIN vs LOSS averages */}
          <section>
            <h2 className="text-xl md:text-2xl font-normal mb-4" style={{ fontFamily: "'DM Serif Display', serif" }}>
              Wins vs Losses — average pick profile
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <AvgPanel label="Wins" tone="green" data={data.winAvg} count={data.totalWins} />
              <AvgPanel label="Losses" tone="red" data={data.lossAvg} count={data.totalLosses} />
            </div>
            <p className="text-xs mt-3" style={{ color: "rgba(0,0,0,0.45)" }}>
              Big gaps here mean the model has a structural bias. If wins are at much lower combined odds than losses, the model is over-confident on its longshots.
            </p>
          </section>

          {/* By Sport */}
          <section>
            <h2 className="text-xl md:text-2xl font-normal mb-4" style={{ fontFamily: "'DM Serif Display', serif" }}>
              By Sport
            </h2>
            <BreakdownTable
              rows={data.bySport.map((s) => ({
                label: s.sport,
                total: s.total,
                wins: s.wins,
                losses: s.losses,
                hitRate: s.hitRate,
                roi: s.roi,
                profit: s.profit,
              }))}
            />
          </section>

          {/* By Market */}
          <section>
            <h2 className="text-xl md:text-2xl font-normal mb-4" style={{ fontFamily: "'DM Serif Display', serif" }}>
              By Market (leg-level)
            </h2>
            <BreakdownTable
              rows={data.byMarket.map((m) => ({
                label: m.market,
                total: m.total,
                wins: m.wins,
                losses: m.losses,
                hitRate: m.hitRate,
              }))}
            />
            <p className="text-xs mt-2" style={{ color: "rgba(0,0,0,0.45)" }}>
              Note: hit rate here is parlay-outcome attributed to each leg, so it&apos;s a proxy not a true per-leg rate. Differences across markets still surface real bias.
            </p>
          </section>

          {/* By leg count */}
          <section>
            <h2 className="text-xl md:text-2xl font-normal mb-4" style={{ fontFamily: "'DM Serif Display', serif" }}>
              By Leg Count
            </h2>
            <BreakdownTable
              rows={data.byLegCount.map((b) => ({
                label: `${b.legs}-leg`,
                total: b.total,
                wins: b.wins,
                losses: b.losses,
                hitRate: b.hitRate,
                roi: b.roi,
                profit: b.profit,
              }))}
            />
          </section>

          {/* Team leaderboards */}
          <section>
            <h2 className="text-xl md:text-2xl font-normal mb-4" style={{ fontFamily: "'DM Serif Display', serif" }}>
              Team / Pick Leaderboards
            </h2>
            <p className="text-xs mb-4" style={{ color: "rgba(0,0,0,0.45)" }}>
              Pick subjects with 5+ resolutions. Use these to spot teams the model keeps backing rightly or wrongly.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <TeamPanel label="Hottest hitters" icon="up" rows={data.topWinners} />
              <TeamPanel label="Persistent losers" icon="down" rows={data.topLosers} />
            </div>
            <div className="mt-4">
              <TeamPanel label="Most frequently picked (winners + losers)" rows={data.mostFrequent} />
            </div>
          </section>

          {/* Recent wins/losses */}
          <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <RecentList label="Recent winners (last 14 days)" tone="green" rows={data.recentWins} />
            <RecentList label="Recent losses (last 14 days)" tone="red" rows={data.recentLosses} />
          </section>
        </div>
      </main>
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

interface BreakdownRow {
  label: string;
  total: number;
  wins: number;
  losses: number;
  hitRate: number;
  roi?: number;
  profit?: number;
}

function BreakdownTable({ rows }: { rows: BreakdownRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl p-6 text-center text-sm" style={{ background: "rgba(0,0,0,0.03)", color: "rgba(0,0,0,0.5)" }}>
        No data
      </div>
    );
  }
  return (
    <div className="rounded-xl overflow-hidden border" style={{ background: "#fff", borderColor: "rgba(0,0,0,0.08)" }}>
      {rows.map((r, i) => (
        <div
          key={r.label}
          className="px-5 py-3 flex items-center justify-between"
          style={{ borderBottom: i < rows.length - 1 ? "1px solid rgba(0,0,0,0.05)" : "none" }}
        >
          <div className="flex-1 flex items-center gap-3">
            <span className="text-sm font-semibold" style={{ color: "#0a0a0a" }}>
              {r.label}
            </span>
            <span className="text-xs" style={{ color: "rgba(0,0,0,0.5)" }}>
              {r.wins}W / {r.losses}L · {r.total} total
            </span>
          </div>
          <div className="flex items-center gap-4 text-right">
            <div>
              <div className="text-[10px] uppercase" style={{ color: "rgba(0,0,0,0.4)" }}>
                Hit
              </div>
              <div className="text-sm font-mono font-bold">{r.hitRate.toFixed(1)}%</div>
            </div>
            {r.roi !== undefined && (
              <div>
                <div className="text-[10px] uppercase" style={{ color: "rgba(0,0,0,0.4)" }}>
                  ROI
                </div>
                <div className="text-sm font-mono font-bold" style={{ color: r.roi > 0 ? "#16a34a" : r.roi < 0 ? "#dc2626" : "#0a0a0a" }}>
                  {r.roi >= 0 ? "+" : ""}{r.roi.toFixed(1)}%
                </div>
              </div>
            )}
            {r.profit !== undefined && (
              <div className="hidden sm:block">
                <div className="text-[10px] uppercase" style={{ color: "rgba(0,0,0,0.4)" }}>
                  Profit
                </div>
                <div className="text-sm font-mono font-bold" style={{ color: r.profit > 0 ? "#16a34a" : "#dc2626" }}>
                  {r.profit >= 0 ? "+" : ""}${Math.round(r.profit)}
                </div>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function TeamPanel({ label, icon, rows }: { label: string; icon?: "up" | "down"; rows: TeamRow[] }) {
  return (
    <div className="rounded-xl border overflow-hidden" style={{ background: "#fff", borderColor: "rgba(0,0,0,0.08)" }}>
      <div className="flex items-center gap-2 px-5 py-3 border-b" style={{ borderColor: "rgba(0,0,0,0.05)" }}>
        {icon === "up" && <TrendingUp size={14} color="#16a34a" />}
        {icon === "down" && <TrendingDown size={14} color="#dc2626" />}
        <span className="text-sm font-semibold">{label}</span>
      </div>
      {rows.length === 0 ? (
        <div className="px-5 py-4 text-sm text-center" style={{ color: "rgba(0,0,0,0.45)" }}>
          Not enough data yet
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
              <div className="text-xs text-right" style={{ color: "rgba(0,0,0,0.55)" }}>
                {r.wins}W/{r.losses}L
              </div>
              <div className="ml-3 text-sm font-mono font-bold w-14 text-right" style={{ color: r.hitRate >= 50 ? "#16a34a" : r.hitRate < 25 ? "#dc2626" : "#0a0a0a" }}>
                {r.hitRate.toFixed(0)}%
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RecentList({ label, tone, rows }: { label: string; tone: "green" | "red"; rows: PickRow[] }) {
  const accent = tone === "green" ? "#16a34a" : "#dc2626";
  return (
    <section className="rounded-xl border overflow-hidden" style={{ background: "#fff", borderColor: "rgba(0,0,0,0.08)" }}>
      <div className="px-5 py-3 border-b" style={{ borderColor: "rgba(0,0,0,0.05)" }}>
        <span className="text-sm font-semibold">{label}</span>
      </div>
      {rows.length === 0 ? (
        <div className="px-5 py-6 text-sm text-center" style={{ color: "rgba(0,0,0,0.45)" }}>
          None yet
        </div>
      ) : (
        <div>
          {rows.map((p) => (
            <div
              key={p.id}
              className="px-5 py-3 border-b"
              style={{ borderColor: "rgba(0,0,0,0.04)" }}
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="flex items-center gap-2 flex-wrap text-xs" style={{ color: "rgba(0,0,0,0.55)" }}>
                  <span className="font-mono font-bold" style={{ color: accent }}>
                    {p.profitAtUnit >= 0 ? "+" : ""}${p.profitAtUnit.toFixed(0)}
                  </span>
                  <span>· conf {p.confidence}%</span>
                  <span>· {formatRelative(p.createdAt)}</span>
                </div>
              </div>
              <div className="text-xs space-y-0.5" style={{ color: "rgba(0,0,0,0.7)" }}>
                {p.legs.map((leg, i) => (
                  <div key={i} className="truncate">
                    {leg.pick}
                    {leg.odds !== undefined && <span className="font-mono" style={{ color: "rgba(0,0,0,0.45)" }}> ({leg.odds > 0 ? "+" : ""}{leg.odds})</span>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
