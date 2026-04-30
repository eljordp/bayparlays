"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ChevronRight } from "lucide-react";
import { AppNav } from "@/app/components/AppNav";
import { ResultsTabs } from "@/app/components/ResultsTabs";

interface Strategy {
  id: string;
  name: string;
  description: string;
  picks: number;
  resolved: number;
  wins: number;
  losses: number;
  hitRate: number;
  roi: number;
  profitAtUnit: number;
  avgPayoutWhenWin: number;
  isSweetSpot?: boolean;
}

interface StrategiesResp {
  allTime: Strategy[];
  last7Days: Strategy[];
  unitStake: number;
  sampleNote: string;
}

type Window = "allTime" | "last7Days";

export default function StrategiesPage() {
  const [data, setData] = useState<StrategiesResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [window, setWindow] = useState<Window>("allTime");

  useEffect(() => {
    fetch("/api/track/strategies", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setData(d))
      .finally(() => setLoading(false));
  }, []);

  const rows = window === "allTime" ? data?.allTime ?? [] : data?.last7Days ?? [];
  const unitStake = data?.unitStake ?? 10;

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
              Strategies
            </h1>
            <p
              className="text-lg md:text-xl max-w-2xl"
              style={{ color: "rgba(0,0,0,0.5)", lineHeight: 1.6 }}
            >
              Pick your lane. Each row is a different filter on the AI&apos;s
              published parlays — same picks, different ways to play them.
              Numbers are at ${unitStake} per bet.
            </p>

            {/* Window toggle */}
            <div className="mt-6 inline-flex p-1 rounded-full" style={{ background: "rgba(0,0,0,0.05)" }}>
              {([
                { id: "allTime" as Window, label: "All-Time" },
                { id: "last7Days" as Window, label: "Last 7 Days" },
              ]).map((w) => (
                <button
                  key={w.id}
                  onClick={() => setWindow(w.id)}
                  className="text-xs font-semibold px-4 py-2 rounded-full transition-all"
                  style={{
                    background: window === w.id ? "#0a0a0a" : "transparent",
                    color: window === w.id ? "#fff" : "rgba(0,0,0,0.55)",
                  }}
                >
                  {w.label}
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
              Loading strategies…
            </div>
          ) : rows.length === 0 ? (
            <div
              className="rounded-2xl p-8 text-center"
              style={{ background: "rgba(0,0,0,0.03)", color: "rgba(0,0,0,0.45)" }}
            >
              No data in this window yet. Check back after the next slate resolves.
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div
                className="hidden md:block rounded-2xl overflow-hidden border"
                style={{ borderColor: "rgba(0,0,0,0.08)", background: "#fff" }}
              >
                <div
                  className="grid grid-cols-[2fr_0.7fr_0.7fr_0.7fr_1fr_0.9fr_30px] px-6 py-4 text-xs uppercase tracking-widest"
                  style={{
                    background: "rgba(0,0,0,0.03)",
                    color: "rgba(0,0,0,0.5)",
                    borderBottom: "1px solid rgba(0,0,0,0.06)",
                  }}
                >
                  <div>Strategy</div>
                  <div className="text-right">Picks</div>
                  <div className="text-right">Hit %</div>
                  <div className="text-right">ROI</div>
                  <div className="text-right">Profit @ ${unitStake}</div>
                  <div className="text-right">Avg Win</div>
                  <div />
                </div>
                {rows.map((s, i) => (
                  <Link
                    key={s.id}
                    href={`/strategies/${s.id}`}
                    className="grid grid-cols-[2fr_0.7fr_0.7fr_0.7fr_1fr_0.9fr_30px] px-6 py-5 items-center transition-colors hover:bg-black/[0.02]"
                    style={{
                      borderBottom: i < rows.length - 1 ? "1px solid rgba(0,0,0,0.05)" : "none",
                      background: s.isSweetSpot ? "rgba(255,59,59,0.03)" : "transparent",
                    }}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span
                          className="text-base font-semibold"
                          style={{ color: "#0a0a0a" }}
                        >
                          {s.name}
                        </span>
                        {s.isSweetSpot && (
                          <span
                            className="text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full font-bold"
                            style={{ background: "#FF3B3B", color: "#fff" }}
                          >
                            Recommended
                          </span>
                        )}
                      </div>
                      <div
                        className="text-xs mt-1"
                        style={{ color: "rgba(0,0,0,0.5)" }}
                      >
                        {s.description}
                      </div>
                    </div>
                    <div
                      className="text-right text-sm font-mono"
                      style={{ color: "rgba(0,0,0,0.7)" }}
                    >
                      {s.picks}
                    </div>
                    <div
                      className="text-right text-sm font-mono font-semibold"
                      style={{ color: "#0a0a0a" }}
                    >
                      {s.hitRate.toFixed(1)}%
                    </div>
                    <div
                      className="text-right text-base font-mono font-bold"
                      style={{
                        color:
                          s.roi > 0 ? "#16a34a" : s.roi < 0 ? "#dc2626" : "rgba(0,0,0,0.5)",
                      }}
                    >
                      {s.roi > 0 ? "+" : ""}
                      {s.roi.toFixed(1)}%
                    </div>
                    <div
                      className="text-right text-sm font-mono"
                      style={{
                        color:
                          s.profitAtUnit > 0
                            ? "#16a34a"
                            : s.profitAtUnit < 0
                              ? "#dc2626"
                              : "rgba(0,0,0,0.5)",
                      }}
                    >
                      {s.profitAtUnit >= 0 ? "+" : ""}${Math.round(s.profitAtUnit)}
                    </div>
                    <div
                      className="text-right text-sm font-mono"
                      style={{ color: "rgba(0,0,0,0.6)" }}
                    >
                      ${s.avgPayoutWhenWin.toFixed(0)}
                    </div>
                    <div className="flex justify-end" style={{ color: "rgba(0,0,0,0.35)" }}>
                      <ChevronRight size={16} />
                    </div>
                  </Link>
                ))}
              </div>

              {/* Mobile cards */}
              <div className="md:hidden space-y-3">
                {rows.map((s) => (
                  <Link
                    key={s.id}
                    href={`/strategies/${s.id}`}
                    className="block rounded-xl p-5 border transition-colors hover:bg-black/[0.02]"
                    style={{
                      borderColor: s.isSweetSpot ? "rgba(255,59,59,0.4)" : "rgba(0,0,0,0.08)",
                      background: s.isSweetSpot ? "rgba(255,59,59,0.03)" : "#fff",
                    }}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-lg font-semibold" style={{ color: "#0a0a0a" }}>
                            {s.name}
                          </span>
                          {s.isSweetSpot && (
                            <span
                              className="text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full font-bold"
                              style={{ background: "#FF3B3B", color: "#fff" }}
                            >
                              Pick
                            </span>
                          )}
                        </div>
                        <div className="text-xs mt-1" style={{ color: "rgba(0,0,0,0.55)" }}>
                          {s.description}
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-2 mt-4 pt-4" style={{ borderTop: "1px solid rgba(0,0,0,0.06)" }}>
                      <div>
                        <div className="text-[10px] uppercase tracking-widest" style={{ color: "rgba(0,0,0,0.4)" }}>
                          Picks
                        </div>
                        <div className="text-sm font-mono font-semibold mt-1">{s.picks}</div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-widest" style={{ color: "rgba(0,0,0,0.4)" }}>
                          Hit
                        </div>
                        <div className="text-sm font-mono font-semibold mt-1">{s.hitRate.toFixed(0)}%</div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-widest" style={{ color: "rgba(0,0,0,0.4)" }}>
                          ROI
                        </div>
                        <div
                          className="text-sm font-mono font-bold mt-1"
                          style={{ color: s.roi > 0 ? "#16a34a" : s.roi < 0 ? "#dc2626" : "rgba(0,0,0,0.5)" }}
                        >
                          {s.roi > 0 ? "+" : ""}
                          {s.roi.toFixed(0)}%
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-widest" style={{ color: "rgba(0,0,0,0.4)" }}>
                          Profit
                        </div>
                        <div
                          className="text-sm font-mono font-semibold mt-1"
                          style={{
                            color:
                              s.profitAtUnit > 0 ? "#16a34a" : s.profitAtUnit < 0 ? "#dc2626" : "rgba(0,0,0,0.5)",
                          }}
                        >
                          {s.profitAtUnit >= 0 ? "+" : ""}${Math.round(s.profitAtUnit)}
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>

              <p
                className="mt-6 text-xs"
                style={{ color: "rgba(0,0,0,0.4)", lineHeight: 1.6 }}
              >
                Tap any strategy to see its recent picks, sport breakdown, and 14-day chart. {data?.sampleNote}
              </p>
              <div className="mt-6 flex justify-end">
                <Link
                  href="/postmortem"
                  className="text-xs font-semibold px-4 py-2 rounded-full transition-all"
                  style={{
                    background: "rgba(0,0,0,0.05)",
                    color: "rgba(0,0,0,0.65)",
                  }}
                >
                  Postmortem — what hit, what didn&apos;t →
                </Link>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
