"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { AppNav } from "@/app/components/AppNav";
import { useAuth } from "@/app/components/AuthProvider";

interface Result {
  filters: {
    minEv: number;
    maxEv: number;
    minConf: number;
    maxConf: number;
    sports: string[];
    legs: number[];
    stake: number;
  };
  sample: { pulled: number; matched: number };
  summary: {
    won: number;
    lost: number;
    winRate: number;
    totalStaked: number;
    profit: number;
    roi: number;
  };
  bySport: Array<{
    sport: string;
    won: number;
    lost: number;
    total: number;
    profit: number;
    winRate: number;
  }>;
  byLegs: Array<{
    legs: number;
    label: string;
    won: number;
    lost: number;
    total: number;
    profit: number;
    winRate: number;
  }>;
}

const ALL_SPORTS = ["MLB", "NBA", "NHL", "NFL", "NCAAB", "NCAAF"];
const ALL_LEGS = [2, 3, 4, 5];

export default function BacktestPage() {
  const { isAdmin, loading: authLoading } = useAuth();

  const [minEv, setMinEv] = useState(0);
  const [maxEv, setMaxEv] = useState(200);
  const [minConf, setMinConf] = useState(0);
  const [maxConf, setMaxConf] = useState(100);
  const [sports, setSports] = useState<string[]>([]);
  const [legs, setLegs] = useState<number[]>([]);
  const [stake, setStake] = useState(10);

  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);

  const runQuery = useCallback(async () => {
    setLoading(true);
    const sp = new URLSearchParams({
      minEv: String(minEv),
      maxEv: String(maxEv),
      minConf: String(minConf),
      maxConf: String(maxConf),
      stake: String(stake),
    });
    if (sports.length > 0) sp.set("sports", sports.join(","));
    if (legs.length > 0) sp.set("legs", legs.join(","));
    try {
      const res = await fetch(`/api/admin/research/backtest?${sp.toString()}`, {
        cache: "no-store",
      });
      if (res.ok) setResult(await res.json());
    } finally {
      setLoading(false);
    }
  }, [minEv, maxEv, minConf, maxConf, sports, legs, stake]);

  useEffect(() => {
    runQuery();
  }, [runQuery]);

  if (authLoading) return <div className="min-h-screen bg-[#FAFAF7]" />;

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-[#FAFAF7]">
        <AppNav />
        <div className="pt-32 px-6 max-w-xl mx-auto text-center">
          <h1 className="text-3xl font-serif mb-4">Admin only</h1>
          <Link href="/" className="text-sm text-black/60 underline">← Home</Link>
        </div>
      </div>
    );
  }

  const profitColor =
    result && result.summary.profit > 0
      ? "#22C55E"
      : result && result.summary.profit < 0
        ? "#EF4444"
        : "#0a0a0a";

  return (
    <div className="min-h-screen bg-[#FAFAF7]">
      <AppNav />
      <main className="pt-24 pb-16 px-4 md:px-8 max-w-[1100px] mx-auto">
        <header className="mb-10">
          <Link
            href="/admin/research"
            className="text-xs uppercase tracking-widest text-black/45 hover:text-black/70"
          >
            ← All research
          </Link>
          <h1
            className="text-4xl md:text-5xl font-normal mt-3 mb-3"
            style={{ fontFamily: "'DM Serif Display', serif" }}
          >
            Backtest
          </h1>
          <p className="text-base text-black/55 max-w-2xl leading-relaxed">
            Drag sliders. See what would have made money on real resolved
            history. Find the &quot;golden zone&quot; of filters that beat the
            full slate.
          </p>
        </header>

        {/* Filter controls */}
        <div
          className="rounded-2xl p-6 mb-6 bg-white"
          style={{ border: "1px solid rgba(0,0,0,0.06)" }}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* EV range */}
            <div>
              <label className="text-xs uppercase tracking-widest text-black/55 font-semibold">
                EV % range
              </label>
              <div
                className="mt-2 text-sm"
                style={{ fontFamily: "var(--font-geist-mono)" }}
              >
                {minEv}% — {maxEv === 200 ? "∞" : `${maxEv}%`}
              </div>
              <div className="mt-3 flex items-center gap-3">
                <input
                  type="range"
                  min={0}
                  max={200}
                  step={5}
                  value={minEv}
                  onChange={(e) => setMinEv(Number(e.target.value))}
                  className="flex-1"
                />
                <input
                  type="range"
                  min={0}
                  max={200}
                  step={5}
                  value={maxEv}
                  onChange={(e) => setMaxEv(Number(e.target.value))}
                  className="flex-1"
                />
              </div>
            </div>

            {/* Confidence range */}
            <div>
              <label className="text-xs uppercase tracking-widest text-black/55 font-semibold">
                Confidence range
              </label>
              <div
                className="mt-2 text-sm"
                style={{ fontFamily: "var(--font-geist-mono)" }}
              >
                {minConf} — {maxConf}
              </div>
              <div className="mt-3 flex items-center gap-3">
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={minConf}
                  onChange={(e) => setMinConf(Number(e.target.value))}
                  className="flex-1"
                />
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={maxConf}
                  onChange={(e) => setMaxConf(Number(e.target.value))}
                  className="flex-1"
                />
              </div>
            </div>

            {/* Sports */}
            <div>
              <label className="text-xs uppercase tracking-widest text-black/55 font-semibold">
                Sports {sports.length === 0 && <span className="text-black/40 normal-case">(all)</span>}
              </label>
              <div className="mt-3 flex flex-wrap gap-2">
                {ALL_SPORTS.map((s) => {
                  const active = sports.includes(s);
                  return (
                    <button
                      key={s}
                      onClick={() =>
                        setSports((prev) =>
                          prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
                        )
                      }
                      className="text-xs font-semibold px-3 py-1.5 rounded-full transition-colors"
                      style={{
                        background: active ? "#0a0a0a" : "rgba(0,0,0,0.04)",
                        color: active ? "white" : "rgba(0,0,0,0.7)",
                        border: `1px solid ${active ? "#0a0a0a" : "rgba(0,0,0,0.08)"}`,
                      }}
                    >
                      {s}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Leg counts */}
            <div>
              <label className="text-xs uppercase tracking-widest text-black/55 font-semibold">
                Leg counts {legs.length === 0 && <span className="text-black/40 normal-case">(all)</span>}
              </label>
              <div className="mt-3 flex flex-wrap gap-2">
                {ALL_LEGS.map((n) => {
                  const active = legs.includes(n);
                  return (
                    <button
                      key={n}
                      onClick={() =>
                        setLegs((prev) =>
                          prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n],
                        )
                      }
                      className="text-xs font-semibold px-3 py-1.5 rounded-full transition-colors"
                      style={{
                        background: active ? "#0a0a0a" : "rgba(0,0,0,0.04)",
                        color: active ? "white" : "rgba(0,0,0,0.7)",
                        border: `1px solid ${active ? "#0a0a0a" : "rgba(0,0,0,0.08)"}`,
                      }}
                    >
                      {n}L
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Stake */}
            <div>
              <label className="text-xs uppercase tracking-widest text-black/55 font-semibold">
                Unit stake (for ROI math)
              </label>
              <div
                className="mt-2 text-sm"
                style={{ fontFamily: "var(--font-geist-mono)" }}
              >
                ${stake}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {[5, 10, 25, 50, 100].map((s) => (
                  <button
                    key={s}
                    onClick={() => setStake(s)}
                    className="text-xs font-semibold px-3 py-1.5 rounded-full transition-colors"
                    style={{
                      background: stake === s ? "#0a0a0a" : "rgba(0,0,0,0.04)",
                      color: stake === s ? "white" : "rgba(0,0,0,0.7)",
                      border: `1px solid ${stake === s ? "#0a0a0a" : "rgba(0,0,0,0.08)"}`,
                    }}
                  >
                    ${s}
                  </button>
                ))}
              </div>
            </div>

            {/* Reset */}
            <div className="flex items-end">
              <button
                onClick={() => {
                  setMinEv(0);
                  setMaxEv(200);
                  setMinConf(0);
                  setMaxConf(100);
                  setSports([]);
                  setLegs([]);
                  setStake(10);
                }}
                className="text-xs text-black/55 hover:text-black/80 underline"
              >
                Reset to all
              </button>
            </div>
          </div>
        </div>

        {/* Result */}
        {loading && <div className="text-sm text-black/40">Computing…</div>}
        {result && (
          <>
            {/* Headline */}
            <div
              className="rounded-2xl p-6 mb-6 bg-white"
              style={{ border: "1px solid rgba(0,0,0,0.06)" }}
            >
              <div className="text-xs uppercase tracking-widest text-black/45 mb-3">
                {result.sample.matched} parlays matched / {result.sample.pulled} resolved
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Stat
                  label="Win Rate"
                  value={`${result.summary.winRate.toFixed(1)}%`}
                  color={result.summary.winRate >= 50 ? "#22C55E" : "#0a0a0a"}
                />
                <Stat
                  label="Record"
                  value={`${result.summary.won}-${result.summary.lost}`}
                  color="#0a0a0a"
                />
                <Stat
                  label={`Profit @ $${result.filters.stake}`}
                  value={`${result.summary.profit >= 0 ? "+" : "-"}$${Math.abs(result.summary.profit).toFixed(0)}`}
                  color={profitColor}
                />
                <Stat
                  label="ROI"
                  value={`${result.summary.roi >= 0 ? "+" : ""}${result.summary.roi.toFixed(1)}%`}
                  color={profitColor}
                />
              </div>
            </div>

            {/* Per-sport */}
            {result.bySport.length > 0 && (
              <div
                className="rounded-2xl p-6 mb-6 bg-white"
                style={{ border: "1px solid rgba(0,0,0,0.06)" }}
              >
                <h3 className="text-xs uppercase tracking-widest text-black/55 mb-4 font-semibold">
                  By Sport (within filter)
                </h3>
                <div className="space-y-2">
                  {result.bySport.map((s) => (
                    <BreakdownRow
                      key={s.sport}
                      label={s.sport}
                      record={`${s.won}-${s.lost}`}
                      winRate={s.winRate}
                      profit={s.profit}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Per-legs */}
            {result.byLegs.length > 0 && (
              <div
                className="rounded-2xl p-6 bg-white"
                style={{ border: "1px solid rgba(0,0,0,0.06)" }}
              >
                <h3 className="text-xs uppercase tracking-widest text-black/55 mb-4 font-semibold">
                  By Leg Count (within filter)
                </h3>
                <div className="space-y-2">
                  {result.byLegs.map((l) => (
                    <BreakdownRow
                      key={l.legs}
                      label={l.label}
                      record={`${l.won}-${l.lost}`}
                      winRate={l.winRate}
                      profit={l.profit}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-widest text-black/45 mb-1">{label}</div>
      <div
        className="text-2xl md:text-3xl font-bold"
        style={{ color, fontFamily: "var(--font-geist-mono)" }}
      >
        {value}
      </div>
    </div>
  );
}

function BreakdownRow({
  label,
  record,
  winRate,
  profit,
}: {
  label: string;
  record: string;
  winRate: number;
  profit: number;
}) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <div className="w-12 font-semibold text-black/70">{label}</div>
      <div
        className="w-16 text-xs text-black/45 text-right"
        style={{ fontFamily: "var(--font-geist-mono)" }}
      >
        {record}
      </div>
      <div className="flex-1 h-6 rounded overflow-hidden" style={{ background: "rgba(0,0,0,0.04)" }}>
        <div
          className="h-full rounded"
          style={{
            width: `${Math.min(winRate, 100)}%`,
            background: winRate >= 50 ? "#22C55E" : "#0a0a0a",
            opacity: winRate >= 50 ? 0.7 : 0.5,
            minWidth: 2,
          }}
        />
      </div>
      <div
        className="w-20 text-right text-xs font-semibold"
        style={{
          color: profit >= 0 ? "#22C55E" : "#EF4444",
          fontFamily: "var(--font-geist-mono)",
        }}
      >
        {profit >= 0 ? "+" : "-"}${Math.abs(profit).toFixed(0)}
      </div>
      <div
        className="w-14 text-right text-sm font-bold"
        style={{
          color: winRate >= 50 ? "#22c55e" : "#ef4444",
          fontFamily: "var(--font-geist-mono)",
        }}
      >
        {winRate.toFixed(0)}%
      </div>
    </div>
  );
}
