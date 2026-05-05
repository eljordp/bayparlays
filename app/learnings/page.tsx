"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { AppNav } from "@/app/components/AppNav";
import { TrendingUp, ShieldCheck, BarChart3, Brain } from "lucide-react";

interface SharpBucket {
  label: string;
  secondary: string;
  sample_size: number;
  factor: number;
  hit_rate: number;
  predicted: number;
  avg_clv: number | null;
  clv_sample: number | null;
}

interface LearningsData {
  headline: {
    total_graded: number;
    win_rate: number;
    profit_at_unit: number;
    avg_clv: number | null;
    clv_sample: number;
    last_calibration: string | null;
  } | null;
  sharp: SharpBucket[];
  penalized: SharpBucket[];
  cell_count_total: number;
  cell_count_meaningful: number;
}

function formatMoney(n: number): string {
  const abs = Math.abs(n);
  const formatted = abs >= 1000 ? `${(abs / 1000).toFixed(1)}K` : abs.toFixed(0);
  if (n > 0) return `+$${formatted}`;
  if (n < 0) return `-$${formatted}`;
  return "$0";
}

export default function LearningsPage() {
  const [data, setData] = useState<LearningsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/learnings", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setData(j))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen" style={{ background: "#FAFAF7" }}>
      <AppNav />
      <div className="pt-20" />

      <header className="pt-12 pb-12 px-4 md:px-6">
        <div className="max-w-[1200px] mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="flex items-center gap-3 mb-5">
              <Brain size={28} style={{ color: "#0a0a0a" }} />
              <span
                className="text-xs uppercase tracking-widest"
                style={{ color: "rgba(0,0,0,0.5)" }}
              >
                What the AI has actually learned
              </span>
            </div>
            <h1
              className="text-5xl md:text-7xl font-normal leading-[1.05] mb-5"
              style={{ fontFamily: "'DM Serif Display', serif", color: "#0a0a0a" }}
            >
              Where We Have Edge
            </h1>
            <p
              className="text-lg md:text-xl max-w-2xl"
              style={{ color: "rgba(0,0,0,0.55)", lineHeight: 1.6 }}
            >
              Every parlay we&apos;ve ever published is graded against actual results. The model
              tracks which sport / market / odds combinations beat their expected probability —
              and which lose to it. This page is the honest receipts.
            </p>
          </motion.div>
        </div>
      </header>

      <main className="px-4 pb-24 md:px-6">
        <div className="max-w-[1200px] mx-auto">
          {loading && (
            <div className="grid md:grid-cols-4 gap-3 mb-12">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="rounded-xl p-6 animate-pulse"
                  style={{ background: "#FFFFFF", border: "1px solid rgba(0,0,0,0.06)", height: 140 }}
                />
              ))}
            </div>
          )}

          {!loading && data?.headline && (
            <motion.section
              className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-16"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
            >
              <Stat
                label="Parlays Tracked"
                value={data.headline.total_graded.toLocaleString()}
                sublabel="all graded against results"
              />
              <Stat
                label="ROI"
                value={`+${Math.round((data.headline.profit_at_unit / Math.max(1, data.headline.total_graded * 10)) * 1000) / 10}%`}
                sublabel={`${formatMoney(data.headline.profit_at_unit)} at $10/pick`}
                tone="good"
              />
              <Stat
                label="Avg CLV"
                value={
                  data.headline.avg_clv !== null
                    ? `${data.headline.avg_clv >= 0 ? "+" : ""}${data.headline.avg_clv.toFixed(2)}%`
                    : "—"
                }
                sublabel={`across ${data.headline.clv_sample.toLocaleString()} legs`}
                tone={data.headline.avg_clv !== null && data.headline.avg_clv >= 0.25 ? "good" : "neutral"}
              />
              <Stat
                label="Calibration Cells"
                value={String(data.cell_count_meaningful)}
                sublabel="(sport × market × odds bucket)"
              />
            </motion.section>
          )}

          {/* CLV explainer */}
          {!loading && data?.headline && data.headline.avg_clv !== null && (
            <motion.div
              className="rounded-2xl p-5 md:p-6 mb-16"
              style={{
                background: "rgba(34,197,94,0.04)",
                border: "1px solid rgba(34,197,94,0.18)",
              }}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.2 }}
            >
              <p className="text-sm md:text-base" style={{ color: "rgba(0,0,0,0.7)", lineHeight: 1.6 }}>
                <strong style={{ color: "#0a0a0a" }}>What CLV means:</strong> Closing Line Value is
                the sharp-money standard for measuring whether a model has real edge. We compare our
                opening price to the market&apos;s closing line right before tipoff — positive CLV
                means we got a better number than the public eventually settled on.{" "}
                <strong style={{ color: "#15803d" }}>
                  Anything ≥+0.25% over a thousand-leg sample is considered real edge by professional
                  bettors.
                </strong>{" "}
                We&apos;re at <strong style={{ color: "#15803d" }}>+{data.headline.avg_clv.toFixed(2)}%</strong> on{" "}
                <strong style={{ color: "#15803d" }}>{data.headline.clv_sample.toLocaleString()} legs</strong>.
              </p>
            </motion.div>
          )}

          {/* Sharp buckets */}
          {!loading && data && data.sharp.length > 0 && (
            <motion.section
              className="mb-16"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
            >
              <div className="flex items-center gap-3 mb-3">
                <TrendingUp size={20} style={{ color: "#15803d" }} />
                <h2
                  className="text-2xl md:text-3xl"
                  style={{ fontFamily: "'DM Serif Display', serif", color: "#0a0a0a" }}
                >
                  Where We Have Edge
                </h2>
              </div>
              <p
                className="text-sm mb-8 max-w-3xl"
                style={{ color: "rgba(0,0,0,0.55)", lineHeight: 1.6 }}
              >
                Buckets where the model has been <em>under</em>-confident historically. Real
                games hit at higher rates than the AI predicted, so these picks now get a boost
                in live generation. The bigger the boost, the more under-confident the model
                was.
              </p>
              <div className="space-y-2">
                {data.sharp.map((b, idx) => (
                  <BucketRow key={`sharp-${idx}`} bucket={b} tone="good" />
                ))}
              </div>
            </motion.section>
          )}

          {/* Penalized buckets */}
          {!loading && data && data.penalized.length > 0 && (
            <motion.section
              className="mb-16"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.4 }}
            >
              <div className="flex items-center gap-3 mb-3">
                <ShieldCheck size={20} style={{ color: "#dc2626" }} />
                <h2
                  className="text-2xl md:text-3xl"
                  style={{ fontFamily: "'DM Serif Display', serif", color: "#0a0a0a" }}
                >
                  What We Avoid
                </h2>
              </div>
              <p
                className="text-sm mb-8 max-w-3xl"
                style={{ color: "rgba(0,0,0,0.55)", lineHeight: 1.6 }}
              >
                Buckets where the AI has been historically <em>over</em>-confident. These get
                automatically penalized in live picks — and if the gap to closing line is bad
                enough, blocked from generation entirely. The model refuses to pretend it has
                edge it doesn&apos;t.
              </p>
              <div className="space-y-2">
                {data.penalized.map((b, idx) => (
                  <BucketRow key={`pen-${idx}`} bucket={b} tone="bad" />
                ))}
              </div>
            </motion.section>
          )}

          {/* How the system learns */}
          <motion.section
            className="rounded-2xl p-6 md:p-8"
            style={{
              background: "rgba(0,0,0,0.04)",
              border: "1px solid rgba(0,0,0,0.08)",
            }}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.5 }}
          >
            <div className="flex items-center gap-3 mb-4">
              <BarChart3 size={20} style={{ color: "#0a0a0a" }} />
              <h2
                className="text-2xl md:text-3xl"
                style={{ fontFamily: "'DM Serif Display', serif", color: "#0a0a0a" }}
              >
                How the System Learns
              </h2>
            </div>
            <p
              className="text-sm md:text-base mb-4"
              style={{ color: "rgba(0,0,0,0.7)", lineHeight: 1.7 }}
            >
              Every parlay we publish is tracked. The opening odds get snapshotted, the legs get
              graded against real game results, and the closing line gets compared to what we
              took at open. The system runs a calibration pass nightly: for every (sport ×
              market × odds bucket) combination, it computes whether the AI&apos;s claimed
              probability matched what actually happened. If picks in a bucket consistently hit
              less than predicted, the bucket gets penalized. If they hit more, boosted.
            </p>
            <p
              className="text-sm md:text-base"
              style={{ color: "rgba(0,0,0,0.7)", lineHeight: 1.7 }}
            >
              On top of that, a logistic regression model retrains nightly on every graded leg
              and learns which features (sport, market, odds, sharp/square money split,
              pitcher xERA regression, weather, lineup strength) actually predict winners. It
              blends with the heuristic estimate so the AI keeps getting smarter without
              forgetting what the rules already capture. We don&apos;t cherry-pick winners. We
              don&apos;t hide losses. The numbers above are what the data actually says.
            </p>
          </motion.section>
        </div>
      </main>
    </div>
  );
}

/* ─── Stat tile ─── */

function Stat({
  label,
  value,
  sublabel,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sublabel: string;
  tone?: "good" | "neutral";
}) {
  const valueColor = tone === "good" ? "#15803d" : "#0a0a0a";
  return (
    <div
      className="rounded-xl p-5 md:p-6"
      style={{
        background: "#FFFFFF",
        border: "1px solid rgba(0,0,0,0.06)",
      }}
    >
      <div
        className="text-xs uppercase tracking-wider font-medium mb-3"
        style={{ color: "rgba(0,0,0,0.45)" }}
      >
        {label}
      </div>
      <div
        className="text-3xl md:text-4xl font-bold tracking-tight mb-2"
        style={{ color: valueColor, fontFamily: "var(--font-geist-mono)" }}
      >
        {value}
      </div>
      <div className="text-xs" style={{ color: "rgba(0,0,0,0.45)" }}>
        {sublabel}
      </div>
    </div>
  );
}

/* ─── Bucket row (sharp or penalized) ─── */

function BucketRow({ bucket, tone }: { bucket: SharpBucket; tone: "good" | "bad" }) {
  const factorPct = Math.round((bucket.factor - 1) * 1000) / 10;
  const factorColor = tone === "good" ? "#15803d" : "#dc2626";
  const tagColor = tone === "good" ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)";
  const tagBorder = tone === "good" ? "rgba(34,197,94,0.25)" : "rgba(239,68,68,0.25)";
  const factorPrefix = factorPct > 0 ? "+" : "";
  return (
    <div
      className="rounded-xl p-4 md:p-5 flex flex-col md:flex-row md:items-center gap-3 md:gap-6"
      style={{
        background: "#FFFFFF",
        border: "1px solid rgba(0,0,0,0.06)",
      }}
    >
      <div className="flex-1 min-w-0">
        <div className="text-base font-semibold" style={{ color: "#0a0a0a" }}>
          {bucket.label}
        </div>
        <div className="text-xs mt-0.5" style={{ color: "rgba(0,0,0,0.5)" }}>
          {bucket.secondary} · sample {bucket.sample_size.toLocaleString()}
        </div>
      </div>
      <div className="flex items-center gap-4 md:gap-8 text-xs flex-wrap">
        <div>
          <div className="uppercase tracking-widest mb-0.5" style={{ color: "rgba(0,0,0,0.4)" }}>
            Predicted
          </div>
          <div style={{ color: "rgba(0,0,0,0.7)", fontFamily: "var(--font-geist-mono)" }}>
            {(bucket.predicted * 100).toFixed(1)}%
          </div>
        </div>
        <div>
          <div className="uppercase tracking-widest mb-0.5" style={{ color: "rgba(0,0,0,0.4)" }}>
            Actual
          </div>
          <div style={{ color: "rgba(0,0,0,0.85)", fontFamily: "var(--font-geist-mono)", fontWeight: 600 }}>
            {(bucket.hit_rate * 100).toFixed(1)}%
          </div>
        </div>
        {bucket.avg_clv !== null && (
          <div>
            <div className="uppercase tracking-widest mb-0.5" style={{ color: "rgba(0,0,0,0.4)" }}>
              CLV
            </div>
            <div
              style={{
                color: bucket.avg_clv >= 0 ? "#15803d" : "#dc2626",
                fontFamily: "var(--font-geist-mono)",
                fontWeight: 600,
              }}
            >
              {bucket.avg_clv >= 0 ? "+" : ""}
              {bucket.avg_clv.toFixed(2)}%
            </div>
          </div>
        )}
      </div>
      <div
        className="px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest md:ml-2 self-start md:self-auto"
        style={{
          color: factorColor,
          background: tagColor,
          border: `1px solid ${tagBorder}`,
        }}
      >
        {factorPrefix}{factorPct}% {tone === "good" ? "boost" : "penalty"}
      </div>
    </div>
  );
}
