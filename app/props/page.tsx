"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Logo } from "@/app/components/Logo";
import { NavUser } from "@/app/components/NavUser";
import { useAuth } from "@/app/components/AuthProvider";

// ─── Types (mirrors /api/props response) ─────────────────────────────────────

interface PropRow {
  player: string;
  team: string;
  stat: "points" | "rebounds" | "assists";
  average: number;
  typicalLine: number;
  edge: number;
  games: number;
}

interface PropsResponse {
  points: PropRow[];
  rebounds: PropRow[];
  assists: PropRow[];
  updated: string;
  error?: string;
}

type Tab = "points" | "rebounds" | "assists";

const TABS: { key: Tab; label: string; sublabel: string }[] = [
  { key: "points", label: "Points", sublabel: "Top scorers" },
  { key: "rebounds", label: "Rebounds", sublabel: "Top boards" },
  { key: "assists", label: "Assists", sublabel: "Top dimes" },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function confidenceFromGap(avg: number, line: number): {
  label: string;
  className: string;
} {
  const gap = avg - line;
  if (gap >= 5) {
    return {
      label: "LOCK",
      className: "bg-[#FF3B3B] text-[#0a0a0a]",
    };
  }
  if (gap >= 2.5) {
    return {
      label: "STRONG",
      className: "bg-[#FF3B3B]/20 text-[#FF3B3B] border border-[#FF3B3B]/40",
    };
  }
  if (gap >= 1) {
    return {
      label: "LEAN",
      className: "bg-yellow-500/15 text-yellow-400 border border-yellow-500/30",
    };
  }
  return {
    label: "PASS",
    className: "bg-white/5 text-white/30 border border-white/10",
  };
}

function statLabel(stat: Tab): string {
  return stat.charAt(0).toUpperCase() + stat.slice(1);
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function PropsPage() {
  const { isPro, tier, isAdmin } = useAuth();
  const [data, setData] = useState<PropsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("points");
  const [mobileNav, setMobileNav] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  // VIP+ gate — VIP, admin, or explicit admin bypass
  const hasVipAccess = isAdmin || tier === "vip" || tier === "admin";

  const fetchProps = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/props");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: PropsResponse = await res.json();
      if (json.error) throw new Error(json.error);
      setData(json);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load props");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProps();
  }, [fetchProps]);

  const rows: PropRow[] = data ? data[tab] : [];
  // Non-VIP: show top 3 only, rest locked
  const visibleRows = hasVipAccess ? rows : rows.slice(0, 3);
  const lockedRows = hasVipAccess ? [] : rows.slice(3);

  async function copyPick(row: PropRow) {
    const text = `${row.player} OVER ${row.typicalLine} ${row.stat} (${row.team}) — avg ${row.average} over ${row.games} games`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(`${tab}-${row.player}`);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // ignore
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#ededed]">
      {/* ─── Nav ────────────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 border-b border-white/[0.06] bg-[#0a0a0a]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between px-4 py-5 md:px-5">
          <Link href="/" className="flex items-center">
            <Logo />
          </Link>
          <div className="hidden md:flex items-center gap-6 text-sm text-white/50">
            <Link href="/" className="transition hover:text-white">
              Home
            </Link>
            <Link href="/parlays" className="transition hover:text-white">
              Parlays
            </Link>
            <Link href="/odds" className="transition hover:text-white">
              Odds
            </Link>
            <Link href="/props" className="text-[#FF3B3B] font-medium">
              Props
            </Link>
            <Link href="/builder" className="transition hover:text-white">
              Builder
            </Link>
            <Link href="/results" className="transition hover:text-white">
              Results
            </Link>
            <Link href="/simulator" className="transition hover:text-white">
              Simulator
            </Link>
            <Link href="/my-stats" className="transition hover:text-white">
              My Stats
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <NavUser />
            <button
              onClick={() => setMobileNav(!mobileNav)}
              className="md:hidden flex flex-col items-center justify-center gap-1.5 p-2"
              aria-label="Toggle menu"
            >
              <span className={`block h-0.5 w-5 bg-white/70 transition-transform ${mobileNav ? "translate-y-[4px] rotate-45" : ""}`} />
              <span className={`block h-0.5 w-5 bg-white/70 transition-opacity ${mobileNav ? "opacity-0" : ""}`} />
              <span className={`block h-0.5 w-5 bg-white/70 transition-transform ${mobileNav ? "-translate-y-[4px] -rotate-45" : ""}`} />
            </button>
          </div>
        </div>
        {mobileNav && (
          <div className="md:hidden border-t border-white/[0.06] px-4 pb-4 pt-2 flex flex-col gap-3 text-sm text-white/50">
            <Link href="/" className="transition hover:text-white" onClick={() => setMobileNav(false)}>Home</Link>
            <Link href="/parlays" className="transition hover:text-white" onClick={() => setMobileNav(false)}>Parlays</Link>
            <Link href="/odds" className="transition hover:text-white" onClick={() => setMobileNav(false)}>Odds</Link>
            <Link href="/props" className="text-[#FF3B3B] font-medium" onClick={() => setMobileNav(false)}>Props</Link>
            <Link href="/builder" className="transition hover:text-white" onClick={() => setMobileNav(false)}>Builder</Link>
            <Link href="/results" className="transition hover:text-white" onClick={() => setMobileNav(false)}>Results</Link>
            <Link href="/simulator" className="transition hover:text-white" onClick={() => setMobileNav(false)}>Simulator</Link>
            <Link href="/my-stats" className="transition hover:text-white" onClick={() => setMobileNav(false)}>My Stats</Link>
          </div>
        )}
      </nav>

      <main className="mx-auto max-w-[1400px] px-4 py-10 md:px-5 md:py-16">
        {/* ─── Header ─────────────────────────────────────────────────── */}
        <div className="mb-10 md:mb-14">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#FF3B3B]">
              Prop Analyzer
            </span>
            <span className="h-px flex-1 bg-white/10 max-w-[120px]" />
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full bg-yellow-500/15 text-yellow-400">
              VIP
            </span>
          </div>
          <h1
            className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl leading-[1.05]"
            style={{ fontFamily: "'DM Serif Display', serif" }}
          >
            Player Props
          </h1>
          <p className="mt-4 max-w-2xl text-base text-white/50 leading-relaxed">
            Top statistical picks based on season averages. Combine these with
            moneyline parlays for high-probability locks.
            {data?.updated && (
              <span className="block mt-1 text-xs text-white/30">
                Updated{" "}
                {new Date(data.updated).toLocaleTimeString("en-US", {
                  hour: "numeric",
                  minute: "2-digit",
                  hour12: true,
                })}
              </span>
            )}
          </p>
        </div>

        {/* ─── How This Works Card ────────────────────────────────────── */}
        <div className="mb-10 rounded-xl border border-white/[0.06] bg-gradient-to-br from-[#FF3B3B]/[0.04] to-transparent px-5 py-5 md:px-7 md:py-6">
          <div className="flex items-start gap-4">
            <div className="mt-1 h-10 w-10 rounded-lg bg-[#FF3B3B]/15 flex items-center justify-center shrink-0">
              <span className="text-[#FF3B3B] text-lg font-bold">?</span>
            </div>
            <div>
              <h3
                className="text-lg font-semibold text-white"
                style={{ fontFamily: "'DM Serif Display', serif" }}
              >
                How this works
              </h3>
              <p className="mt-1.5 text-sm text-white/60 leading-relaxed">
                These are players whose season averages significantly exceed
                typical prop lines. Example: if LeBron averages{" "}
                <span className="text-white font-medium">27 PPG</span>, his{" "}
                <span className="text-[#FF3B3B] font-medium">
                  over 24.5 points
                </span>{" "}
                prop has an 80%+ hit rate historically. We flag the biggest
                gaps across the league.
              </p>
            </div>
          </div>
        </div>

        {/* ─── Stat Tabs ──────────────────────────────────────────────── */}
        <div className="mb-8 flex gap-2 overflow-x-auto scrollbar-hide">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`rounded-lg px-5 py-3 text-sm font-semibold transition whitespace-nowrap ${
                tab === t.key
                  ? "bg-[#FF3B3B] text-[#0a0a0a]"
                  : "bg-white/[0.04] text-white/60 hover:bg-white/[0.08] hover:text-white"
              }`}
            >
              <div>{t.label}</div>
              <div className={`text-[10px] font-normal ${tab === t.key ? "text-[#0a0a0a]/60" : "text-white/30"}`}>
                {t.sublabel}
              </div>
            </button>
          ))}
        </div>

        {/* ─── Loading State ──────────────────────────────────────────── */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-32">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-[#FF3B3B]" />
            <p className="mt-4 text-sm text-white/30">
              Pulling season averages from ESPN...
            </p>
          </div>
        )}

        {/* ─── Error State ────────────────────────────────────────────── */}
        {!loading && error && (
          <div className="flex flex-col items-center justify-center py-32">
            <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-6 py-4 text-center">
              <p className="text-sm text-red-400">{error}</p>
              <button
                onClick={fetchProps}
                className="mt-3 text-xs text-white/40 underline hover:text-white"
              >
                Try again
              </button>
            </div>
          </div>
        )}

        {/* ─── Empty State ────────────────────────────────────────────── */}
        {!loading && !error && rows.length === 0 && (
          <div className="flex flex-col items-center justify-center py-32">
            <p className="text-lg text-white/20">
              No {tab} data available right now.
            </p>
            <p className="mt-2 text-sm text-white/10">
              Check back after tonight&apos;s games.
            </p>
          </div>
        )}

        {/* ─── Prop Cards ─────────────────────────────────────────────── */}
        {!loading && !error && rows.length > 0 && (
          <div className="grid gap-3 md:gap-4">
            {visibleRows.map((row, i) => {
              const conf = confidenceFromGap(row.average, row.typicalLine);
              const isCopied = copied === `${tab}-${row.player}`;
              return (
                <div
                  key={`${row.player}-${i}`}
                  className="group grid grid-cols-12 gap-3 md:gap-6 items-center rounded-xl border border-white/[0.06] bg-gradient-to-r from-white/[0.02] to-transparent px-4 py-5 md:px-7 md:py-6 hover:border-white/[0.12] transition-colors"
                >
                  {/* Rank */}
                  <div className="col-span-1 text-white/20 font-mono text-sm md:text-base">
                    {String(i + 1).padStart(2, "0")}
                  </div>

                  {/* Player + team */}
                  <div className="col-span-6 md:col-span-4">
                    <div
                      className="text-base md:text-xl font-bold text-white leading-tight"
                      style={{ fontFamily: "'DM Serif Display', serif" }}
                    >
                      {row.player}
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-white/[0.06] text-white/60">
                        {row.team || "—"}
                      </span>
                      <span className="text-[11px] text-white/30">
                        {row.games} GP
                      </span>
                    </div>
                  </div>

                  {/* Average */}
                  <div className="col-span-5 md:col-span-3 text-right md:text-left">
                    <div className="text-[10px] uppercase tracking-wider text-white/30 mb-1">
                      Season avg
                    </div>
                    <div
                      className="text-3xl md:text-4xl font-bold text-[#FF3B3B] leading-none"
                      style={{ fontFamily: "'DM Serif Display', serif" }}
                    >
                      {row.average.toFixed(1)}
                    </div>
                  </div>

                  {/* Line */}
                  <div className="hidden md:block md:col-span-2">
                    <div className="text-[10px] uppercase tracking-wider text-white/30 mb-1">
                      Typical line
                    </div>
                    <div className="text-lg font-semibold text-white/80">
                      O {row.typicalLine}
                    </div>
                    <div className="text-[11px] text-white/40 mt-0.5">
                      {statLabel(row.stat)}
                    </div>
                  </div>

                  {/* Confidence + copy */}
                  <div className="col-span-12 md:col-span-2 flex md:flex-col items-center md:items-end gap-2 md:gap-2.5 pt-3 md:pt-0 border-t md:border-t-0 border-white/[0.04]">
                    <span
                      className={`text-[10px] font-bold uppercase tracking-[0.15em] px-2.5 py-1 rounded-full ${conf.className}`}
                    >
                      {conf.label}
                    </span>
                    <button
                      onClick={() => copyPick(row)}
                      className="text-[11px] text-white/40 hover:text-white transition-colors underline-offset-2 hover:underline md:hidden"
                    >
                      {isCopied ? "Copied" : "Copy pick"}
                    </button>
                    <button
                      onClick={() => copyPick(row)}
                      className="hidden md:inline text-[11px] text-white/40 hover:text-[#FF3B3B] transition-colors"
                    >
                      {isCopied ? "Copied" : "Copy pick"}
                    </button>

                    {/* Mobile line row */}
                    <div className="md:hidden ml-auto text-right">
                      <div className="text-[10px] uppercase tracking-wider text-white/30">
                        Line
                      </div>
                      <div className="text-sm font-semibold text-white/80">
                        O {row.typicalLine}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* ─── Locked rows (non-VIP preview) ─────────────────────── */}
            {lockedRows.length > 0 && (
              <div className="relative mt-6 rounded-xl border border-white/[0.06] bg-[#0a0a0a] overflow-hidden">
                {/* Blurred preview underneath */}
                <div className="pointer-events-none select-none blur-sm opacity-40">
                  {lockedRows.map((row, i) => (
                    <div
                      key={`locked-${row.player}-${i}`}
                      className="grid grid-cols-12 gap-3 md:gap-6 items-center px-4 py-5 md:px-7 md:py-6 border-b border-white/[0.04] last:border-b-0"
                    >
                      <div className="col-span-1 text-white/20 font-mono text-sm">
                        {String(i + 4).padStart(2, "0")}
                      </div>
                      <div className="col-span-6 md:col-span-4">
                        <div className="text-base md:text-xl font-bold">
                          {row.player}
                        </div>
                        <div className="text-[11px] text-white/30 mt-1">
                          {row.team} · {row.games} GP
                        </div>
                      </div>
                      <div className="col-span-5 md:col-span-3 text-right md:text-left">
                        <div className="text-3xl md:text-4xl font-bold text-[#FF3B3B]">
                          {row.average.toFixed(1)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Upgrade overlay */}
                <div className="absolute inset-0 flex flex-col items-center justify-center px-6 py-10 text-center bg-gradient-to-b from-[#0a0a0a]/60 via-[#0a0a0a]/90 to-[#0a0a0a]">
                  <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-yellow-400 mb-3">
                    VIP Exclusive
                  </div>
                  <h3
                    className="text-2xl md:text-3xl font-bold text-white"
                    style={{ fontFamily: "'DM Serif Display', serif" }}
                  >
                    {lockedRows.length} more locks waiting
                  </h3>
                  <p className="mt-2 text-sm text-white/50 max-w-md">
                    Full prop analyzer — all 10 picks per category, updated every
                    6 hours. Stack with parlays for compounding edge.
                  </p>
                  <Link
                    href="/subscribe"
                    className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#FF3B3B] px-6 py-3 text-sm font-semibold text-[#0a0a0a] hover:bg-[#FF5252] transition-colors"
                  >
                    Upgrade to VIP
                    <span aria-hidden>→</span>
                  </Link>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ─── Footer Disclaimer ──────────────────────────────────────── */}
        <div className="mt-16 md:mt-24 border-t border-white/[0.06] pt-8 pb-4">
          <p className="text-xs text-white/30 leading-relaxed max-w-3xl">
            <span className="text-white/50 font-semibold">Disclaimer —</span>{" "}
            Season averages. Actual prop lines and odds vary by sportsbook.
            Combine with moneyline parlays for stacked probability. Past
            performance does not guarantee future results. Bet responsibly.
          </p>
          <p className="mt-2 text-[11px] text-white/20">
            Data: ESPN public API. Cached 6 hours.
            {!hasVipAccess && !loading && isPro && (
              <span className="ml-2">
                Sharp tier shows top 3 per category.{" "}
                <Link
                  href="/subscribe"
                  className="text-[#FF3B3B] hover:underline"
                >
                  Upgrade to VIP
                </Link>{" "}
                for full picks.
              </span>
            )}
          </p>
        </div>
      </main>
    </div>
  );
}
