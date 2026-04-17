"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";

// ─── Types ───────────────────────────────────────────────────────────────────

interface BestOdds {
  outcomeName: string;
  bestPrice: number;
  bestPoint?: number;
  bestBook: string;
  bestBookKey: string;
}

interface BookmakerOdds {
  key: string;
  title: string;
  outcomes: { name: string; price: number; point?: number }[];
  lastUpdate: string;
}

interface MarketOdds {
  key: string;
  bookmakers: BookmakerOdds[];
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

interface ParlayLeg {
  id: string; // unique key for this leg
  gameId: string;
  sport: string;
  homeTeam: string;
  awayTeam: string;
  market: string; // h2h, spreads, totals
  pick: string; // outcome name
  odds: number; // American odds
  point?: number;
  book: string;
}

// ─── Math Utilities ──────────────────────────────────────────────────────────

function americanToDecimal(odds: number): number {
  if (odds > 0) return odds / 100 + 1;
  return 100 / Math.abs(odds) + 1;
}

function americanToImpliedProb(odds: number): number {
  if (odds > 0) return 100 / (odds + 100);
  return Math.abs(odds) / (Math.abs(odds) + 100);
}

function decimalToAmerican(decimal: number): number {
  if (decimal >= 2) return Math.round((decimal - 1) * 100);
  return Math.round(-100 / (decimal - 1));
}

function formatOdds(odds: number): string {
  return odds > 0 ? `+${odds}` : `${odds}`;
}

function formatMoney(amount: number): string {
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function formatMoneyDecimal(amount: number): string {
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// ─── Constants ───────────────────────────────────────────────────────────────

const SPORTS = [
  { key: "nba", label: "NBA" },
  { key: "nfl", label: "NFL" },
  { key: "mlb", label: "MLB" },
  { key: "ufc", label: "UFC" },
  { key: "nhl", label: "NHL" },
] as const;

const MARKET_LABELS: Record<string, string> = {
  h2h: "Moneyline",
  spreads: "Spread",
  totals: "Total",
};

const MAX_LEGS = 10;

// ─── Component ───────────────────────────────────────────────────────────────

export default function BuilderPage() {
  const [activeSport, setActiveSport] = useState<string>("nba");
  const [games, setGames] = useState<GameOdds[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [legs, setLegs] = useState<ParlayLeg[]>([]);
  const [stake, setStake] = useState<string>("100");
  const [activeMarket, setActiveMarket] = useState<string>("h2h");

  // Fetch games when sport changes
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/odds?sport=${activeSport}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch odds");
        return res.json();
      })
      .then((data: OddsResponse) => {
        if (!cancelled) {
          setGames(data.games);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeSport]);

  // Build a leg ID from its properties
  const makeLegId = useCallback(
    (gameId: string, market: string, pick: string) =>
      `${gameId}::${market}::${pick}`,
    []
  );

  // Check if a specific bet is already in the slip
  const isSelected = useCallback(
    (gameId: string, market: string, pick: string) =>
      legs.some((l) => l.id === makeLegId(gameId, market, pick)),
    [legs, makeLegId]
  );

  // Toggle a leg in/out of the slip
  const toggleLeg = useCallback(
    (game: GameOdds, market: string, outcome: BestOdds) => {
      const legId = makeLegId(game.id, market, outcome.outcomeName);

      setLegs((prev) => {
        const exists = prev.find((l) => l.id === legId);
        if (exists) {
          return prev.filter((l) => l.id !== legId);
        }
        if (prev.length >= MAX_LEGS) return prev;
        return [
          ...prev,
          {
            id: legId,
            gameId: game.id,
            sport: activeSport.toUpperCase(),
            homeTeam: game.homeTeam,
            awayTeam: game.awayTeam,
            market,
            pick: outcome.outcomeName,
            odds: outcome.bestPrice,
            point: outcome.bestPoint,
            book: outcome.bestBook,
          },
        ];
      });
    },
    [activeSport, makeLegId]
  );

  const removeLeg = useCallback((legId: string) => {
    setLegs((prev) => prev.filter((l) => l.id !== legId));
  }, []);

  // Parlay calculations
  const calculations = useMemo(() => {
    if (legs.length < 2) return null;

    const decimalOdds = legs.map((l) => americanToDecimal(l.odds));
    const parlayDecimal = decimalOdds.reduce((acc, d) => acc * d, 1);
    const parlayAmerican = decimalToAmerican(parlayDecimal);

    const impliedProbs = legs.map((l) => americanToImpliedProb(l.odds));
    const combinedProb = impliedProbs.reduce((acc, p) => acc * p, 1);

    const ev = (parlayDecimal * combinedProb - 1) * 100;

    const stakeNum = parseFloat(stake) || 0;
    const payout = stakeNum * parlayDecimal;
    const toWin = payout - stakeNum;

    return {
      parlayDecimal,
      parlayAmerican,
      combinedProb,
      ev,
      stakeNum,
      payout,
      toWin,
    };
  }, [legs, stake]);

  // Format game time
  const formatTime = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = d.getTime() - now.getTime();

    if (diffMs < 0) return "LIVE";

    if (diffMs < 86400000) {
      return d.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
    }

    return d.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  // Get the best outcomes for a game + market
  const getMarketOutcomes = (
    game: GameOdds,
    market: string
  ): BestOdds[] => {
    return game.bestOdds[market] || [];
  };

  // Format the pick label
  const formatPick = (leg: ParlayLeg): string => {
    if (leg.market === "spreads" && leg.point !== undefined) {
      return `${leg.pick} ${leg.point > 0 ? "+" : ""}${leg.point}`;
    }
    if (leg.market === "totals" && leg.point !== undefined) {
      return `${leg.pick} ${leg.point}`;
    }
    return leg.pick;
  };

  // Format outcome label for the game browser
  const formatOutcomeLabel = (
    outcome: BestOdds,
    market: string,
    game: GameOdds
  ): string => {
    if (market === "spreads" && outcome.bestPoint !== undefined) {
      const prefix =
        outcome.outcomeName === game.homeTeam
          ? game.homeTeam.split(" ").pop()
          : game.awayTeam.split(" ").pop();
      return `${prefix} ${outcome.bestPoint > 0 ? "+" : ""}${outcome.bestPoint}`;
    }
    if (market === "totals") {
      return `${outcome.outcomeName} ${outcome.bestPoint ?? ""}`;
    }
    // moneyline — just use team short name
    const isHome = outcome.outcomeName === game.homeTeam;
    const team = isHome ? game.homeTeam : game.awayTeam;
    return team.split(" ").pop() || team;
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#ededed]">
      {/* ── Nav ──────────────────────────────────────────────────── */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[#0a0a0a]/90 backdrop-blur-md border-b border-white/[0.06]">
        <div className="max-w-[1600px] mx-auto px-6 h-14 flex items-center justify-between">
          <Link
            href="/"
            className="text-lg font-black tracking-tight text-white"
          >
            BayParlays
          </Link>
          <div className="flex items-center gap-6 text-sm text-white/50">
            <Link href="/" className="hover:text-white transition-colors">
              Home
            </Link>
            <Link
              href="/parlays"
              className="hover:text-white transition-colors"
            >
              Parlays
            </Link>
            <Link href="/odds" className="hover:text-white transition-colors">
              Odds
            </Link>
            <Link
              href="/builder"
              className="text-[#00D4AA] font-medium"
            >
              Builder
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Main ─────────────────────────────────────────────────── */}
      <main className="pt-14">
        {/* Header */}
        <div className="border-b border-white/[0.06]">
          <div className="max-w-[1600px] mx-auto px-6 py-8">
            <motion.h1
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="text-3xl md:text-4xl font-black tracking-tight"
              style={{ fontFamily: "'DM Serif Display', serif" }}
            >
              Parlay Builder
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.1 }}
              className="text-white/40 mt-2 text-sm md:text-base"
            >
              Pick your legs. We find the best odds across every book and
              calculate your edge in real time.
            </motion.p>
          </div>
        </div>

        {/* Two-column layout */}
        <div className="max-w-[1600px] mx-auto px-6 py-8">
          <div className="flex flex-col lg:flex-row gap-8">
            {/* ── Left: Game Browser ─────────────────────────────── */}
            <div className="flex-1 min-w-0">
              {/* Sport Tabs */}
              <div className="flex items-center gap-1 mb-6 overflow-x-auto pb-1 scrollbar-hide">
                {SPORTS.map((sport) => (
                  <button
                    key={sport.key}
                    onClick={() => setActiveSport(sport.key)}
                    className={`
                      px-4 py-2 rounded-md text-sm font-semibold transition-all whitespace-nowrap
                      ${
                        activeSport === sport.key
                          ? "bg-[#00D4AA] text-[#0a0a0a]"
                          : "bg-white/[0.04] text-white/50 hover:bg-white/[0.08] hover:text-white/80"
                      }
                    `}
                  >
                    {sport.label}
                  </button>
                ))}
              </div>

              {/* Market sub-tabs */}
              <div className="flex items-center gap-1 mb-6">
                {["h2h", "spreads", "totals"].map((mkt) => (
                  <button
                    key={mkt}
                    onClick={() => setActiveMarket(mkt)}
                    className={`
                      px-3 py-1.5 rounded text-xs font-medium uppercase tracking-wider transition-all
                      ${
                        activeMarket === mkt
                          ? "bg-white/[0.1] text-white"
                          : "text-white/30 hover:text-white/60"
                      }
                    `}
                  >
                    {MARKET_LABELS[mkt]}
                  </button>
                ))}
              </div>

              {/* Loading state */}
              {loading && (
                <div className="space-y-4">
                  {[...Array(4)].map((_, i) => (
                    <div
                      key={i}
                      className="h-24 rounded-lg bg-white/[0.03] animate-pulse"
                    />
                  ))}
                </div>
              )}

              {/* Error state */}
              {error && (
                <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-6 py-4 text-red-400 text-sm">
                  {error}
                </div>
              )}

              {/* No games */}
              {!loading && !error && games.length === 0 && (
                <div className="text-center py-16 text-white/30 text-sm">
                  No games available for {activeSport.toUpperCase()} right now.
                </div>
              )}

              {/* Game list */}
              {!loading && !error && games.length > 0 && (
                <motion.div
                  key={`${activeSport}-${activeMarket}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.3 }}
                  className="space-y-3"
                >
                  {games.map((game, idx) => {
                    const outcomes = getMarketOutcomes(game, activeMarket);
                    if (outcomes.length === 0) return null;

                    const timeStr = formatTime(game.commenceTime);
                    const isLive = timeStr === "LIVE";

                    return (
                      <motion.div
                        key={game.id}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, delay: idx * 0.04 }}
                        className="rounded-lg bg-white/[0.025] border border-white/[0.06] hover:border-white/[0.1] transition-all"
                      >
                        {/* Game header */}
                        <div className="px-4 pt-3 pb-2 flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 text-sm font-semibold">
                              <span className="text-white/90 truncate">
                                {game.awayTeam}
                              </span>
                              <span className="text-white/20 text-xs">@</span>
                              <span className="text-white/90 truncate">
                                {game.homeTeam}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 ml-3 shrink-0">
                            {isLive && (
                              <span className="flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-[#00D4AA] glow-pulse" />
                                <span className="text-[#00D4AA] text-xs font-semibold uppercase">
                                  Live
                                </span>
                              </span>
                            )}
                            {!isLive && (
                              <span className="text-white/30 text-xs">
                                {timeStr}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Bet options */}
                        <div className="px-4 pb-3">
                          <div className="grid grid-cols-2 gap-2">
                            {outcomes.map((outcome) => {
                              const selected = isSelected(
                                game.id,
                                activeMarket,
                                outcome.outcomeName
                              );
                              const atMax =
                                legs.length >= MAX_LEGS && !selected;

                              return (
                                <button
                                  key={outcome.outcomeName}
                                  onClick={() =>
                                    toggleLeg(game, activeMarket, outcome)
                                  }
                                  disabled={atMax}
                                  className={`
                                    relative group rounded-md px-3 py-2.5 text-left transition-all
                                    ${
                                      selected
                                        ? "bg-[#00D4AA]/10 border border-[#00D4AA]/50 ring-1 ring-[#00D4AA]/20"
                                        : atMax
                                          ? "bg-white/[0.02] border border-white/[0.04] opacity-40 cursor-not-allowed"
                                          : "bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] hover:border-white/[0.12] cursor-pointer"
                                    }
                                  `}
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <span
                                      className={`text-xs font-medium truncate ${selected ? "text-[#00D4AA]" : "text-white/60"}`}
                                    >
                                      {formatOutcomeLabel(
                                        outcome,
                                        activeMarket,
                                        game
                                      )}
                                    </span>
                                    <span
                                      className={`text-sm font-bold tabular-nums whitespace-nowrap ${selected ? "text-[#00D4AA]" : "text-white"}`}
                                    >
                                      {formatOdds(outcome.bestPrice)}
                                    </span>
                                  </div>
                                  <div
                                    className={`text-[10px] mt-0.5 ${selected ? "text-[#00D4AA]/50" : "text-white/25"}`}
                                  >
                                    {outcome.bestBook}
                                  </div>
                                  {selected && (
                                    <motion.div
                                      layoutId="check"
                                      className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-[#00D4AA] flex items-center justify-center"
                                    >
                                      <svg
                                        width="10"
                                        height="8"
                                        viewBox="0 0 10 8"
                                        fill="none"
                                      >
                                        <path
                                          d="M1 4L3.5 6.5L9 1"
                                          stroke="#0a0a0a"
                                          strokeWidth="1.5"
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                        />
                                      </svg>
                                    </motion.div>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </motion.div>
              )}
            </div>

            {/* ── Right: Parlay Slip ─────────────────────────────── */}
            <div className="lg:w-[400px] shrink-0">
              <div className="lg:sticky lg:top-[72px]">
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.2 }}
                  className="rounded-xl bg-white/[0.025] border border-white/[0.08] overflow-hidden"
                >
                  {/* Slip header */}
                  <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <h2 className="text-base font-bold text-white">
                        Your Parlay
                      </h2>
                      {legs.length > 0 && (
                        <span className="text-xs font-bold bg-[#00D4AA] text-[#0a0a0a] px-2 py-0.5 rounded-full">
                          {legs.length} leg{legs.length !== 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                    {legs.length > 0 && (
                      <button
                        onClick={() => setLegs([])}
                        className="text-xs text-white/30 hover:text-red-400 transition-colors"
                      >
                        Clear all
                      </button>
                    )}
                  </div>

                  {/* Empty state */}
                  {legs.length === 0 && (
                    <div className="px-5 py-12 text-center">
                      <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-white/[0.04] flex items-center justify-center">
                        <svg
                          width="20"
                          height="20"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          className="text-white/20"
                        >
                          <path d="M12 5v14M5 12h14" strokeLinecap="round" />
                        </svg>
                      </div>
                      <p className="text-white/30 text-sm leading-relaxed">
                        Add picks from the left to
                        <br />
                        build your parlay
                      </p>
                    </div>
                  )}

                  {/* Legs */}
                  {legs.length > 0 && (
                    <div className="max-h-[320px] overflow-y-auto">
                      <AnimatePresence mode="popLayout">
                        {legs.map((leg) => (
                          <motion.div
                            key={leg.id}
                            layout
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20, height: 0 }}
                            transition={{ duration: 0.2 }}
                            className="px-5 py-3 border-b border-white/[0.04] group"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="text-[10px] uppercase tracking-wider text-white/25 mb-0.5">
                                  {leg.sport} / {MARKET_LABELS[leg.market]}
                                </div>
                                <div className="text-sm font-semibold text-white/90 truncate">
                                  {formatPick(leg)}
                                </div>
                                <div className="text-xs text-white/30 mt-0.5 truncate">
                                  {leg.awayTeam} @ {leg.homeTeam}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <div className="text-right">
                                  <div className="text-sm font-bold text-[#00D4AA] tabular-nums">
                                    {formatOdds(leg.odds)}
                                  </div>
                                  <div className="text-[10px] text-white/25">
                                    {leg.book}
                                  </div>
                                </div>
                                <button
                                  onClick={() => removeLeg(leg.id)}
                                  className="w-6 h-6 rounded-full flex items-center justify-center text-white/20 hover:text-red-400 hover:bg-red-400/10 transition-all opacity-0 group-hover:opacity-100"
                                >
                                  <svg
                                    width="12"
                                    height="12"
                                    viewBox="0 0 12 12"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="1.5"
                                  >
                                    <path
                                      d="M2 2l8 8M10 2l-8 8"
                                      strokeLinecap="round"
                                    />
                                  </svg>
                                </button>
                              </div>
                            </div>
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    </div>
                  )}

                  {/* Single leg message */}
                  {legs.length === 1 && (
                    <div className="px-5 py-4 text-center text-white/30 text-xs border-t border-white/[0.04]">
                      Add at least one more leg to see parlay odds
                    </div>
                  )}

                  {/* Calculations */}
                  {calculations && legs.length >= 2 && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.3 }}
                      className="border-t border-white/[0.06]"
                    >
                      {/* Parlay odds */}
                      <div className="px-5 pt-5 pb-3">
                        <div className="text-[10px] uppercase tracking-wider text-white/30 mb-1">
                          Parlay Odds
                        </div>
                        <div className="flex items-baseline gap-3">
                          <span className="text-3xl font-black text-[#00D4AA] tabular-nums tracking-tight">
                            {formatOdds(calculations.parlayAmerican)}
                          </span>
                          <span className="text-sm text-white/30 tabular-nums">
                            {calculations.parlayDecimal.toFixed(2)}x
                          </span>
                        </div>
                      </div>

                      {/* Stats row */}
                      <div className="px-5 pb-3 grid grid-cols-2 gap-3">
                        <div>
                          <div className="text-[10px] uppercase tracking-wider text-white/25 mb-0.5">
                            Implied Prob
                          </div>
                          <div className="text-sm font-semibold text-white/80 tabular-nums">
                            {(calculations.combinedProb * 100).toFixed(2)}%
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase tracking-wider text-white/25 mb-0.5">
                            Expected Value
                          </div>
                          <div
                            className={`text-sm font-semibold tabular-nums ${
                              calculations.ev >= 0
                                ? "text-[#00D4AA]"
                                : "text-red-400"
                            }`}
                          >
                            {calculations.ev >= 0 ? "+" : ""}
                            {calculations.ev.toFixed(1)}%
                          </div>
                        </div>
                      </div>

                      {/* EV Bar */}
                      <div className="px-5 pb-4">
                        <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{
                              width: `${Math.min(Math.max((calculations.ev + 50) * 1, 2), 100)}%`,
                            }}
                            transition={{ duration: 0.6, ease: "easeOut" }}
                            className={`h-full rounded-full ${
                              calculations.ev >= 0
                                ? "bg-gradient-to-r from-[#00D4AA]/60 to-[#00D4AA]"
                                : "bg-gradient-to-r from-red-500/60 to-red-400"
                            }`}
                          />
                        </div>
                        <div className="flex justify-between mt-1">
                          <span className="text-[9px] text-white/15">-EV</span>
                          <span className="text-[9px] text-white/15">+EV</span>
                        </div>
                      </div>

                      {/* Stake + Payout */}
                      <div className="px-5 pb-5 space-y-3">
                        {/* Stake input */}
                        <div>
                          <div className="text-[10px] uppercase tracking-wider text-white/25 mb-1.5">
                            Stake
                          </div>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 text-sm">
                              $
                            </span>
                            <input
                              type="number"
                              min="1"
                              value={stake}
                              onChange={(e) => setStake(e.target.value)}
                              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg pl-7 pr-4 py-2.5 text-white text-sm font-semibold tabular-nums focus:outline-none focus:border-[#00D4AA]/40 focus:ring-1 focus:ring-[#00D4AA]/20 transition-all"
                            />
                          </div>
                        </div>

                        {/* Payout */}
                        <div className="rounded-lg bg-[#00D4AA]/[0.06] border border-[#00D4AA]/[0.12] px-4 py-4">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs text-white/40">
                              Potential Payout
                            </span>
                            <span className="text-sm font-semibold text-white/60 tabular-nums">
                              {formatMoneyDecimal(calculations.payout)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-bold text-[#00D4AA]">
                              To Win
                            </span>
                            <span className="text-2xl font-black text-[#00D4AA] tabular-nums tracking-tight">
                              {formatMoney(calculations.toWin)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {/* Leg count bar at bottom */}
                  {legs.length > 0 && (
                    <div className="px-5 py-3 bg-white/[0.02] border-t border-white/[0.04]">
                      <div className="flex items-center justify-between text-[10px] text-white/25">
                        <span>
                          {legs.length}/{MAX_LEGS} legs
                        </span>
                        <span>
                          Best odds across all books
                        </span>
                      </div>
                      <div className="mt-1.5 h-1 rounded-full bg-white/[0.04] overflow-hidden">
                        <motion.div
                          animate={{
                            width: `${(legs.length / MAX_LEGS) * 100}%`,
                          }}
                          transition={{ duration: 0.3 }}
                          className="h-full rounded-full bg-[#00D4AA]/40"
                        />
                      </div>
                    </div>
                  )}
                </motion.div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
