"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/app/components/AuthProvider";
import { ArrowLeft, Shield, RefreshCw, Brain } from "lucide-react";

interface RankedWeight {
  name: string;
  weight: number;
}

interface LatestModel {
  id: string;
  trained_at: string;
  model_version: number;
  training_size: number;
  train_loss: number;
  val_loss: number;
  intercept: number;
  feature_count: number;
  ranked_weights: RankedWeight[];
  notes: string | null;
}

interface HistoryRow {
  id: string;
  trained_at: string;
  model_version: number;
  training_size: number;
  train_loss: number;
  val_loss: number;
  notes: string | null;
}

interface ModelData {
  latest: LatestModel | null;
  history: HistoryRow[];
  message?: string;
}

function weightTone(w: number): { color: string; bar: string } {
  // Color is sign-based; magnitude drives bar width separately.
  if (w > 0) return { color: "#22c55e", bar: "#22c55e" };
  if (w < 0) return { color: "#ef4444", bar: "#ef4444" };
  return { color: "rgba(255,255,255,0.5)", bar: "rgba(255,255,255,0.2)" };
}

export default function ModelAdminPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const [data, setData] = useState<ModelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [retraining, setRetraining] = useState(false);
  const [retrainResult, setRetrainResult] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/model", { cache: "no-store" });
      const json = (await res.json()) as ModelData;
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

  async function retrain() {
    setRetraining(true);
    setRetrainResult(null);
    try {
      const res = await fetch("/api/cron/train-model", { cache: "no-store" });
      const json = await res.json();
      if (json.error) {
        setRetrainResult(`Error: ${json.error}`);
      } else if (json.written === 0) {
        setRetrainResult(json.message ?? "No model written.");
      } else {
        setRetrainResult(
          `Trained on ${json.training_size} legs. train_loss=${json.train_loss}, val_loss=${json.val_loss}, epochs=${json.epochs_run}.`,
        );
        await load();
      }
    } catch (e) {
      setRetrainResult(`Error: ${e instanceof Error ? e.message : "fetch failed"}`);
    } finally {
      setRetraining(false);
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

  const latest = data?.latest;
  const maxAbs = latest?.ranked_weights[0]
    ? Math.abs(latest.ranked_weights[0].weight) || 1
    : 1;

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

        <div className="flex items-center gap-3 mb-3">
          <Brain size={28} style={{ color: "#FF3B3B" }} />
          <h1
            className="text-4xl md:text-5xl"
            style={{ fontFamily: "'DM Serif Display', serif" }}
          >
            Trained Model
          </h1>
        </div>
        <p className="text-sm mb-3 max-w-3xl" style={{ color: "rgba(255,255,255,0.55)", lineHeight: 1.6 }}>
          Logistic regression fit nightly on every graded leg. Predicts P(win) per leg from sport,
          market, odds bucket, ourProb, fairProb, evVsFair, sharp-edge flag, and presence of
          weather / pitcher / injury / rest signals. The output blends with the heuristic ourProb
          before calibration and the CLV gate run on top.
        </p>
        <p className="text-xs mb-8 max-w-3xl" style={{ color: "rgba(255,255,255,0.45)", lineHeight: 1.6 }}>
          <strong style={{ color: "rgba(255,255,255,0.6)" }}>Reading the weights:</strong> positive
          weight = feature pushes predicted P(win) up. Negative = pushes down. Continuous features
          (decimalOdds, ourProb, fairProb, evVsFair, bookCount) are z-scored at training time, so a
          weight of +0.4 means &quot;a one-standard-deviation increase in this feature shifts log-odds
          of winning up by 0.4.&quot; Sport / market / bucket weights are one-hot: present (1) or absent
          (0).
        </p>

        <div className="flex items-center gap-3 flex-wrap mb-8">
          <button
            onClick={retrain}
            disabled={retraining}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-semibold transition-all disabled:opacity-50"
            style={{ background: "#FF3B3B", color: "#0a0a0a" }}
          >
            <RefreshCw size={13} className={retraining ? "animate-spin" : ""} />
            {retraining ? "Retraining…" : "Retrain Now"}
          </button>
          {latest && (
            <span className="text-xs uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.4)" }}>
              Last fit · {new Date(latest.trained_at).toLocaleString()} ·{" "}
              {latest.training_size.toLocaleString()} samples
            </span>
          )}
          {retrainResult && (
            <span className="text-xs" style={{ color: "rgba(255,255,255,0.7)" }}>
              {retrainResult}
            </span>
          )}
        </div>

        {loading && (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="h-10 rounded-lg animate-pulse"
                style={{ background: "rgba(255,255,255,0.04)" }}
              />
            ))}
          </div>
        )}

        {!loading && data?.message && !latest && (
          <div
            className="rounded-xl p-10 text-center"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            <p className="text-sm" style={{ color: "rgba(255,255,255,0.55)" }}>
              {data.message}
            </p>
          </div>
        )}

        {!loading && latest && (
          <>
            {/* Training stats summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-10">
              <Stat label="Training Size" value={latest.training_size.toLocaleString()} />
              <Stat label="Train Loss" value={latest.train_loss.toFixed(4)} />
              <Stat
                label="Val Loss"
                value={latest.val_loss.toFixed(4)}
                color={
                  latest.val_loss < latest.train_loss * 1.15
                    ? "#22c55e"
                    : latest.val_loss < latest.train_loss * 1.4
                      ? "#eab308"
                      : "#ef4444"
                }
              />
              <Stat label="Features" value={String(latest.feature_count)} />
            </div>

            {/* Top weights */}
            <h2
              className="text-2xl mb-4"
              style={{ fontFamily: "'DM Serif Display', serif" }}
            >
              Learned Weights
            </h2>
            <div
              className="rounded-xl overflow-hidden mb-12"
              style={{ border: "1px solid rgba(255,255,255,0.08)" }}
            >
              <div
                className="grid text-[11px] uppercase tracking-wider px-5 py-3"
                style={{
                  gridTemplateColumns: "1.4fr 0.8fr 2fr",
                  background: "rgba(255,255,255,0.04)",
                  color: "rgba(255,255,255,0.45)",
                  fontWeight: 600,
                }}
              >
                <div>Feature</div>
                <div className="text-right">Weight</div>
                <div className="text-right">Magnitude</div>
              </div>
              {latest.ranked_weights.slice(0, 30).map((w, idx) => {
                const tone = weightTone(w.weight);
                const pct = Math.min(100, (Math.abs(w.weight) / maxAbs) * 100);
                return (
                  <div
                    key={w.name}
                    className="grid items-center px-5 py-2.5 text-sm"
                    style={{
                      gridTemplateColumns: "1.4fr 0.8fr 2fr",
                      borderTop: idx === 0 ? "none" : "1px solid rgba(255,255,255,0.06)",
                      fontFamily: "var(--font-geist-mono)",
                    }}
                  >
                    <div style={{ color: "#ededed" }}>{w.name}</div>
                    <div className="text-right font-bold" style={{ color: tone.color }}>
                      {w.weight > 0 ? "+" : ""}
                      {w.weight.toFixed(3)}
                    </div>
                    <div className="flex justify-end items-center">
                      <div
                        className="h-2 rounded-full"
                        style={{
                          width: `${pct}%`,
                          background: tone.bar,
                          opacity: 0.7,
                          maxWidth: "100%",
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* History */}
            {data && data.history.length > 1 && (
              <>
                <h2
                  className="text-2xl mb-4"
                  style={{ fontFamily: "'DM Serif Display', serif" }}
                >
                  Training History
                </h2>
                <div
                  className="rounded-xl overflow-hidden"
                  style={{ border: "1px solid rgba(255,255,255,0.08)" }}
                >
                  <div
                    className="grid text-[11px] uppercase tracking-wider px-5 py-3"
                    style={{
                      gridTemplateColumns: "1.6fr 0.8fr 0.8fr 0.8fr 1.2fr",
                      background: "rgba(255,255,255,0.04)",
                      color: "rgba(255,255,255,0.45)",
                      fontWeight: 600,
                    }}
                  >
                    <div>When</div>
                    <div className="text-right">Samples</div>
                    <div className="text-right">Train</div>
                    <div className="text-right">Val</div>
                    <div className="text-right">Notes</div>
                  </div>
                  {data.history.map((h, idx) => (
                    <div
                      key={h.id}
                      className="grid items-center px-5 py-3 text-sm"
                      style={{
                        gridTemplateColumns: "1.6fr 0.8fr 0.8fr 0.8fr 1.2fr",
                        borderTop: idx === 0 ? "none" : "1px solid rgba(255,255,255,0.06)",
                        fontFamily: "var(--font-geist-mono)",
                      }}
                    >
                      <div style={{ color: "rgba(255,255,255,0.7)" }}>
                        {new Date(h.trained_at).toLocaleString()}
                      </div>
                      <div className="text-right" style={{ color: "rgba(255,255,255,0.6)" }}>
                        {h.training_size.toLocaleString()}
                      </div>
                      <div className="text-right" style={{ color: "rgba(255,255,255,0.55)" }}>
                        {h.train_loss.toFixed(4)}
                      </div>
                      <div
                        className="text-right"
                        style={{
                          color:
                            h.val_loss < h.train_loss * 1.15 ? "#22c55e" : "#eab308",
                        }}
                      >
                        {h.val_loss.toFixed(4)}
                      </div>
                      <div
                        className="text-right text-[11px]"
                        style={{ color: "rgba(255,255,255,0.4)" }}
                      >
                        {h.notes ?? "—"}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  color = "#ededed",
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div
      className="rounded-xl p-4"
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <div
        className="text-[10px] uppercase tracking-widest mb-2"
        style={{ color: "rgba(255,255,255,0.4)" }}
      >
        {label}
      </div>
      <div className="text-xl font-bold" style={{ color, fontFamily: "var(--font-geist-mono)" }}>
        {value}
      </div>
    </div>
  );
}
