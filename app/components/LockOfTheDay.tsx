"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, TrendingUp, Target, Info, Zap } from "lucide-react";

/* ─── Types ─── */

interface Leg {
  sport: string;
  game: string;
  gameId?: string;
  commenceTime?: string;
  pick: string;
  market?: string;
  odds: number;
  book: string;
  impliedProb: number;
  fairProb?: number;
  sharpEdge?: boolean;
  evVsFair?: number;
  reasons?: string[];
}

interface ApiResponse {
  legs: Leg[];
}

/* ─── Helpers ─── */

function formatOdds(n: number): string {
  return n > 0 ? `+${n}` : `${n}`;
}

function formatEv(n: number): string {
  return `${n > 0 ? "+" : ""}${(n * 100).toFixed(2)}%`;
}

function formatPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function timeUntil(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffMin = Math.round((then - now) / 60000);
  if (diffMin <= 0) return "starting";
  if (diffMin < 60) return `${diffMin}m`;
  const hrs = Math.floor(diffMin / 60);
  const mins = diffMin % 60;
  if (hrs < 24) return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

// Calendar-date key in viewer's local timezone (YYYY-MM-DD). Used to filter
// Lock of the Day picks to TODAY specifically, not just "within 3 days".
function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/* ─── Component ─── */

export function LockOfTheDay() {
  const [locks, setLocks] = useState<Leg[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        const res = await fetch(
          "/api/parlays?sports=nba,mlb,nhl,ncaab&format=legs&count=30&tier=admin",
          { cache: "no-store" },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json: ApiResponse = await res.json();
        if (cancelled) return;
        const legs = Array.isArray(json.legs) ? json.legs : [];

        // "Lock of the Day" means TODAY. A game that starts tomorrow or
        // 2 days from now shouldn't surface here. Filter by calendar date
        // in the viewer's local timezone so users see what's labelled.
        const todayKey = localDateKey(new Date());
        const todayOnly = legs.filter((l) => {
          if (!l.commenceTime) return false;
          return localDateKey(new Date(l.commenceTime)) === todayKey;
        });

        // Positive-EV picks only. Sort by evVsFair desc, top 3.
        const positive = todayOnly.filter(
          (l) => typeof l.evVsFair === "number" && l.evVsFair > 0,
        );
        positive.sort((a, b) => (b.evVsFair ?? 0) - (a.evVsFair ?? 0));
        setLocks(positive.slice(0, 3));
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section
      className="border-b"
      style={{
        background: "#0a0a0a",
        borderColor: "rgba(255,255,255,0.06)",
      }}
    >
      <div className="max-w-[1400px] mx-auto px-4 md:px-10 pt-24 pb-8 md:pt-32 md:pb-14">
        {loading && <LockSkeleton />}
        {!loading && (error || locks.length === 0) && <LockEmpty />}
        {!loading && !error && locks.length > 0 && (
          <div className="space-y-4 md:space-y-5">
            {locks.length > 1 && (
              <h2
                className="text-xs md:text-sm uppercase tracking-wider"
                style={{ color: "rgba(255,255,255,0.55)", fontFamily: "var(--font-geist-mono)" }}
              >
                Today&apos;s Locks — top {locks.length} positive-EV pick{locks.length === 1 ? "" : "s"}
              </h2>
            )}
            {locks.map((leg, i) => (
              <LockCard
                key={`${leg.gameId ?? leg.pick}-${i}`}
                leg={leg}
                showHeroLabel={i === 0}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

/* ─── States ─── */

function LockSkeleton() {
  return (
    <div
      className="rounded-xl p-6 md:p-8"
      style={{
        background: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <div
        className="text-xs uppercase tracking-wider mb-4"
        style={{ color: "#FF3B3B", fontFamily: "var(--font-geist-mono)" }}
      >
        Live · Lock of the Day
      </div>
      <div
        className="text-sm"
        style={{ color: "rgba(255,255,255,0.45)" }}
      >
        Scanning the market…
      </div>
    </div>
  );
}

function LockEmpty() {
  return (
    <div
      className="rounded-xl p-6 md:p-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4"
      style={{
        background: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <div>
        <div
          className="text-xs uppercase tracking-wider mb-3"
          style={{ color: "#FF3B3B", fontFamily: "var(--font-geist-mono)" }}
        >
          Live · Lock of the Day
        </div>
        <div
          className="text-xl md:text-2xl mb-1"
          style={{ fontFamily: "'DM Serif Display', serif" }}
        >
          No clear edge right now.
        </div>
        <div
          className="text-sm"
          style={{ color: "rgba(255,255,255,0.5)" }}
        >
          Check back in an hour — lines move constantly and new gaps open all day.
        </div>
      </div>
      <Link
        href="/edges"
        className="inline-flex items-center gap-2 px-5 py-2.5 text-sm rounded-full transition-colors"
        style={{
          background: "rgba(255,255,255,0.05)",
          color: "rgba(255,255,255,0.85)",
          border: "1px solid rgba(255,255,255,0.1)",
          fontWeight: 500,
        }}
      >
        See all edges
        <ArrowRight size={14} />
      </Link>
    </div>
  );
}

function LockCard({ leg, showHeroLabel = true }: { leg: Leg; showHeroLabel?: boolean }) {
  const ev = leg.evVsFair ?? 0;
  const evColor =
    ev >= 0.02 ? "#22c55e" : ev >= 0.01 ? "#eab308" : "rgba(255,255,255,0.7)";
  const sharp = leg.sharpEdge === true;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
      className="rounded-xl p-5 md:p-8"
      style={{
        background: "rgba(255,255,255,0.02)",
        border: `1px solid ${sharp ? "rgba(34,197,94,0.3)" : "rgba(255,59,59,0.25)"}`,
      }}
    >
      {/* Header row — eyebrow left, tip-off time right, sport + sharp wrap
          naturally. On mobile the time stays on its own line if pills crowd. */}
      <div className="flex flex-wrap items-center gap-2 md:gap-3 mb-4 md:mb-5">
        {showHeroLabel && (
          <span
            className="text-[11px] md:text-xs uppercase tracking-wider"
            style={{ color: "#FF3B3B", fontFamily: "var(--font-geist-mono)" }}
          >
            Live · Lock of the Day
          </span>
        )}
        <span
          className="text-xs font-semibold px-2 py-0.5 rounded"
          style={{
            background: "rgba(255,255,255,0.06)",
            color: "rgba(255,255,255,0.75)",
            fontFamily: "var(--font-geist-mono)",
          }}
        >
          {leg.sport}
        </span>
        {sharp && (
          <span
            className="text-xs font-semibold flex items-center gap-1"
            style={{ color: "#22c55e" }}
          >
            <Zap size={12} />
            Sharp edge
          </span>
        )}
        {leg.commenceTime && (
          <span
            className="text-xs ml-auto"
            style={{
              color: "rgba(255,255,255,0.4)",
              fontFamily: "var(--font-geist-mono)",
            }}
          >
            {timeUntil(leg.commenceTime)}
          </span>
        )}
      </div>

      {/* Main row — stack on mobile (pick / odds / book block-flow) so the
          serif pick title gets full width and doesn't crowd the odds. Desktop
          keeps the side-by-side layout. */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 md:gap-6 mb-5 md:mb-6">
        <div className="flex-1 min-w-0">
          <h2
            className="text-[2rem] leading-[1.05] md:text-5xl mb-2"
            style={{ fontFamily: "'DM Serif Display', serif" }}
          >
            {leg.pick}
          </h2>
          <div
            className="text-sm md:text-base"
            style={{ color: "rgba(255,255,255,0.5)" }}
          >
            {leg.game}
          </div>
        </div>

        <div className="flex items-baseline gap-3 md:block md:text-right md:flex-shrink-0">
          <div
            className="text-3xl md:text-5xl leading-none"
            style={{
              fontFamily: "var(--font-geist-mono)",
              color: "#FF3B3B",
              fontWeight: 500,
            }}
          >
            {formatOdds(leg.odds)}
          </div>
          <div
            className="text-xs md:text-sm md:mt-2"
            style={{ color: "rgba(255,255,255,0.45)" }}
          >
            {leg.book}
          </div>
        </div>
      </div>

      {/* Mini stats */}
      <div
        className="grid grid-cols-3 gap-4 pt-5 border-t"
        style={{ borderColor: "rgba(255,255,255,0.06)" }}
      >
        <MiniStat
          icon={<TrendingUp size={12} />}
          label="EV vs Fair"
          value={formatEv(ev)}
          color={evColor}
        />
        <MiniStat
          icon={<Target size={12} />}
          label="Fair Prob"
          value={leg.fairProb !== undefined ? formatPct(leg.fairProb) : "—"}
          color="rgba(255,255,255,0.85)"
        />
        <MiniStat
          icon={<Info size={12} />}
          label="Book Implied"
          value={formatPct(leg.impliedProb)}
          color="rgba(255,255,255,0.55)"
        />
      </div>

      {/* CTA — button first, best supporting reason inline. We skip the first
          reason (it's the AI-vs-book framing which reads meh on low-edge picks
          like "tracks close to book's price"). Instead we grab the first
          reason that's actually sport-specific context: team record, sharp
          edge callout, weather/pitcher, or line-shopping consensus. */}
      <div className="mt-5 md:mt-6 flex flex-col md:flex-row md:flex-wrap md:items-center gap-3">
        <Link
          href="/edges"
          className="inline-flex items-center justify-center gap-2 px-5 py-3 md:py-2.5 text-sm rounded-full transition-colors"
          style={{
            background: "#FF3B3B",
            color: "#0a0a0a",
            fontWeight: 600,
          }}
        >
          See all edges
          <ArrowRight size={14} />
        </Link>
        {(() => {
          const reasons = leg.reasons ?? [];
          // Prefer reasons that aren't the AI-vs-book framing (those start with
          // "AI sees value", "AI flags", "AI estimate", or "AI couldn't").
          const supporting = reasons.find(
            (r) => !/^(AI sees|AI flags|AI estimate|AI couldn't)/i.test(r),
          );
          if (!supporting) return null;
          return (
            <span
              className="text-xs md:text-xs leading-relaxed"
              style={{ color: "rgba(255,255,255,0.45)" }}
            >
              {supporting}
            </span>
          );
        })()}
      </div>
    </motion.div>
  );
}

function MiniStat({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div>
      <div
        className="flex items-center gap-1 text-xs mb-1"
        style={{ color: "rgba(255,255,255,0.35)" }}
      >
        {icon}
        {label}
      </div>
      <div
        className="text-base md:text-lg"
        style={{
          color,
          fontFamily: "var(--font-geist-mono)",
          fontWeight: 500,
        }}
      >
        {value}
      </div>
    </div>
  );
}
