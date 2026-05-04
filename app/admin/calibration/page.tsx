"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/app/components/AuthProvider";
import { ArrowLeft, Shield, RefreshCw } from "lucide-react";

interface CalibCell {
  sport: string | null;
  market: string | null;
  odds_bucket: string | null;
  sample_size: number;
  predicted_prob_avg: number;
  actual_hit_rate: number;
  calibration_factor: number;
  notes: string | null;
  computed_at: string;
  avg_clv: number | null;
  clv_sample: number | null;
}

// Same thresholds as the parlay route gate.
const CLV_GATE_BLOCK = -0.3;
const CLV_GATE_MIN_SAMPLE = 40;

function clvVerdict(c: CalibCell): { label: string; color: string } {
  if (c.avg_clv === null || c.clv_sample === null) {
    return { label: "—", color: "rgba(255,255,255,0.3)" };
  }
  if (c.clv_sample < CLV_GATE_MIN_SAMPLE) {
    return { label: `Small (${c.clv_sample})`, color: "rgba(255,255,255,0.4)" };
  }
  if (c.avg_clv <= CLV_GATE_BLOCK) {
    return { label: "BLOCKED", color: "#ef4444" };
  }
  if (c.avg_clv >= 0.5) {
    return { label: "Sharp", color: "#22c55e" };
  }
  if (c.avg_clv > 0) {
    return { label: "Edge", color: "#a3e635" };
  }
  return { label: "Fading", color: "#f59e0b" };
}

const BUCKET_LABEL: Record<string, string> = {
  heavy_fav: "Heavy Fav (≤1.50)",
  fav: "Fav (1.50-1.91)",
  pick: "Pick'em (1.91-2.10)",
  dog: "Dog (2.10-3.00)",
  long: "Longshot (3.00-6.00)",
  moon: "Moon (>6.00)",
};

function cellLabel(c: CalibCell): { primary: string; secondary: string } {
  const parts = [c.sport, c.market, c.odds_bucket].filter(Boolean);
  if (parts.length === 0) return { primary: "Global", secondary: "All sports / markets / odds" };
  const primary = parts.join(" · ");
  const secondary = c.odds_bucket ? (BUCKET_LABEL[c.odds_bucket] ?? c.odds_bucket) : "Any odds";
  return { primary, secondary };
}

function factorTone(factor: number): { color: string; bg: string; verdict: string } {
  if (factor > 1.05) return { color: "#22c55e", bg: "rgba(34,197,94,0.08)", verdict: "Boosted" };
  if (factor < 0.95) return { color: "#ef4444", bg: "rgba(239,68,68,0.08)", verdict: "Penalized" };
  return { color: "rgba(255,255,255,0.55)", bg: "rgba(255,255,255,0.04)", verdict: "Neutral" };
}

export default function CalibrationAdminPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const [cells, setCells] = useState<CalibCell[]>([]);
  const [lastRun, setLastRun] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [recalcResult, setRecalcResult] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/calibration", { cache: "no-store" });
      const json = await res.json();
      setCells(json.cells || []);
      setLastRun(json.last_run);
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

  async function recalc() {
    setRefreshing(true);
    setRecalcResult(null);
    try {
      // Use the admin proxy so this works whether CRON_SECRET is set or
      // not — the proxy runs server-side and attaches the bearer header
      // for us. Direct cron URL would 401 once CRON_SECRET is wired up.
      const res = await fetch("/api/admin/recompute-calibration", { cache: "no-store" });
      const json = await res.json();
      if (json.error) {
        setRecalcResult(`Error: ${json.error}`);
      } else {
        setRecalcResult(
          `Recomputed. ${json.legs_graded ?? 0} legs · ${json.written ?? 0} cells written.`,
        );
        await load();
      }
    } catch (e) {
      setRecalcResult(`Error: ${e instanceof Error ? e.message : "fetch failed"}`);
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
      <div className="max-w-[1200px] mx-auto px-6 py-10">
        <Link
          href="/admin"
          className="inline-flex items-center gap-2 text-sm mb-8"
          style={{ color: "rgba(255,255,255,0.5)" }}
        >
          <ArrowLeft size={14} /> Back to Admin
        </Link>

        <h1
          className="text-4xl md:text-5xl mb-3"
          style={{ fontFamily: "'DM Serif Display', serif" }}
        >
          Model Calibration
        </h1>
        <p className="text-sm mb-3 max-w-3xl" style={{ color: "rgba(255,255,255,0.55)", lineHeight: 1.6 }}>
          What the AI has learned from graded results. Each cell is a (sport × market × odds bucket)
          slice with its own multiplier on <code style={{ color: "#ededed" }}>ourProb</code>. Factor
          &gt; 1.0 means the AI under-estimates that bucket and gets boosted; &lt; 1.0 means it
          over-estimates and gets penalized. Cascade order: most-specific cell wins, falling back to
          less specific.
        </p>
        <p className="text-xs mb-3 max-w-3xl" style={{ color: "rgba(255,255,255,0.45)", lineHeight: 1.6 }}>
          <strong style={{ color: "rgba(255,255,255,0.6)" }}>CLV gate:</strong> rolling 60-day average
          closing line value per bucket. Buckets with avg CLV ≤ −0.30% on ≥{CLV_GATE_MIN_SAMPLE}{" "}
          graded legs are <span style={{ color: "#ef4444" }}>blocked</span> from the parlay generator —
          those are the buckets demonstrably losing to the close. Blocked rows are{" "}
          <span style={{ textDecoration: "line-through", color: "rgba(255,255,255,0.5)" }}>
            struck through
          </span>{" "}
          below to show they&apos;re not in use. Sharp / Edge / Fading / Small are informational only.
        </p>
        <p className="text-xs mb-8 max-w-3xl" style={{ color: "rgba(255,255,255,0.45)", lineHeight: 1.6 }}>
          <strong style={{ color: "rgba(255,255,255,0.6)" }}>Exploration:</strong> 5% of would-be-blocked
          legs slip through anyway (epsilon-greedy) so benched buckets keep collecting fresh data. Without
          it, a blocked bucket would starve out — we&apos;d never know if its edge came back. Watch the
          <code style={{ color: "#ededed", margin: "0 4px" }}>legsClvExplored</code> count in
          /api/parlays response meta.
        </p>

        <div className="flex items-center gap-3 flex-wrap mb-8">
          <button
            onClick={recalc}
            disabled={refreshing}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-semibold transition-all disabled:opacity-50"
            style={{ background: "#FF3B3B", color: "#0a0a0a" }}
          >
            <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
            {refreshing ? "Recomputing…" : "Recompute Now"}
          </button>
          {lastRun && (
            <span className="text-xs uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.4)" }}>
              Last run · {new Date(lastRun).toLocaleString()}
            </span>
          )}
          {recalcResult && (
            <span className="text-xs" style={{ color: "rgba(255,255,255,0.7)" }}>
              {recalcResult}
            </span>
          )}
        </div>

        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="h-14 rounded-lg animate-pulse"
                style={{ background: "rgba(255,255,255,0.04)" }}
              />
            ))}
          </div>
        ) : cells.length === 0 ? (
          <div
            className="rounded-xl p-10 text-center"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            <p className="text-sm" style={{ color: "rgba(255,255,255,0.55)" }}>
              No calibration cells yet. Hit Recompute Now after enough parlays have graded
              (need 25+ samples per bucket to write a row).
            </p>
          </div>
        ) : (
          <div
            className="rounded-xl overflow-hidden"
            style={{ border: "1px solid rgba(255,255,255,0.08)" }}
          >
            <div
              className="grid text-[11px] uppercase tracking-wider px-5 py-3"
              style={{
                gridTemplateColumns: "1.6fr 0.6fr 0.7fr 0.7fr 0.8fr 0.8fr 0.9fr",
                background: "rgba(255,255,255,0.04)",
                color: "rgba(255,255,255,0.45)",
                fontWeight: 600,
              }}
            >
              <div>Cell</div>
              <div className="text-right">Sample</div>
              <div className="text-right">Predicted</div>
              <div className="text-right">Actual</div>
              <div className="text-right">Factor</div>
              <div className="text-right">CLV (60d)</div>
              <div className="text-right">Verdict</div>
            </div>
            {cells.map((c, idx) => {
              const tone = factorTone(c.calibration_factor);
              const lbl = cellLabel(c);
              const verdict = clvVerdict(c);
              const isBlocked =
                c.avg_clv !== null &&
                c.clv_sample !== null &&
                c.clv_sample >= CLV_GATE_MIN_SAMPLE &&
                c.avg_clv <= CLV_GATE_BLOCK;
              const strike = isBlocked ? ("line-through" as const) : ("none" as const);
              const dim = isBlocked ? 0.45 : 1;
              return (
                <div
                  key={`${c.sport}-${c.market}-${c.odds_bucket}-${idx}`}
                  className="grid items-center px-5 py-4 text-sm"
                  style={{
                    gridTemplateColumns: "1.6fr 0.6fr 0.7fr 0.7fr 0.8fr 0.8fr 0.9fr",
                    borderTop: "1px solid rgba(255,255,255,0.06)",
                    fontFamily: "var(--font-geist-mono)",
                    background: isBlocked ? "rgba(239,68,68,0.05)" : "transparent",
                    opacity: dim,
                  }}
                  title={isBlocked ? "Blocked by CLV gate — not used in parlay generation" : undefined}
                >
                  <div>
                    <div
                      style={{
                        fontFamily: "inherit",
                        color: "#ededed",
                        fontWeight: 600,
                        textDecoration: strike,
                      }}
                    >
                      {lbl.primary}
                    </div>
                    <div
                      className="text-[11px] mt-0.5"
                      style={{ color: "rgba(255,255,255,0.4)", textDecoration: strike }}
                    >
                      {lbl.secondary}
                    </div>
                  </div>
                  <div
                    className="text-right"
                    style={{ color: "rgba(255,255,255,0.7)", textDecoration: strike }}
                  >
                    {c.sample_size}
                  </div>
                  <div
                    className="text-right"
                    style={{ color: "rgba(255,255,255,0.55)", textDecoration: strike }}
                  >
                    {(c.predicted_prob_avg * 100).toFixed(1)}%
                  </div>
                  <div
                    className="text-right"
                    style={{ color: "rgba(255,255,255,0.7)", textDecoration: strike }}
                  >
                    {(c.actual_hit_rate * 100).toFixed(1)}%
                  </div>
                  <div
                    className="text-right font-bold"
                    style={{ color: tone.color, textDecoration: strike }}
                  >
                    {c.calibration_factor.toFixed(3)}×
                  </div>
                  <div
                    className="text-right"
                    style={{
                      color:
                        c.avg_clv === null
                          ? "rgba(255,255,255,0.3)"
                          : c.avg_clv > 0
                            ? "#22c55e"
                            : "#ef4444",
                      textDecoration: strike,
                    }}
                  >
                    {c.avg_clv !== null
                      ? `${c.avg_clv > 0 ? "+" : ""}${c.avg_clv.toFixed(2)}%`
                      : "—"}
                    {c.clv_sample !== null && (
                      <div className="text-[10px] mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>
                        n={c.clv_sample}
                      </div>
                    )}
                  </div>
                  <div
                    className="text-right text-[11px] uppercase tracking-wider"
                    style={{ color: verdict.color, fontWeight: 700 }}
                  >
                    {verdict.label}
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
