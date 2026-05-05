"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/app/components/AuthProvider";
import { ArrowLeft, Shield, RefreshCw, Trophy } from "lucide-react";

interface NbaTeamRow {
  team_id: number;
  season: number;
  season_type: number;
  team_abbrev: string | null;
  team_name: string | null;
  games_played: number | null;
  points_per_game: number | null;
  points_against_per_game: number | null;
  fg_pct: number | null;
  three_pct: number | null;
  pace: number | null;
  off_rating: number | null;
  def_rating: number | null;
  net_rating: number | null;
  updated_at: string;
}

interface NbaData {
  teams: NbaTeamRow[];
  last_update: string | null;
  message?: string;
}

const SEASON_TYPE_LABEL: Record<number, string> = { 2: "Regular", 3: "Playoffs" };

function netTone(net: number | null): { color: string; label: string } {
  if (net === null) return { color: "rgba(255,255,255,0.3)", label: "—" };
  if (net >= 6) return { color: "#22c55e", label: "Elite" };
  if (net >= 3) return { color: "#a3e635", label: "Strong" };
  if (net >= -3) return { color: "rgba(255,255,255,0.55)", label: "Average" };
  if (net >= -6) return { color: "#f59e0b", label: "Weak" };
  return { color: "#ef4444", label: "Bottom" };
}

export default function NbaStatsAdminPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const [data, setData] = useState<NbaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshResult, setRefreshResult] = useState<string | null>(null);
  const [seasonType, setSeasonType] = useState<2 | 3>(3); // default playoffs in May

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/nba-stats", { cache: "no-store" });
      const json = (await res.json()) as NbaData;
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
      const res = await fetch("/api/cron/fetch-nba-stats", { cache: "no-store" });
      const json = await res.json();
      if (json.error) {
        setRefreshResult(`Error: ${json.error}`);
      } else {
        setRefreshResult(
          `Regular: ${json.regular_season?.upserted ?? 0} · Playoffs: ${json.playoffs?.upserted ?? 0}`,
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

  const filtered = data
    ? data.teams.filter((t) => t.season_type === seasonType)
    : [];
  const sorted = [...filtered].sort((a, b) => (b.net_rating ?? -999) - (a.net_rating ?? -999));

  return (
    <div className="min-h-screen" style={{ background: "#0a0a0a", color: "#ededed" }}>
      <div className="max-w-[1400px] mx-auto px-6 py-10">
        <Link href="/admin" className="inline-flex items-center gap-2 text-sm mb-8" style={{ color: "rgba(255,255,255,0.5)" }}>
          <ArrowLeft size={14} /> Back to Admin
        </Link>

        <div className="flex items-center gap-3 mb-3">
          <Trophy size={28} style={{ color: "#FF3B3B" }} />
          <h1 className="text-4xl md:text-5xl" style={{ fontFamily: "'DM Serif Display', serif" }}>
            NBA Team Stats
          </h1>
        </div>
        <p className="text-sm mb-3 max-w-3xl" style={{ color: "rgba(255,255,255,0.55)", lineHeight: 1.6 }}>
          Per-team season stats from ESPN&apos;s public core API. <code style={{ color: "#ededed" }}>stats.nba.com</code>{" "}
          blocks Vercel-region IPs, so we route around it via ESPN. We pull raw counting stats and
          compute pace + offensive/defensive ratings ourselves since ESPN&apos;s rate fields aren&apos;t
          consistently populated.
        </p>
        <p className="text-xs mb-8 max-w-3xl" style={{ color: "rgba(255,255,255,0.45)", lineHeight: 1.6 }}>
          <strong style={{ color: "rgba(255,255,255,0.6)" }}>Net rating</strong> = points scored per
          100 possessions minus points allowed per 100. League average is 0; elite teams hit +6 or
          better, bottom teams sit at -6 or worse. <strong style={{ color: "rgba(255,255,255,0.6)" }}>Pace</strong>{" "}
          ≈ possessions per 48 min — high-pace teams play in higher-scoring games regardless of
          quality.
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
          {data?.last_update && (
            <span className="text-xs uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.4)" }}>
              Updated {new Date(data.last_update).toLocaleString()}
            </span>
          )}
          {refreshResult && (
            <span className="text-xs" style={{ color: "rgba(255,255,255,0.7)" }}>{refreshResult}</span>
          )}
        </div>

        <div className="flex gap-1 mb-6">
          {[2, 3].map((t) => (
            <button
              key={t}
              onClick={() => setSeasonType(t as 2 | 3)}
              className="px-4 py-2 text-sm transition-colors"
              style={{
                background: seasonType === t ? "rgba(255,59,59,0.18)" : "rgba(255,255,255,0.04)",
                color: seasonType === t ? "#FF3B3B" : "rgba(255,255,255,0.55)",
                fontWeight: seasonType === t ? 600 : 400,
                borderRadius: t === 2 ? "8px 0 0 8px" : "0 8px 8px 0",
              }}
            >
              {SEASON_TYPE_LABEL[t]} ({data?.teams.filter((x) => x.season_type === t).length ?? 0})
            </button>
          ))}
        </div>

        {loading && (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-10 rounded-lg animate-pulse" style={{ background: "rgba(255,255,255,0.04)" }} />
            ))}
          </div>
        )}

        {!loading && data?.message && data.teams.length === 0 && (
          <div className="rounded-xl p-10 text-center" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <p className="text-sm" style={{ color: "rgba(255,255,255,0.55)" }}>{data.message}</p>
          </div>
        )}

        {!loading && sorted.length > 0 && (
          <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
            <div className="grid text-[11px] uppercase tracking-wider px-5 py-3" style={{ gridTemplateColumns: "0.4fr 2fr 0.6fr 0.7fr 0.7fr 0.7fr 0.7fr 0.7fr 0.7fr 1fr", background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.45)", fontWeight: 600 }}>
              <div className="text-right">#</div>
              <div>Team</div>
              <div className="text-right">GP</div>
              <div className="text-right">PPG</div>
              <div className="text-right">OPP</div>
              <div className="text-right">Pace</div>
              <div className="text-right">ORtg</div>
              <div className="text-right">DRtg</div>
              <div className="text-right">Net</div>
              <div className="text-right">Tier</div>
            </div>
            {sorted.map((t, idx) => {
              const tone = netTone(t.net_rating);
              return (
                <div key={`${t.team_id}-${t.season_type}`} className="grid items-center px-5 py-2.5 text-sm" style={{ gridTemplateColumns: "0.4fr 2fr 0.6fr 0.7fr 0.7fr 0.7fr 0.7fr 0.7fr 0.7fr 1fr", borderTop: idx === 0 ? "none" : "1px solid rgba(255,255,255,0.06)", fontFamily: "var(--font-geist-mono)" }}>
                  <div className="text-right" style={{ color: "rgba(255,255,255,0.4)" }}>{idx + 1}</div>
                  <div style={{ color: "#ededed" }}>{t.team_name ?? `Team ${t.team_id}`}</div>
                  <div className="text-right" style={{ color: "rgba(255,255,255,0.55)" }}>{t.games_played ?? "—"}</div>
                  <div className="text-right" style={{ color: "rgba(255,255,255,0.7)" }}>{t.points_per_game?.toFixed(1) ?? "—"}</div>
                  <div className="text-right" style={{ color: "rgba(255,255,255,0.65)" }}>{t.points_against_per_game?.toFixed(1) ?? "—"}</div>
                  <div className="text-right" style={{ color: "rgba(255,255,255,0.7)" }}>{t.pace?.toFixed(1) ?? "—"}</div>
                  <div className="text-right" style={{ color: "rgba(255,255,255,0.7)" }}>{t.off_rating?.toFixed(1) ?? "—"}</div>
                  <div className="text-right" style={{ color: "rgba(255,255,255,0.7)" }}>{t.def_rating?.toFixed(1) ?? "—"}</div>
                  <div className="text-right font-bold" style={{ color: tone.color }}>{t.net_rating !== null ? `${t.net_rating > 0 ? "+" : ""}${t.net_rating.toFixed(1)}` : "—"}</div>
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
