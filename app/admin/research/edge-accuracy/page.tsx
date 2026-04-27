"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppNav } from "@/app/components/AppNav";
import { useAuth } from "@/app/components/AuthProvider";

interface Bucket {
  label: string;
  sample: number;
  predictedHitRate: number | null;
  actualHitRate: number | null;
  diff: number | null;
  verdict: string;
}

interface Response {
  totalSampled: number;
  buckets: Bucket[];
  timestamp: string;
}

export default function EdgeAccuracyPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const [data, setData] = useState<Response | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/research/edge-accuracy", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setData(d))
      .finally(() => setLoading(false));
  }, []);

  if (authLoading) return <div className="min-h-screen bg-[#FAFAF7]" />;

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-[#FAFAF7]">
        <AppNav />
        <div className="pt-32 px-6 max-w-xl mx-auto text-center">
          <h1 className="text-3xl font-serif mb-4">Admin only</h1>
          <p className="text-black/60 mb-6">This research dashboard is internal.</p>
          <Link href="/" className="text-sm text-black/60 underline">← Home</Link>
        </div>
      </div>
    );
  }

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
            Edge Accuracy
          </h1>
          <p className="text-base text-black/55 max-w-2xl leading-relaxed">
            When the AI claims &quot;+8% edge over book,&quot; does the parlay actually
            win 8% more than book-implied? Each row buckets parlays by claimed EV,
            then compares the AI&apos;s predicted hit rate to actual outcomes.
          </p>
        </header>

        {loading && (
          <div className="text-sm text-black/40">Computing across all resolved parlays…</div>
        )}

        {data && (
          <>
            <div className="mb-6 text-xs text-black/45 uppercase tracking-widest">
              {data.totalSampled} resolved parlays sampled · updated {new Date(data.timestamp).toLocaleString()}
            </div>

            {/* Desktop table */}
            <div
              className="hidden md:block bg-white rounded-2xl overflow-hidden"
              style={{ border: "1px solid rgba(0,0,0,0.06)" }}
            >
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-black/[0.06] text-left">
                    <th className="px-4 py-3 font-semibold text-xs uppercase tracking-widest text-black/55">EV Bucket</th>
                    <th className="px-4 py-3 font-semibold text-xs uppercase tracking-widest text-black/55 text-right">Sample</th>
                    <th className="px-4 py-3 font-semibold text-xs uppercase tracking-widest text-black/55 text-right">AI says</th>
                    <th className="px-4 py-3 font-semibold text-xs uppercase tracking-widest text-black/55 text-right">Actual</th>
                    <th className="px-4 py-3 font-semibold text-xs uppercase tracking-widest text-black/55 text-right">Diff</th>
                    <th className="px-4 py-3 font-semibold text-xs uppercase tracking-widest text-black/55">Verdict</th>
                  </tr>
                </thead>
                <tbody>
                  {data.buckets.map((b) => {
                    const diffColor =
                      b.diff === null
                        ? "rgba(0,0,0,0.3)"
                        : Math.abs(b.diff) < 3
                          ? "#0a0a0a"
                          : b.diff > 0
                            ? "#22C55E"
                            : "#EF4444";
                    return (
                      <tr key={b.label} className="border-b border-black/[0.04] last:border-0">
                        <td className="px-4 py-3 text-black/80">{b.label}</td>
                        <td
                          className="px-4 py-3 text-right text-black/55"
                          style={{ fontFamily: "var(--font-geist-mono)" }}
                        >
                          {b.sample}
                        </td>
                        <td
                          className="px-4 py-3 text-right"
                          style={{ fontFamily: "var(--font-geist-mono)" }}
                        >
                          {b.predictedHitRate !== null ? `${b.predictedHitRate.toFixed(1)}%` : "—"}
                        </td>
                        <td
                          className="px-4 py-3 text-right"
                          style={{ fontFamily: "var(--font-geist-mono)" }}
                        >
                          {b.actualHitRate !== null ? `${b.actualHitRate.toFixed(1)}%` : "—"}
                        </td>
                        <td
                          className="px-4 py-3 text-right font-bold"
                          style={{
                            color: diffColor,
                            fontFamily: "var(--font-geist-mono)",
                          }}
                        >
                          {b.diff !== null
                            ? `${b.diff > 0 ? "+" : ""}${b.diff.toFixed(1)}`
                            : "—"}
                        </td>
                        <td className="px-4 py-3 text-xs text-black/55">{b.verdict}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden space-y-3">
              {data.buckets.map((b) => {
                const diffColor =
                  b.diff === null
                    ? "rgba(0,0,0,0.3)"
                    : Math.abs(b.diff) < 3
                      ? "#0a0a0a"
                      : b.diff > 0
                        ? "#22C55E"
                        : "#EF4444";
                return (
                  <div
                    key={b.label}
                    className="bg-white rounded-xl p-4"
                    style={{ border: "1px solid rgba(0,0,0,0.06)" }}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <span className="font-semibold text-black/80 text-sm">{b.label}</span>
                      <span
                        className="text-xs text-black/45"
                        style={{ fontFamily: "var(--font-geist-mono)" }}
                      >
                        n={b.sample}
                      </span>
                    </div>
                    {b.predictedHitRate !== null && b.actualHitRate !== null && (
                      <div className="flex items-end justify-between mb-2">
                        <div>
                          <div
                            className="text-xs text-black/45 uppercase tracking-wider"
                          >
                            AI says
                          </div>
                          <div className="text-lg" style={{ fontFamily: "var(--font-geist-mono)" }}>
                            {b.predictedHitRate.toFixed(1)}%
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-black/45 uppercase tracking-wider">
                            Actual
                          </div>
                          <div className="text-lg" style={{ fontFamily: "var(--font-geist-mono)" }}>
                            {b.actualHitRate.toFixed(1)}%
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-black/45 uppercase tracking-wider">
                            Diff
                          </div>
                          <div
                            className="text-lg font-bold"
                            style={{
                              color: diffColor,
                              fontFamily: "var(--font-geist-mono)",
                            }}
                          >
                            {b.diff !== null && b.diff > 0 ? "+" : ""}
                            {b.diff?.toFixed(1)}
                          </div>
                        </div>
                      </div>
                    )}
                    <div className="text-xs text-black/55">{b.verdict}</div>
                  </div>
                );
              })}
            </div>

            {/* How to read */}
            <div className="mt-10 p-5 rounded-xl bg-black/[0.02] border border-black/[0.06]">
              <h3 className="text-xs uppercase tracking-widest text-black/55 mb-3">How to read</h3>
              <ul className="space-y-2 text-sm text-black/65 leading-relaxed">
                <li>
                  <strong>AI says</strong> is the model&apos;s predicted hit rate
                  (book-implied probability ÷ 100, then inflated by claimed EV%).
                </li>
                <li>
                  <strong>Actual</strong> is the real hit rate of those parlays once games resolved.
                </li>
                <li>
                  <strong>Diff</strong> = Actual − AI says.
                  Green = AI was UNDER-confident (parlays hit more than predicted, you can lean harder).
                  Red = AI was OVER-confident (parlays missed more than predicted, raise the bar before betting).
                  Black = AI was honest within ±3 points.
                </li>
                <li>
                  <strong>Sample &lt; 20</strong> means the row is too thin to trust the verdict yet — wait for more data.
                </li>
              </ul>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
