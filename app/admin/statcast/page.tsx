"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/app/components/AuthProvider";
import { ArrowLeft, Shield, RefreshCw, Activity } from "lucide-react";

interface Pitcher {
  player_id: number;
  player_name: string;
  pa: number | null;
  woba: number | null;
  est_woba: number | null;
  est_woba_diff: number | null;
  era: number | null;
  xera: number | null;
  era_xera_diff: number | null;
  updated_at: string;
}

interface Batter {
  player_id: number;
  player_name: string;
  pa: number | null;
  woba: number | null;
  est_woba: number | null;
  est_woba_diff: number | null;
  barrel_pct: number | null;
  hard_hit_pct: number | null;
  updated_at: string;
}

interface StatcastData {
  pitchers: Pitcher[];
  batters: Batter[];
  last_pitcher_update: string | null;
  last_batter_update: string | null;
  message?: string;
}

function regressionTone(diff: number | null, direction: "pitcher" | "batter"): { color: string; label: string } {
  if (diff === null) return { color: "rgba(255,255,255,0.3)", label: "—" };
  // For pitchers: positive est_woba_diff = xWOBA > actual WOBA = pitcher
  // has been LUCKY (giving up softer contact than expected) and is due
  // to regress WORSE. So positive = bad sign for the pitcher's future.
  // For batters: positive diff = hitter has been UNLUCKY (better contact
  // than results show) and is due to regress UP.
  const cutoff = 0.015;
  if (direction === "pitcher") {
    if (diff > cutoff) return { color: "#ef4444", label: "Lucky / fading" };
    if (diff < -cutoff) return { color: "#22c55e", label: "Unlucky / sharper" };
  } else {
    if (diff > cutoff) return { color: "#22c55e", label: "Hot regression up" };
    if (diff < -cutoff) return { color: "#ef4444", label: "Cooling regression" };
  }
  return { color: "rgba(255,255,255,0.5)", label: "Aligned" };
}

export default function StatcastAdminPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const [data, setData] = useState<StatcastData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshResult, setRefreshResult] = useState<string | null>(null);
  const [view, setView] = useState<"pitchers" | "batters">("pitchers");

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/statcast", { cache: "no-store" });
      const json = (await res.json()) as StatcastData;
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

  async function refresh() {
    setRefreshing(true);
    setRefreshResult(null);
    try {
      const res = await fetch("/api/cron/fetch-statcast", { cache: "no-store" });
      const json = await res.json();
      if (json.error) {
        setRefreshResult(`Error: ${json.error}`);
      } else {
        setRefreshResult(
          `Pitchers ${json.pitchers?.upserted ?? 0} · Batters ${json.batters?.upserted ?? 0}`,
        );
        await load();
      }
    } catch (e) {
      setRefreshResult(`Error: ${e instanceof Error ? e.message : "fetch failed"}`);
    } finally {
      setRefreshing(false);
    }
  }

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#0a0a0a" }}>
        <div className="w-8 h-8 rounded-full border-2 animate-spin" style={{ borderColor: "rgba(255,59,59,0.2)", borderTopColor: "#FF3B3B" }} />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6" style={{ background: "#0a0a0a" }}>
        <Shield size={32} style={{ color: "#FF3B3B" }} />
        <h1 className="text-2xl font-semibold" style={{ color: "#ededed" }}>Access Denied</h1>
        <Link href="/login" className="px-6 py-3 rounded-full text-sm font-semibold" style={{ background: "#FF3B3B", color: "#0a0a0a" }}>Sign In</Link>
      </div>
    );
  }

  // Sort by regression magnitude — biggest gaps surface first
  const sortedPitchers = data
    ? [...data.pitchers].sort((a, b) => Math.abs(b.est_woba_diff ?? 0) - Math.abs(a.est_woba_diff ?? 0))
    : [];
  const sortedBatters = data
    ? [...data.batters].sort((a, b) => Math.abs(b.est_woba_diff ?? 0) - Math.abs(a.est_woba_diff ?? 0))
    : [];

  return (
    <div className="min-h-screen" style={{ background: "#0a0a0a", color: "#ededed" }}>
      <div className="max-w-[1400px] mx-auto px-6 py-10">
        <Link href="/admin" className="inline-flex items-center gap-2 text-sm mb-8" style={{ color: "rgba(255,255,255,0.5)" }}>
          <ArrowLeft size={14} /> Back to Admin
        </Link>

        <div className="flex items-center gap-3 mb-3">
          <Activity size={28} style={{ color: "#FF3B3B" }} />
          <h1 className="text-4xl md:text-5xl" style={{ fontFamily: "'DM Serif Display', serif" }}>
            Statcast (Baseball Savant)
          </h1>
        </div>
        <p className="text-sm mb-3 max-w-3xl" style={{ color: "rgba(255,255,255,0.55)", lineHeight: 1.6 }}>
          Premium MLB advanced stats — xWOBA, xBA, xSLG, xERA — pulled from Baseball Savant&apos;s
          public CSV exports. Free, updates daily. Player IDs match MLB Stats API so cross-referencing
          probable pitchers is direct.
        </p>
        <p className="text-xs mb-8 max-w-3xl" style={{ color: "rgba(255,255,255,0.45)", lineHeight: 1.6 }}>
          <strong style={{ color: "rgba(255,255,255,0.6)" }}>Reading the regression signal:</strong>{" "}
          <code style={{ color: "#ededed" }}>est_woba_diff</code> = xWOBA − actual wOBA. For
          pitchers, a positive value means xWOBA is higher than what they&apos;ve given up — they&apos;ve
          been lucky and should regress worse. Negative = unlucky, due to perform better.
          For batters the direction flips: positive = unlucky, due to break out; negative = lucky,
          due to cool down.
        </p>

        <div className="flex items-center gap-3 flex-wrap mb-6">
          <button
            onClick={refresh}
            disabled={refreshing}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-semibold transition-all disabled:opacity-50"
            style={{ background: "#FF3B3B", color: "#0a0a0a" }}
          >
            <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
            {refreshing ? "Refreshing…" : "Refresh Now"}
          </button>
          {(data?.last_pitcher_update || data?.last_batter_update) && (
            <span className="text-xs uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.4)" }}>
              Updated {new Date(data?.last_pitcher_update ?? data?.last_batter_update ?? "").toLocaleString()}
            </span>
          )}
          {refreshResult && (
            <span className="text-xs" style={{ color: "rgba(255,255,255,0.7)" }}>{refreshResult}</span>
          )}
        </div>

        <div className="flex gap-1 mb-6">
          <button
            onClick={() => setView("pitchers")}
            className="px-4 py-2 text-sm rounded-l-lg transition-colors"
            style={{
              background: view === "pitchers" ? "rgba(255,59,59,0.18)" : "rgba(255,255,255,0.04)",
              color: view === "pitchers" ? "#FF3B3B" : "rgba(255,255,255,0.55)",
              fontWeight: view === "pitchers" ? 600 : 400,
            }}
          >
            Pitchers ({data?.pitchers.length ?? 0})
          </button>
          <button
            onClick={() => setView("batters")}
            className="px-4 py-2 text-sm rounded-r-lg transition-colors"
            style={{
              background: view === "batters" ? "rgba(255,59,59,0.18)" : "rgba(255,255,255,0.04)",
              color: view === "batters" ? "#FF3B3B" : "rgba(255,255,255,0.55)",
              fontWeight: view === "batters" ? 600 : 400,
            }}
          >
            Batters ({data?.batters.length ?? 0})
          </button>
        </div>

        {loading && (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-10 rounded-lg animate-pulse" style={{ background: "rgba(255,255,255,0.04)" }} />
            ))}
          </div>
        )}

        {!loading && data?.message && (data.pitchers.length === 0 && data.batters.length === 0) && (
          <div className="rounded-xl p-10 text-center" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <p className="text-sm" style={{ color: "rgba(255,255,255,0.55)" }}>{data.message}</p>
          </div>
        )}

        {!loading && view === "pitchers" && sortedPitchers.length > 0 && (
          <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
            <div className="grid text-[11px] uppercase tracking-wider px-5 py-3" style={{ gridTemplateColumns: "2fr 0.6fr 0.7fr 0.7fr 0.7fr 0.7fr 0.7fr 0.7fr 1fr", background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.45)", fontWeight: 600 }}>
              <div>Pitcher</div>
              <div className="text-right">PA</div>
              <div className="text-right">wOBA</div>
              <div className="text-right">xWOBA</div>
              <div className="text-right">Diff</div>
              <div className="text-right">ERA</div>
              <div className="text-right">xERA</div>
              <div className="text-right">Diff</div>
              <div className="text-right">Regression</div>
            </div>
            {sortedPitchers.slice(0, 50).map((p, idx) => {
              const tone = regressionTone(p.est_woba_diff, "pitcher");
              return (
                <div key={p.player_id} className="grid items-center px-5 py-2.5 text-sm" style={{ gridTemplateColumns: "2fr 0.6fr 0.7fr 0.7fr 0.7fr 0.7fr 0.7fr 0.7fr 1fr", borderTop: idx === 0 ? "none" : "1px solid rgba(255,255,255,0.06)", fontFamily: "var(--font-geist-mono)" }}>
                  <div style={{ color: "#ededed" }}>{p.player_name}</div>
                  <div className="text-right" style={{ color: "rgba(255,255,255,0.55)" }}>{p.pa ?? "—"}</div>
                  <div className="text-right" style={{ color: "rgba(255,255,255,0.7)" }}>{p.woba?.toFixed(3) ?? "—"}</div>
                  <div className="text-right" style={{ color: "rgba(255,255,255,0.7)" }}>{p.est_woba?.toFixed(3) ?? "—"}</div>
                  <div className="text-right font-bold" style={{ color: tone.color }}>{p.est_woba_diff !== null ? `${p.est_woba_diff >= 0 ? "+" : ""}${p.est_woba_diff.toFixed(3)}` : "—"}</div>
                  <div className="text-right" style={{ color: "rgba(255,255,255,0.7)" }}>{p.era?.toFixed(2) ?? "—"}</div>
                  <div className="text-right" style={{ color: "rgba(255,255,255,0.7)" }}>{p.xera?.toFixed(2) ?? "—"}</div>
                  <div className="text-right" style={{ color: tone.color }}>{p.era_xera_diff !== null ? `${p.era_xera_diff >= 0 ? "+" : ""}${p.era_xera_diff.toFixed(2)}` : "—"}</div>
                  <div className="text-right text-[11px] uppercase tracking-wider" style={{ color: tone.color, fontWeight: 700 }}>{tone.label}</div>
                </div>
              );
            })}
          </div>
        )}

        {!loading && view === "batters" && sortedBatters.length > 0 && (
          <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
            <div className="grid text-[11px] uppercase tracking-wider px-5 py-3" style={{ gridTemplateColumns: "2fr 0.6fr 0.7fr 0.7fr 0.7fr 0.8fr 0.8fr 1fr", background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.45)", fontWeight: 600 }}>
              <div>Batter</div>
              <div className="text-right">PA</div>
              <div className="text-right">wOBA</div>
              <div className="text-right">xWOBA</div>
              <div className="text-right">Diff</div>
              <div className="text-right">Brl%</div>
              <div className="text-right">HardHit%</div>
              <div className="text-right">Regression</div>
            </div>
            {sortedBatters.slice(0, 50).map((b, idx) => {
              const tone = regressionTone(b.est_woba_diff, "batter");
              return (
                <div key={b.player_id} className="grid items-center px-5 py-2.5 text-sm" style={{ gridTemplateColumns: "2fr 0.6fr 0.7fr 0.7fr 0.7fr 0.8fr 0.8fr 1fr", borderTop: idx === 0 ? "none" : "1px solid rgba(255,255,255,0.06)", fontFamily: "var(--font-geist-mono)" }}>
                  <div style={{ color: "#ededed" }}>{b.player_name}</div>
                  <div className="text-right" style={{ color: "rgba(255,255,255,0.55)" }}>{b.pa ?? "—"}</div>
                  <div className="text-right" style={{ color: "rgba(255,255,255,0.7)" }}>{b.woba?.toFixed(3) ?? "—"}</div>
                  <div className="text-right" style={{ color: "rgba(255,255,255,0.7)" }}>{b.est_woba?.toFixed(3) ?? "—"}</div>
                  <div className="text-right font-bold" style={{ color: tone.color }}>{b.est_woba_diff !== null ? `${b.est_woba_diff >= 0 ? "+" : ""}${b.est_woba_diff.toFixed(3)}` : "—"}</div>
                  <div className="text-right" style={{ color: "rgba(255,255,255,0.7)" }}>{b.barrel_pct !== null ? `${b.barrel_pct.toFixed(1)}%` : "—"}</div>
                  <div className="text-right" style={{ color: "rgba(255,255,255,0.7)" }}>{b.hard_hit_pct !== null ? `${b.hard_hit_pct.toFixed(1)}%` : "—"}</div>
                  <div className="text-right text-[11px] uppercase tracking-wider" style={{ color: tone.color, fontWeight: 700 }}>{tone.label}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
