"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { AppNav } from "@/app/components/AppNav";
import { PicksTabs } from "@/app/components/PicksTabs";
import { Zap, TrendingUp, Target, Info, History, Share2, Copy, Check, ExternalLink } from "lucide-react";
import { affiliateLink, hasAffiliate } from "@/lib/affiliates";

/* ─── Types ─── */

interface Leg {
  sport: string;
  game: string;
  gameId?: string;
  commenceTime?: string;
  pick: string;
  market: string;
  odds: number;
  book: string;
  bookCount?: number;
  impliedProb: number;
  ourProb?: number;
  trueEdge?: number;
  scored?: boolean;
  fairProb?: number;
  sharpEdge?: boolean;
  evVsFair?: number;
  weatherNote?: string | null;
  pitcherNote?: string | null;
  reasons?: string[];
}

interface EdgesResponse {
  legs: Leg[];
  meta: {
    sportsScanned: string[];
    gamesAnalyzed: number;
    legsEvaluated: number;
    legsScored: number;
    edgesFound: number;
    generatedAt: string;
  };
}

/* ─── Constants ─── */

const SPORT_FILTERS = ["All", "NBA", "NFL", "MLB", "NHL", "NCAAB", "NCAAF"];
const MARKET_FILTERS = [
  { value: "all", label: "All Markets" },
  { value: "moneyline", label: "Moneyline" },
  { value: "spread", label: "Spread" },
  { value: "total", label: "Totals" },
];

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

/* ─── Page ─── */

export default function EdgesPage() {
  const [data, setData] = useState<EdgesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sport, setSport] = useState("All");
  const [market, setMarket] = useState("all");
  const [emailSubmitted, setEmailSubmitted] = useState(false);

  useEffect(() => {
    // Hide the capture form on repeat visits.
    try {
      if (typeof window !== "undefined" && localStorage.getItem("bp_edges_email_submitted") === "1") {
        setEmailSubmitted(true);
      }
    } catch {
      // localStorage can throw in private-mode / embedded contexts — ignore.
    }
  }, []);

  const fetchEdges = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Always scan the widest sport set the API will honor. Filter client-side
      // so toggling sports doesn't burn another Odds API call.
      const sports = "nba,nfl,mlb,nhl,ncaab,ncaaf";
      const res = await fetch(
        `/api/parlays?sports=${sports}&format=legs&count=30&tier=admin`,
        { cache: "no-store" },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: EdgesResponse = await res.json();
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load edges");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEdges();
  }, [fetchEdges]);

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.legs.filter((l) => {
      if (sport !== "All" && l.sport !== sport) return false;
      if (market !== "all" && l.market !== market) return false;
      return true;
    });
  }, [data, sport, market]);

  return (
    <div className="min-h-screen" style={{ background: "#0a0a0a", color: "#ededed" }}>
      <AppNav />
      <div className="pt-20">
        <PicksTabs />
      </div>

      {/* ── Hero ── */}
      <section
        className="border-b"
        style={{ borderColor: "rgba(255,255,255,0.06)" }}
      >
        <div className="max-w-[1400px] mx-auto px-6 py-10 md:py-16">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
            <div>
              <div
                className="text-xs uppercase tracking-wider mb-3"
                style={{ color: "#FF3B3B", fontFamily: "var(--font-geist-mono)" }}
              >
                Live · Where the book is slow
              </div>
              <h1
                className="text-4xl md:text-6xl leading-none"
                style={{ fontFamily: "'DM Serif Display', serif" }}
              >
                Sharp Edges
              </h1>
              <p
                className="mt-4 text-sm md:text-base max-w-2xl"
                style={{ color: "rgba(255,255,255,0.55)" }}
              >
                Single-leg picks where one sportsbook is pricing below the no-vig consensus across the market. These are the spots where retail books are slow to tighten after sharp money moves. We publish everything we find — no cherry-picking.
              </p>
            </div>

            {data && (
              <div className="flex flex-col gap-4 md:items-end">
                <div className="flex gap-6">
                  <Stat label="Games" value={data.meta.gamesAnalyzed} />
                  <Stat label="Legs Scanned" value={data.meta.legsEvaluated} />
                  <Stat label="Edges Found" value={data.meta.edgesFound} accent />
                </div>
                <Link
                  href="/edges/history"
                  className="text-xs flex items-center gap-2 px-3 py-1.5 rounded-full transition-colors"
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    color: "rgba(255,255,255,0.7)",
                  }}
                >
                  <History size={12} />
                  View track record →
                </Link>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── Honesty banner ── */}
      {/* Sharp edges are rare by design — if the market is efficient today
          the feed is mostly empty. Tell users that up front so they don't
          assume the site is broken when they see 0-3 picks. */}
      <section className="border-b" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
        <div className="max-w-[1400px] mx-auto px-6 py-4 text-xs flex items-start gap-2" style={{ color: "rgba(255,255,255,0.45)" }}>
          <Info size={12} className="mt-0.5 flex-shrink-0" />
          <span>
            Real sharp edges are rare — most days surface 0–5 picks. An empty feed means the market is tight, not that the model is broken. Quality over quantity.
          </span>
        </div>
      </section>

      {/* ── Email capture ── */}
      <EmailCapture submitted={emailSubmitted} onSubmitted={() => setEmailSubmitted(true)} />

      {/* ── Filters ── */}
      <section
        className="border-b"
        style={{ borderColor: "rgba(255,255,255,0.06)" }}
      >
        <div className="max-w-[1400px] mx-auto px-6 py-6 flex flex-col md:flex-row md:items-center gap-4 md:gap-8">
          <FilterGroup label="Sport" options={SPORT_FILTERS} value={sport} onChange={setSport} />
          <FilterGroup
            label="Market"
            options={MARKET_FILTERS.map((m) => m.label)}
            value={MARKET_FILTERS.find((m) => m.value === market)?.label ?? "All Markets"}
            onChange={(label) =>
              setMarket(MARKET_FILTERS.find((m) => m.label === label)?.value ?? "all")
            }
          />
        </div>
      </section>

      {/* ── Body ── */}
      <main className="max-w-[1400px] mx-auto px-6 py-10 md:py-14">
        {loading && (
          <div
            className="py-20 text-center text-sm"
            style={{ color: "rgba(255,255,255,0.4)" }}
          >
            Scanning the market…
          </div>
        )}

        {error && !loading && (
          <div
            className="py-10 text-center text-sm"
            style={{ color: "#ef4444" }}
          >
            {error}
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div className="py-20 text-center">
            <p className="text-lg mb-2" style={{ color: "rgba(255,255,255,0.8)" }}>
              No edges found for this filter.
            </p>
            <p className="text-sm" style={{ color: "rgba(255,255,255,0.4)" }}>
              Try widening sport/market filters, or check back later — lines move constantly and new gaps open all day.
            </p>
          </div>
        )}

        {!loading && !error && filtered.length > 0 && (
          <>
            <p
              className="text-xs mb-6 flex items-center gap-2"
              style={{ color: "rgba(255,255,255,0.4)" }}
            >
              <Info size={12} />
              Sorted by EV vs no-vig consensus. Bigger EV = bigger mispricing.
            </p>
            <div className="space-y-3">
              <AnimatePresence>
                {filtered.map((leg, i) => (
                  <EdgeCard key={`${leg.gameId}-${leg.pick}-${i}`} leg={leg} rank={i + 1} />
                ))}
              </AnimatePresence>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

/* ─── Sub-components ─── */

function Stat({ label, value, accent = false }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="text-right">
      <div
        className="text-2xl md:text-3xl leading-none"
        style={{
          fontFamily: "var(--font-geist-mono)",
          color: accent ? "#FF3B3B" : "#ededed",
          fontWeight: 500,
        }}
      >
        {value}
      </div>
      <div
        className="text-xs mt-1 uppercase tracking-wider"
        style={{ color: "rgba(255,255,255,0.4)" }}
      >
        {label}
      </div>
    </div>
  );
}

function FilterGroup({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <span
        className="text-xs uppercase tracking-wider"
        style={{ color: "rgba(255,255,255,0.4)" }}
      >
        {label}
      </span>
      <div className="flex gap-2 flex-wrap">
        {options.map((opt) => {
          const active = opt === value;
          return (
            <button
              key={opt}
              onClick={() => onChange(opt)}
              className="px-3 py-1.5 text-xs rounded-full transition-colors"
              style={{
                background: active ? "#FF3B3B" : "rgba(255,255,255,0.05)",
                color: active ? "#0a0a0a" : "rgba(255,255,255,0.7)",
                fontWeight: active ? 600 : 400,
              }}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function EdgeCard({ leg, rank }: { leg: Leg; rank: number }) {
  const sharp = leg.sharpEdge === true;
  const ev = leg.evVsFair ?? leg.trueEdge ?? 0;
  const evColor = ev >= 0.02 ? "#22c55e" : ev >= 0.01 ? "#eab308" : "rgba(255,255,255,0.5)";
  const [copied, setCopied] = useState(false);

  const copyPick = async () => {
    const line =
      `${leg.sport} · ${leg.pick} @ ${formatOdds(leg.odds)} (${leg.book})` +
      (typeof leg.evVsFair === "number" ? ` · ${formatEv(leg.evVsFair)} EV vs fair` : "") +
      ` — via bayparlays.vercel.app/edges`;
    try {
      await navigator.clipboard.writeText(line);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard can fail in insecure contexts — silent no-op is fine
    }
  };

  const bookUrl = affiliateLink(leg.book);
  const isAffiliate = hasAffiliate(leg.book);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="rounded-lg p-5 md:p-6"
      style={{
        background: "rgba(255,255,255,0.02)",
        border: `1px solid ${sharp ? "rgba(34,197,94,0.25)" : "rgba(255,255,255,0.06)"}`,
      }}
    >
      <div className="flex items-start justify-between gap-3 md:gap-4 mb-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center flex-wrap gap-2 md:gap-3 mb-2">
            <span
              className="text-xs font-semibold px-2 py-0.5 rounded"
              style={{
                background: "rgba(255,255,255,0.06)",
                color: "rgba(255,255,255,0.7)",
                fontFamily: "var(--font-geist-mono)",
              }}
            >
              #{String(rank).padStart(2, "0")}
            </span>
            <span
              className="text-xs font-semibold"
              style={{ color: "#3b82f6" }}
            >
              {leg.sport}
            </span>
            <span
              className="text-xs"
              style={{ color: "rgba(255,255,255,0.4)" }}
            >
              {leg.market}
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
                style={{ color: "rgba(255,255,255,0.35)", fontFamily: "var(--font-geist-mono)" }}
              >
                {timeUntil(leg.commenceTime)}
              </span>
            )}
          </div>
          <div className="text-xl md:text-2xl font-semibold mb-1">{leg.pick}</div>
          <div
            className="text-sm"
            style={{ color: "rgba(255,255,255,0.5)" }}
          >
            {leg.game}
          </div>
        </div>

        <div className="flex items-start gap-3 flex-shrink-0">
          <div className="text-right">
            <div
              className="text-2xl md:text-3xl leading-none"
              style={{
                fontFamily: "var(--font-geist-mono)",
                color: "#FF3B3B",
                fontWeight: 500,
              }}
            >
              {formatOdds(leg.odds)}
            </div>
            {bookUrl !== "#" ? (
              <a
                href={bookUrl}
                target="_blank"
                rel="noopener noreferrer sponsored"
                className="text-xs mt-1 inline-flex items-center gap-1 hover:underline"
                style={{ color: "rgba(255,255,255,0.5)" }}
                title={isAffiliate ? `Place bet at ${leg.book}` : `Open ${leg.book}`}
              >
                {leg.book}
                <ExternalLink size={10} />
              </a>
            ) : (
              <div className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.4)" }}>
                {leg.book}
              </div>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <button
              onClick={copyPick}
              aria-label={copied ? "Copied" : "Copy pick"}
              title={copied ? "Copied!" : "Copy pick"}
              className="flex items-center justify-center rounded-full transition-colors"
              style={{
                width: 32,
                height: 32,
                background: copied ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.04)",
                border: `1px solid ${copied ? "rgba(34,197,94,0.35)" : "rgba(255,255,255,0.08)"}`,
                color: copied ? "#22c55e" : "rgba(255,255,255,0.55)",
              }}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </button>
            <Link
              href="/share/edge"
              aria-label="Share this edge"
              title="Share this edge"
              className="flex items-center justify-center rounded-full transition-colors"
              style={{
                width: 32,
                height: 32,
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                color: "rgba(255,255,255,0.55)",
              }}
            >
              <Share2 size={14} />
            </Link>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 pt-4 border-t" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
        <MiniStat icon={<TrendingUp size={12} />} label="EV vs Fair" value={formatEv(ev)} color={evColor} />
        <MiniStat
          icon={<Target size={12} />}
          label="Fair Prob"
          value={leg.fairProb !== undefined ? formatPct(leg.fairProb) : "—"}
          color="rgba(255,255,255,0.8)"
        />
        <MiniStat
          icon={<Info size={12} />}
          label="Book Implied"
          value={formatPct(leg.impliedProb)}
          color="rgba(255,255,255,0.5)"
        />
      </div>

      {leg.reasons && leg.reasons.length > 0 && (
        <div
          className="mt-4 pt-4 border-t space-y-1.5"
          style={{ borderColor: "rgba(255,255,255,0.04)" }}
        >
          {leg.reasons.map((r, i) => (
            <div
              key={i}
              className="text-xs leading-relaxed"
              style={{ color: "rgba(255,255,255,0.55)" }}
            >
              {r}
            </div>
          ))}
        </div>
      )}
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
        className="text-base"
        style={{ color, fontFamily: "var(--font-geist-mono)", fontWeight: 500 }}
      >
        {value}
      </div>
    </div>
  );
}

function EmailCapture({
  submitted,
  onSubmitted,
}: {
  submitted: boolean;
  onSubmitted: () => void;
}) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "error">("idle");
  const [errMsg, setErrMsg] = useState<string | null>(null);

  if (submitted) {
    return (
      <section className="border-b" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
        <div
          className="max-w-[1400px] mx-auto px-6 py-4 text-xs"
          style={{ color: "rgba(255,255,255,0.55)" }}
        >
          You&apos;re in. Expect tomorrow morning.
        </div>
      </section>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed || !trimmed.includes("@")) {
      setStatus("error");
      setErrMsg("Enter a valid email.");
      return;
    }
    setStatus("sending");
    setErrMsg(null);
    try {
      const res = await fetch("/api/email-capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      try {
        localStorage.setItem("bp_edges_email_submitted", "1");
      } catch {
        // ignore
      }
      onSubmitted();
    } catch (err) {
      setStatus("error");
      setErrMsg(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  return (
    <section className="border-b" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
      <div className="max-w-[1400px] mx-auto px-6 py-5">
        <form
          onSubmit={submit}
          className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4"
        >
          <span
            className="text-sm"
            style={{ color: "rgba(255,255,255,0.75)" }}
          >
            Get tomorrow&apos;s edges in your inbox.{" "}
            <span style={{ color: "rgba(255,255,255,0.45)" }}>Free. No spam.</span>
          </span>
          <div className="flex gap-2 flex-1 sm:max-w-md sm:ml-auto">
            <input
              type="email"
              inputMode="email"
              required
              placeholder="you@email.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (status === "error") setStatus("idle");
              }}
              disabled={status === "sending"}
              className="flex-1 px-3 py-2 text-sm rounded-md outline-none"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                color: "#ededed",
              }}
            />
            <button
              type="submit"
              disabled={status === "sending"}
              className="px-4 py-2 text-xs font-semibold rounded-md transition-opacity"
              style={{
                background: "#FF3B3B",
                color: "#0a0a0a",
                opacity: status === "sending" ? 0.6 : 1,
              }}
            >
              {status === "sending" ? "Sending…" : "Subscribe"}
            </button>
          </div>
        </form>
        {status === "error" && errMsg && (
          <div
            className="mt-2 text-xs"
            style={{ color: "#ef4444" }}
          >
            {errMsg}
          </div>
        )}
      </div>
    </section>
  );
}
