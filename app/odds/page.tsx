"use client";

import { useState, useEffect, useCallback } from "react";
import { AppNav } from "@/app/components/AppNav";
import { PicksTabs } from "@/app/components/PicksTabs";

// ─── Types (mirrors API route) ───────────────────────────────────────────────

interface OddsOutcome {
  name: string;
  price: number;
  point?: number;
}

interface BookmakerOdds {
  key: string;
  title: string;
  outcomes: OddsOutcome[];
  lastUpdate: string;
}

interface MarketOdds {
  key: string;
  bookmakers: BookmakerOdds[];
}

interface BestOdds {
  outcomeName: string;
  bestPrice: number;
  bestPoint?: number;
  bestBook: string;
  bestBookKey: string;
}

interface GameOdds {
  id: string;
  sportKey: string;
  homeTeam: string;
  awayTeam: string;
  commenceTime: string;
  markets: MarketOdds[];
  bestOdds: Record<string, BestOdds[]>;
}

interface OddsResponse {
  games: GameOdds[];
  sport: string;
  bookDisplayNames: Record<string, string>;
  requestsUsed: string | null;
  requestsRemaining: string | null;
  cachedAt: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const SPORTS = [
  { key: "nba", label: "NBA" },
  { key: "nfl", label: "NFL" },
  { key: "mlb", label: "MLB" },
  { key: "ufc", label: "UFC" },
  { key: "nhl", label: "NHL" },
  { key: "ncaaf", label: "NCAAF" },
  { key: "ncaab", label: "NCAAB" },
  { key: "soccer", label: "Soccer" },
];

const MARKETS = [
  { key: "spreads", label: "Spreads" },
  { key: "h2h", label: "Moneyline" },
  { key: "totals", label: "Totals" },
];

const BOOK_URLS: Record<string, string> = {
  draftkings: "https://sportsbook.draftkings.com",
  fanduel: "https://sportsbook.fanduel.com",
  betmgm: "https://sports.betmgm.com",
  caesars: "https://www.caesars.com/sportsbook-and-casino",
  pointsbetus: "https://www.pointsbet.com",
  betrivers: "https://www.betrivers.com",
  bovada: "https://www.bovada.lv",
  betonlineag: "https://www.betonline.ag",
  lowvig: "https://www.lowvig.ag",
  mybookieag: "https://www.mybookie.ag",
  betus: "https://www.betus.com.pa",
  espnbet: "https://espnbet.com",
  fanatics: "https://sportsbook.fanatics.com",
  hardrockbet: "https://www.hardrocksportsbook.com",
  williamhill_us: "https://www.williamhill.com",
  unibet_us: "https://www.unibet.com",
  wynnbet: "https://www.wynnbet.com",
  superbook: "https://www.superbook.com",
  twinspires: "https://www.twinspires.com",
  fliff: "https://www.getfliff.com",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatOdds(price: number): string {
  return price > 0 ? `+${price}` : `${price}`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffHrs = diffMs / (1000 * 60 * 60);

  if (diffHrs < 0) {
    return "LIVE";
  }
  if (diffHrs < 24) {
    return d.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  }
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function OddsPage() {
  const [sport, setSport] = useState("nba");
  const [market, setMarket] = useState("spreads");
  const [data, setData] = useState<OddsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOdds = useCallback(async (s: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/odds?sport=${s}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const json: OddsResponse = await res.json();
      setData(json);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load odds");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOdds(sport);
  }, [sport, fetchOdds]);

  // Get games with data for the selected market
  const filteredGames =
    data?.games.filter((g) => g.markets.some((m) => m.key === market)) || [];

  return (
    <div className="min-h-screen bg-[#FAFAF7] text-[#0a0a0a]">
      <AppNav />
      <div className="pt-20">
        <PicksTabs />
      </div>

      <main className="mx-auto max-w-[1400px] px-4 py-6 md:px-5 md:py-10">
        {/* ─── Header ─────────────────────────────────────────────────── */}
        <div className="mb-8">
          <h1
            className="text-3xl font-bold tracking-tight sm:text-4xl"
            style={{ fontFamily: "'DM Serif Display', serif" }}
          >
            Live Odds Comparison
          </h1>
          <p className="mt-2 text-sm text-black/50">
            Best lines across every book, updated every 5 minutes.
            {data?.cachedAt && (
              <span className="ml-2">
                Last updated{" "}
                {new Date(data.cachedAt).toLocaleTimeString("en-US", {
                  hour: "numeric",
                  minute: "2-digit",
                  hour12: true,
                })}
              </span>
            )}
          </p>
        </div>

        {/* ─── Sport Tabs ─────────────────────────────────────────────── */}
        <div className="mb-6 flex gap-2 overflow-x-auto scrollbar-hide">
          {SPORTS.map((s) => (
            <button
              key={s.key}
              onClick={() => setSport(s.key)}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                sport === s.key
                  ? "bg-[#0a0a0a] text-[#0a0a0a]"
                  : "bg-black/[0.04] text-black/55 hover:bg-black/[0.08] hover:text-black"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* ─── Market Tabs ────────────────────────────────────────────── */}
        <div className="mb-8 flex gap-1 rounded-lg bg-black/[0.04] p-1 w-fit">
          {MARKETS.map((m) => (
            <button
              key={m.key}
              onClick={() => setMarket(m.key)}
              className={`rounded-md px-4 py-2 text-sm font-medium transition ${
                market === m.key
                  ? "bg-[#0a0a0a] text-white"
                  : "text-black/50 hover:text-black/70"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* ─── Loading State ──────────────────────────────────────────── */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-32">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-black/10 border-t-[#0a0a0a]" />
            <p className="mt-4 text-sm text-black/45">
              Fetching odds across all sportsbooks...
            </p>
          </div>
        )}

        {/* ─── Error State ────────────────────────────────────────────── */}
        {!loading && error && (
          <div className="flex flex-col items-center justify-center py-32">
            <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-6 py-4 text-center">
              <p className="text-sm text-red-400">{error}</p>
              <button
                onClick={() => fetchOdds(sport)}
                className="mt-3 text-xs text-black/50 underline hover:text-black"
              >
                Try again
              </button>
            </div>
          </div>
        )}

        {/* ─── Empty State ────────────────────────────────────────────── */}
        {!loading && !error && filteredGames.length === 0 && (
          <div className="flex flex-col items-center justify-center py-32">
            <p className="text-lg text-black/35">
              No {SPORTS.find((s) => s.key === sport)?.label} games with{" "}
              {MARKETS.find((m) => m.key === market)?.label.toLowerCase()} data
              right now.
            </p>
            <p className="mt-2 text-sm text-black/25">
              Check back closer to game time.
            </p>
          </div>
        )}

        {/* ─── Game Cards ─────────────────────────────────────────────── */}
        {!loading &&
          !error &&
          filteredGames.map((game) => {
            const marketData = game.markets.find((m) => m.key === market);
            const best = game.bestOdds[market] || [];

            if (!marketData || marketData.bookmakers.length === 0) return null;

            // Determine outcome sides
            const outcomeNames =
              market === "totals"
                ? ["Over", "Under"]
                : [game.awayTeam, game.homeTeam];

            // Best odds lookup
            const bestMap = new Map<string, BestOdds>();
            for (const b of best) {
              bestMap.set(b.outcomeName, b);
            }

            // Build runner-up books per outcome (sorted by best price, excluding the best)
            const runnerUps = new Map<string, { book: string; bookKey: string; price: number; point?: number }[]>();
            for (const name of outcomeNames) {
              const bestForOutcome = bestMap.get(name);
              const runners: { book: string; bookKey: string; price: number; point?: number }[] = [];
              for (const bm of marketData.bookmakers) {
                if (bestForOutcome && bm.key === bestForOutcome.bestBookKey) continue;
                const outcome = bm.outcomes.find((o) => o.name === name);
                if (outcome) {
                  runners.push({
                    book: data?.bookDisplayNames?.[bm.key] || bm.title,
                    bookKey: bm.key,
                    price: outcome.price,
                    point: outcome.point,
                  });
                }
              }
              // Sort by best price (higher is better for positive, less negative is better for negative)
              runners.sort((a, b) => b.price - a.price);
              runnerUps.set(name, runners);
            }

            const timeLabel = formatTime(game.commenceTime);
            const isLive = timeLabel === "LIVE";

            return (
              <div
                key={game.id}
                className="mb-5 overflow-hidden rounded-xl border border-black/[0.06] bg-white"
              >
                {/* Game header */}
                <div className="flex items-center justify-between px-5 py-4 md:px-6">
                  <p className="text-sm sm:text-base font-semibold truncate">
                    {game.awayTeam}{" "}
                    <span className="text-black/35 mx-1 sm:mx-2">@</span>{" "}
                    {game.homeTeam}
                  </p>
                  <div className="flex items-center gap-3 shrink-0 ml-3">
                    {isLive && (
                      <span className="flex items-center gap-1.5 rounded-full bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" />
                        LIVE
                      </span>
                    )}
                    <span className="text-sm text-black/45">{timeLabel}</span>
                  </div>
                </div>

                {/* Best odds per side */}
                <div className="px-5 pb-5 md:px-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {outcomeNames.map((name) => {
                    const b = bestMap.get(name);
                    if (!b) return null;
                    const runners = runnerUps.get(name) || [];
                    const top3 = runners.slice(0, 3);
                    const remaining = runners.length - 3;
                    const bookUrl = BOOK_URLS[b.bestBookKey];

                    return (
                      <div key={name} className="rounded-lg bg-white border border-black/[0.06] px-4 py-4">
                        {/* Side label */}
                        <div className="text-[11px] uppercase tracking-wider text-black/45 font-medium mb-3">
                          {name}
                        </div>

                        {/* Best line — big and prominent */}
                        <div className="mb-3">
                          {bookUrl ? (
                            <a
                              href={bookUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="group inline-flex items-baseline gap-2 hover:opacity-80 transition"
                            >
                              <span className="flex flex-col items-start font-mono tracking-tight tabular-nums">
                                {b.bestPoint !== undefined && (
                                  <span className="text-lg sm:text-xl font-bold text-black/70 leading-none">
                                    {market === "totals" ? b.bestPoint : `${b.bestPoint > 0 ? "+" : ""}${b.bestPoint}`}
                                  </span>
                                )}
                                <span className="text-2xl sm:text-3xl font-black text-[#0a0a0a] leading-none mt-1">
                                  {formatOdds(b.bestPrice)}
                                </span>
                              </span>
                              <svg
                                className="h-3 w-3 text-[#0a0a0a]/40 opacity-0 group-hover:opacity-100 transition-opacity"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                                <polyline points="15 3 21 3 21 9" />
                                <line x1="10" y1="14" x2="21" y2="3" />
                              </svg>
                            </a>
                          ) : (
                            <span className="flex flex-col items-start font-mono tracking-tight tabular-nums">
                              {b.bestPoint !== undefined && (
                                <span className="text-lg sm:text-xl font-bold text-black/70 leading-none">
                                  {market === "totals" ? b.bestPoint : `${b.bestPoint > 0 ? "+" : ""}${b.bestPoint}`}
                                </span>
                              )}
                              <span className="text-2xl sm:text-3xl font-black text-[#0a0a0a] leading-none mt-1">
                                {formatOdds(b.bestPrice)}
                              </span>
                            </span>
                          )}
                          <div className="text-xs text-[#0a0a0a]/60 font-medium mt-1">
                            {b.bestBook}
                          </div>
                        </div>

                        {/* Runner-up pills */}
                        {top3.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1.5">
                            {top3.map((r) => (
                              <span
                                key={r.bookKey}
                                className="inline-flex items-center gap-1.5 rounded-md bg-black/[0.04] px-2.5 py-1 text-[11px] text-black/50"
                              >
                                <span className="text-black/40">{r.book}</span>
                                <span className="font-mono font-semibold text-black/55">
                                  {formatOdds(r.price)}
                                </span>
                              </span>
                            ))}
                            {remaining > 0 && (
                              <span className="text-[11px] text-black/35 px-1">
                                +{remaining} more
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

        {/* ─── Footer info ────────────────────────────────────────────── */}
        {data && !loading && (
          <div className="mt-10 flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs text-black/30">
              <p>Odds data updated regularly. Not financial advice.</p>
            </div>
            <p className="text-[10px] text-black/25 text-center">
              Links to sportsbooks may be affiliate links. BayParlays may earn a commission at no cost to you.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
