"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/app/components/AuthProvider";
import { ArrowLeft, Shield, RefreshCw, Snowflake } from "lucide-react";

interface Goalie {
  player_id: number;
  goalie_name: string;
  team_abbrev: string;
  games_played: number | null;
  games_started: number | null;
  wins: number | null;
  losses: number | null;
  save_pct: number | null;
  gaa: number | null;
  shutouts: number | null;
  shots_against: number | null;
  updated_at: string;
}

interface NhlData {
  goalies: Goalie[];
  last_update: string | null;
  message?: string;
}

function svPctTone(svPct: number | null): { color: string; label: string } {
  if (svPct === null) return { color: "rgba(255,255,255,0.3)", label: "—" };
  // League-average save % is around .910. Below .895 is bottom tier;
  // above .920 is elite.
  if (svPct >= 0.92) return { color: "#22c55e", label: "Elite" };
  if (svPct >= 0.91) return { color: "#a3e635", label: "Above avg" };
  if (svPct >= 0.9) return { color: "rgba(255,255,255,0.55)", label: "Average" };
  if (svPct >= 0.895) return { color: "#f59e0b", label: "Below avg" };
  return { color: "#ef4444", label: "Struggling" };
}

export default function NhlStatsAdminPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const [data, setData] = useState<NhlData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshResult, setRefreshResult] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/nhl-stats", { cache: "no-store" });
      const json = (await res.json()) as NhlData;
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
      const res = await fetch("/api/cron/fetch-nhl-stats", { cache: "no-store" });
      const json = await res.json();
      if (json.error) {
        setRefreshResult(`Error: ${json.error}`);
      } else {
        setRefreshResult(`Upserted ${json.upserted ?? 0} goalies (${json.fetched ?? 0} fetched)`);
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

  // Sort: starters first (games_started desc), then by save_pct
  const sorted = data
    ? [...data.goalies].sort((a, b) => {
        const ga = a.games_started ?? 0;
        const gb = b.games_started ?? 0;
        if (gb !== ga) return gb - ga;
        return (b.save_pct ?? 0) - (a.save_pct ?? 0);
      })
    : [];

  return (
    <div className="min-h-screen" style={{ background: "#0a0a0a", color: "#ededed" }}>
      <div className="max-w-[1200px] mx-auto px-6 py-10">
        <Link href="/admin" className="inline-flex items-center gap-2 text-sm mb-8" style={{ color: "rgba(255,255,255,0.5)" }}>
          <ArrowLeft size={14} /> Back to Admin
        </Link>

        <div className="flex items-center gap-3 mb-3">
          <Snowflake size={28} style={{ color: "#FF3B3B" }} />
          <h1 className="text-4xl md:text-5xl" style={{ fontFamily: "'DM Serif Display', serif" }}>
            NHL Goalies
          </h1>
        </div>
        <p className="text-sm mb-3 max-w-3xl" style={{ color: "rgba(255,255,255,0.55)", lineHeight: 1.6 }}>
          Season-to-date goalie stats from the official NHL Stats API. Save %, GAA, games started.
          The starting goalie matchup is the single biggest signal for NHL game-level betting — a
          backup with .885 vs a starter at .920 moves a total by a full goal.
        </p>
        <p className="text-xs mb-8 max-w-3xl" style={{ color: "rgba(255,255,255,0.45)", lineHeight: 1.6 }}>
          <strong style={{ color: "rgba(255,255,255,0.6)" }}>Reading save %:</strong> league average
          ≈ .910. Elite ≥ .920, struggling &lt; .895. The verdict column gives a quick band assignment.
          Player IDs are NHL official IDs — match against any boxscore or live game endpoint.
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

        {loading && (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-10 rounded-lg animate-pulse" style={{ background: "rgba(255,255,255,0.04)" }} />
            ))}
          </div>
        )}

        {!loading && data?.message && data.goalies.length === 0 && (
          <div className="rounded-xl p-10 text-center" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <p className="text-sm" style={{ color: "rgba(255,255,255,0.55)" }}>{data.message}</p>
          </div>
        )}

        {!loading && sorted.length > 0 && (
          <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
            <div className="grid text-[11px] uppercase tracking-wider px-5 py-3" style={{ gridTemplateColumns: "2fr 0.6fr 0.6fr 0.7fr 0.7fr 0.7fr 0.6fr 1fr", background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.45)", fontWeight: 600 }}>
              <div>Goalie</div>
              <div className="text-right">Team</div>
              <div className="text-right">Starts</div>
              <div className="text-right">Record</div>
              <div className="text-right">SV%</div>
              <div className="text-right">GAA</div>
              <div className="text-right">SO</div>
              <div className="text-right">Verdict</div>
            </div>
            {sorted.map((g, idx) => {
              const tone = svPctTone(g.save_pct);
              const record = `${g.wins ?? 0}-${g.losses ?? 0}`;
              return (
                <div key={g.player_id} className="grid items-center px-5 py-2.5 text-sm" style={{ gridTemplateColumns: "2fr 0.6fr 0.6fr 0.7fr 0.7fr 0.7fr 0.6fr 1fr", borderTop: idx === 0 ? "none" : "1px solid rgba(255,255,255,0.06)", fontFamily: "var(--font-geist-mono)" }}>
                  <div style={{ color: "#ededed" }}>{g.goalie_name}</div>
                  <div className="text-right" style={{ color: "rgba(255,255,255,0.65)" }}>{g.team_abbrev}</div>
                  <div className="text-right" style={{ color: "rgba(255,255,255,0.55)" }}>{g.games_started ?? "—"}</div>
                  <div className="text-right" style={{ color: "rgba(255,255,255,0.7)" }}>{record}</div>
                  <div className="text-right font-bold" style={{ color: tone.color }}>{g.save_pct !== null ? g.save_pct.toFixed(3) : "—"}</div>
                  <div className="text-right" style={{ color: "rgba(255,255,255,0.7)" }}>{g.gaa !== null ? g.gaa.toFixed(2) : "—"}</div>
                  <div className="text-right" style={{ color: "rgba(255,255,255,0.55)" }}>{g.shutouts ?? "—"}</div>
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
