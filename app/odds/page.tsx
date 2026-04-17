"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

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
    <div className="min-h-screen bg-[#0a0a0a] text-[#ededed]">
      {/* ─── Nav ────────────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 border-b border-white/[0.06] bg-[#0a0a0a]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between px-5 py-4">
          <Link href="/" className="text-xl font-black tracking-tight">
            BayParlays
          </Link>
          <div className="flex items-center gap-6 text-sm text-white/50">
            <Link href="/" className="transition hover:text-white">
              Home
            </Link>
            <Link href="/parlays" className="transition hover:text-white">
              Parlays
            </Link>
            <Link
              href="/odds"
              className="text-[#00D4AA] font-medium"
            >
              Odds
            </Link>
            <Link href="/builder" className="transition hover:text-white">
              Builder
            </Link>
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-[1400px] px-5 py-10">
        {/* ─── Header ─────────────────────────────────────────────────── */}
        <div className="mb-8">
          <h1
            className="text-3xl font-bold tracking-tight sm:text-4xl"
            style={{ fontFamily: "'DM Serif Display', serif" }}
          >
            Live Odds Comparison
          </h1>
          <p className="mt-2 text-sm text-white/40">
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
        <div className="mb-6 flex flex-wrap gap-2">
          {SPORTS.map((s) => (
            <button
              key={s.key}
              onClick={() => setSport(s.key)}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                sport === s.key
                  ? "bg-[#00D4AA] text-[#0a0a0a]"
                  : "bg-white/[0.04] text-white/50 hover:bg-white/[0.08] hover:text-white"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* ─── Market Tabs ────────────────────────────────────────────── */}
        <div className="mb-8 flex gap-1 rounded-lg bg-white/[0.04] p-1 w-fit">
          {MARKETS.map((m) => (
            <button
              key={m.key}
              onClick={() => setMarket(m.key)}
              className={`rounded-md px-4 py-2 text-sm font-medium transition ${
                market === m.key
                  ? "bg-white/[0.1] text-white"
                  : "text-white/40 hover:text-white/70"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* ─── Loading State ──────────────────────────────────────────── */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-32">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-[#00D4AA]" />
            <p className="mt-4 text-sm text-white/30">
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
                className="mt-3 text-xs text-white/40 underline hover:text-white"
              >
                Try again
              </button>
            </div>
          </div>
        )}

        {/* ─── Empty State ────────────────────────────────────────────── */}
        {!loading && !error && filteredGames.length === 0 && (
          <div className="flex flex-col items-center justify-center py-32">
            <p className="text-lg text-white/20">
              No {SPORTS.find((s) => s.key === sport)?.label} games with{" "}
              {MARKETS.find((m) => m.key === market)?.label.toLowerCase()} data
              right now.
            </p>
            <p className="mt-2 text-sm text-white/10">
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

            // Determine outcome columns (team names for h2h/spreads, Over/Under for totals)
            const outcomeNames =
              market === "totals"
                ? ["Over", "Under"]
                : [game.awayTeam, game.homeTeam];

            // Build a map: bookKey -> outcomeName -> outcome
            const bookOddsMap = new Map<
              string,
              Map<string, OddsOutcome>
            >();
            const bookKeys: string[] = [];

            for (const bm of marketData.bookmakers) {
              if (!bookOddsMap.has(bm.key)) {
                bookKeys.push(bm.key);
              }
              const outMap = new Map<string, OddsOutcome>();
              for (const o of bm.outcomes) {
                outMap.set(o.name, o);
              }
              bookOddsMap.set(bm.key, outMap);
            }

            // Best odds lookup: outcomeName -> BestOdds
            const bestMap = new Map<string, BestOdds>();
            for (const b of best) {
              bestMap.set(b.outcomeName, b);
            }

            const timeLabel = formatTime(game.commenceTime);
            const isLive = timeLabel === "LIVE";

            return (
              <div
                key={game.id}
                className="mb-6 overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.02]"
              >
                {/* Game header */}
                <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
                  <div className="flex items-center gap-4">
                    <div>
                      <p className="text-base font-semibold">
                        {game.awayTeam}{" "}
                        <span className="text-white/20 mx-2">@</span>{" "}
                        {game.homeTeam}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {isLive && (
                      <span className="flex items-center gap-1.5 rounded-full bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" />
                        LIVE
                      </span>
                    )}
                    <span className="text-sm text-white/30">{timeLabel}</span>
                  </div>
                </div>

                {/* Best line callout */}
                <div className="border-b border-white/[0.04] bg-[#00D4AA]/[0.03] px-5 py-3">
                  <div className="flex flex-wrap gap-x-8 gap-y-1">
                    {outcomeNames.map((name) => {
                      const b = bestMap.get(name);
                      if (!b) return null;
                      return (
                        <span
                          key={name}
                          className="text-xs text-white/50"
                        >
                          Best {market === "totals" ? name : name}:{" "}
                          <span className="font-semibold text-[#00D4AA]">
                            {b.bestPoint !== undefined && (
                              <>{market === "totals" ? `${b.bestPoint} ` : `${b.bestPoint > 0 ? "+" : ""}${b.bestPoint} `}</>
                            )}
                            {formatOdds(b.bestPrice)}
                          </span>{" "}
                          <span className="text-white/25">
                            ({b.bestBook})
                          </span>
                        </span>
                      );
                    })}
                  </div>
                </div>

                {/* Odds grid */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/[0.04]">
                        <th className="whitespace-nowrap px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-white/25">
                          Sportsbook
                        </th>
                        {outcomeNames.map((name) => (
                          <th
                            key={name}
                            className="whitespace-nowrap px-5 py-3 text-center text-xs font-medium uppercase tracking-wider text-white/25"
                          >
                            {name}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {bookKeys.map((bookKey, idx) => {
                        const outMap = bookOddsMap.get(bookKey);
                        const displayName =
                          data?.bookDisplayNames?.[bookKey] ||
                          marketData.bookmakers.find(
                            (b) => b.key === bookKey
                          )?.title ||
                          bookKey;

                        return (
                          <tr
                            key={bookKey}
                            className={`border-b border-white/[0.03] transition hover:bg-white/[0.02] ${
                              idx % 2 === 0
                                ? "bg-transparent"
                                : "bg-white/[0.01]"
                            }`}
                          >
                            <td className="whitespace-nowrap px-5 py-3 text-white/60 font-medium">
                              {displayName}
                            </td>
                            {outcomeNames.map((name) => {
                              const outcome = outMap?.get(name);
                              if (!outcome) {
                                return (
                                  <td
                                    key={name}
                                    className="px-5 py-3 text-center text-white/10"
                                  >
                                    --
                                  </td>
                                );
                              }

                              const bestForOutcome = bestMap.get(name);
                              const isBest =
                                bestForOutcome?.bestBookKey === bookKey &&
                                bestForOutcome?.bestPrice === outcome.price;

                              return (
                                <td
                                  key={name}
                                  className="px-5 py-3 text-center"
                                >
                                  <span
                                    className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-mono text-sm font-semibold transition ${
                                      isBest
                                        ? "bg-[#00D4AA]/10 text-[#00D4AA] ring-1 ring-[#00D4AA]/20"
                                        : "text-white/70"
                                    }`}
                                  >
                                    {outcome.point !== undefined && (
                                      <span
                                        className={
                                          isBest
                                            ? "text-[#00D4AA]/70"
                                            : "text-white/30"
                                        }
                                      >
                                        {market === "totals"
                                          ? outcome.point
                                          : `${outcome.point > 0 ? "+" : ""}${outcome.point}`}
                                      </span>
                                    )}
                                    {formatOdds(outcome.price)}
                                  </span>
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}

        {/* ─── Footer info ────────────────────────────────────────────── */}
        {data && !loading && (
          <div className="mt-10 flex items-center justify-between text-xs text-white/15">
            <p>
              Powered by The Odds API
              {data.requestsRemaining &&
                ` | ${data.requestsRemaining} requests remaining`}
            </p>
            <p>Odds refresh every 5 minutes. Not financial advice.</p>
          </div>
        )}
      </main>
    </div>
  );
}
