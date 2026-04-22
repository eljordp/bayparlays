"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Menu, X, RefreshCw, Check } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Logo } from "@/app/components/Logo";
import { NavUser } from "@/app/components/NavUser";
import { useAuth } from "@/app/components/AuthProvider";

/* ─── Types ─── */

interface Game {
  id: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: string | null;
  awayScore: string | null;
  status: "live" | "upcoming" | "final";
  commenceTime: string;
  completed: boolean;
}

interface SimLeg {
  pick: string;
  sport: string;
  game: string;
  odds: number;
  book?: string;
}

interface SimParlay {
  id: string;
  legs: SimLeg[];
  status: string;
}

/* ─── Constants ─── */

const SPORTS = [
  { key: "nba", label: "NBA" },
  { key: "nfl", label: "NFL" },
  { key: "mlb", label: "MLB" },
  { key: "nhl", label: "NHL" },
] as const;

// Only auto-refresh during game hours (10am - 1am), once per hour
const POLL_INTERVAL = 60 * 60 * 1000; // 1 hour

/* ─── Animation ─── */

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: i * 0.06,
      duration: 0.5,
      ease: [0.25, 0.1, 0.25, 1] as const,
    },
  }),
};

/* ─── Helpers ─── */

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins === 1) return "1 minute ago";
  if (mins < 60) return `${mins} minutes ago`;
  const hrs = Math.floor(mins / 60);
  return hrs === 1 ? "1 hour ago" : `${hrs} hours ago`;
}

function formatGameTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/** Check if a sim parlay leg matches a game by team name */
function findSimBetsForGame(
  game: Game,
  simParlays: SimParlay[]
): { pick: string }[] {
  const matches: { pick: string }[] = [];
  const teams = [
    game.homeTeam.toLowerCase(),
    game.awayTeam.toLowerCase(),
  ];

  for (const parlay of simParlays) {
    if (parlay.status !== "pending") continue;
    for (const leg of parlay.legs) {
      const pickLower = leg.pick.toLowerCase();
      const gameLower = (leg.game || "").toLowerCase();
      // Match if the pick or game field contains either team name
      const matched = teams.some(
        (t) =>
          pickLower.includes(t.split(" ").pop() || "") ||
          gameLower.includes(t.split(" ").pop() || "")
      );
      if (matched) {
        matches.push({ pick: leg.pick });
      }
    }
  }
  return matches;
}

/* ─── PAGE ─── */

export default function LiveScoreboard() {
  const { user } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sport, setSport] = useState("nba");
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [simParlays, setSimParlays] = useState<SimParlay[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchScores = useCallback(
    async (isManual = false) => {
      if (isManual) setRefreshing(true);
      try {
        const res = await fetch(`/api/scores?sport=${sport}`);
        if (res.ok) {
          const data = await res.json();
          setGames(data.games || []);
          setUpdatedAt(data.updatedAt || new Date().toISOString());
        }
      } catch {
        // silent
      }
      setLoading(false);
      if (isManual) setTimeout(() => setRefreshing(false), 600);
    },
    [sport]
  );

  // Fetch scores on mount and when sport changes
  useEffect(() => {
    setLoading(true);
    fetchScores();

    // Set up polling — only during game hours (10am-1am)
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      const hour = new Date().getHours();
      if (hour >= 10 && hour <= 23) fetchScores(); // 10am to 11pm only
    }, POLL_INTERVAL);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [fetchScores]);

  // Fetch user's sim parlays for the overlay
  useEffect(() => {
    if (!user?.id) {
      setSimParlays([]);
      return;
    }
    async function fetchSim() {
      try {
        const res = await fetch(`/api/sim?user_id=${user!.id}`);
        if (res.ok) {
          const data = await res.json();
          setSimParlays(data.parlays || []);
        }
      } catch {
        // silent
      }
    }
    fetchSim();
  }, [user]);

  const liveGames = games.filter((g) => g.status === "live");
  const upcomingGames = games.filter((g) => g.status === "upcoming");
  const finalGames = games.filter((g) => g.status === "final");

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#ededed] overflow-x-hidden">
      {/* ── NAV ── */}
      <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-xl bg-[#0a0a0a]/80 border-b border-white/[0.06]">
        <div className="w-full max-w-[1400px] mx-auto flex items-center justify-between px-6 md:px-10 h-20">
          <Link href="/" className="flex items-center gap-2 -mb-2">
            <Logo />
          </Link>

          <div className="hidden md:flex items-center gap-8 text-sm text-white/50">
            <Link href="/parlays" className="hover:text-white transition-colors duration-200">
              Parlays
            </Link>
            <Link href="/props" className="hover:text-white transition-colors duration-200">
              Props
            </Link>
            <Link href="/odds" className="hover:text-white transition-colors duration-200">
              Odds
            </Link>
            <Link href="/builder" className="hover:text-white transition-colors duration-200">
              Builder
            </Link>
            <Link href="/results" className="hover:text-white transition-colors duration-200">
              Results
            </Link>
            <Link href="/live" className="text-white transition-colors duration-200">
              Live
            </Link>
            <Link href="/simulator" className="hover:text-white transition-colors duration-200">
              Simulator
            </Link>
          </div>

          <div className="flex items-center gap-3">
            <NavUser />
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden text-white/60 hover:text-white transition-colors"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden border-t border-white/[0.06] bg-[#0a0a0a]/95 backdrop-blur-xl">
            <div className="px-6 py-4 flex flex-col gap-4">
              {[
                { href: "/parlays", label: "Parlays" },
                { href: "/props", label: "Props" },
                { href: "/odds", label: "Odds" },
                { href: "/builder", label: "Builder" },
                { href: "/results", label: "Results" },
                { href: "/live", label: "Live" },
                { href: "/simulator", label: "Simulator" },
              ].map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`text-sm transition-colors duration-200 ${
                    link.href === "/live" ? "text-white" : "text-white/50 hover:text-white"
                  }`}
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
        )}
      </nav>

      {/* ── HEADER ── */}
      <section className="pt-32 md:pt-40 pb-10 md:pb-14">
        <div className="w-full max-w-[1400px] mx-auto px-6 md:px-10">
          <motion.div
            initial="hidden"
            animate="visible"
            className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6"
          >
            <div>
              <motion.div variants={fadeUp} custom={0} className="flex items-center gap-3 mb-5">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#FF3B3B] opacity-75" />
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-[#FF3B3B]" />
                </span>
                <span
                  className="text-xs font-bold uppercase tracking-[0.2em] text-[#FF3B3B]"
                  style={{ fontFamily: "var(--font-geist-mono)" }}
                >
                  Live
                </span>
              </motion.div>

              <motion.h1
                variants={fadeUp}
                custom={1}
                className="text-4xl sm:text-5xl md:text-6xl tracking-tight leading-[0.95]"
                style={{ fontFamily: "'DM Serif Display', serif" }}
              >
                Live Scores
              </motion.h1>

              <motion.p
                variants={fadeUp}
                custom={2}
                className="text-base text-white/35 mt-4 max-w-md"
              >
                Real-time scores. See your picks play out.
              </motion.p>
            </div>

            {/* Last updated + refresh */}
            <motion.div
              variants={fadeUp}
              custom={3}
              className="flex items-center gap-4"
            >
              {updatedAt && (
                <span
                  className="text-xs text-white/25"
                  style={{ fontFamily: "var(--font-geist-mono)" }}
                >
                  Updated {timeAgo(updatedAt)}
                </span>
              )}
              <button
                onClick={() => fetchScores(true)}
                disabled={refreshing}
                className="flex items-center gap-2 text-xs text-white/40 hover:text-white border border-white/[0.08] hover:border-white/[0.15] px-4 py-2 rounded-full transition-all duration-200 disabled:opacity-40"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`}
                />
                Refresh
              </button>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ── SPORT TABS ── */}
      <section className="border-b border-white/[0.06]">
        <div className="w-full max-w-[1400px] mx-auto px-6 md:px-10">
          <div className="flex gap-1 overflow-x-auto scrollbar-hide">
            {SPORTS.map((s) => (
              <button
                key={s.key}
                onClick={() => setSport(s.key)}
                className={`relative px-6 py-4 text-sm font-medium transition-colors duration-200 whitespace-nowrap ${
                  sport === s.key
                    ? "text-white"
                    : "text-white/30 hover:text-white/60"
                }`}
                style={{ fontFamily: "var(--font-geist-mono)" }}
              >
                {s.label}
                {sport === s.key && (
                  <motion.div
                    layoutId="sport-tab"
                    className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#FF3B3B]"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ── GAMES ── */}
      <section className="py-12 md:py-16">
        <div className="w-full max-w-[1400px] mx-auto px-6 md:px-10">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-32">
              <div className="w-8 h-8 border-2 border-white/10 border-t-[#FF3B3B] rounded-full animate-spin mb-4" />
              <p className="text-sm text-white/25">Loading scores...</p>
            </div>
          ) : games.length === 0 ? (
            /* Empty state */
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center justify-center py-32 text-center"
            >
              <div className="w-16 h-16 rounded-full bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mb-6">
                <span className="text-2xl">&#127944;</span>
              </div>
              <h3
                className="text-xl text-white/60 mb-2"
                style={{ fontFamily: "'DM Serif Display', serif" }}
              >
                No games today
              </h3>
              <p className="text-sm text-white/25 max-w-sm">
                Check back when games are scheduled. Try switching sports above.
              </p>
            </motion.div>
          ) : (
            <div className="space-y-16">
              {/* Live Games */}
              {liveGames.length > 0 && (
                <div>
                  <div className="flex items-center gap-3 mb-8">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#FF3B3B] opacity-75" />
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#FF3B3B]" />
                    </span>
                    <h2
                      className="text-xs font-bold uppercase tracking-[0.2em] text-[#FF3B3B]"
                      style={{ fontFamily: "var(--font-geist-mono)" }}
                    >
                      Live Now
                    </h2>
                    <span className="text-xs text-white/20" style={{ fontFamily: "var(--font-geist-mono)" }}>
                      {liveGames.length} {liveGames.length === 1 ? "game" : "games"}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {liveGames.map((game, i) => (
                      <GameCard
                        key={game.id}
                        game={game}
                        index={i}
                        simBets={findSimBetsForGame(game, simParlays)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Upcoming Games */}
              {upcomingGames.length > 0 && (
                <div>
                  <div className="flex items-center gap-3 mb-8">
                    <h2
                      className="text-xs font-bold uppercase tracking-[0.2em] text-white/30"
                      style={{ fontFamily: "var(--font-geist-mono)" }}
                    >
                      Upcoming
                    </h2>
                    <span className="text-xs text-white/15" style={{ fontFamily: "var(--font-geist-mono)" }}>
                      {upcomingGames.length} {upcomingGames.length === 1 ? "game" : "games"}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {upcomingGames.map((game, i) => (
                      <GameCard
                        key={game.id}
                        game={game}
                        index={i}
                        simBets={findSimBetsForGame(game, simParlays)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Final Games */}
              {finalGames.length > 0 && (
                <div>
                  <div className="flex items-center gap-3 mb-8">
                    <h2
                      className="text-xs font-bold uppercase tracking-[0.2em] text-white/25"
                      style={{ fontFamily: "var(--font-geist-mono)" }}
                    >
                      Final
                    </h2>
                    <span className="text-xs text-white/15" style={{ fontFamily: "var(--font-geist-mono)" }}>
                      {finalGames.length} {finalGames.length === 1 ? "game" : "games"}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {finalGames.map((game, i) => (
                      <GameCard
                        key={game.id}
                        game={game}
                        index={i}
                        simBets={findSimBetsForGame(game, simParlays)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="border-t border-white/[0.04] py-16 md:py-20 mt-8">
        <div className="w-full max-w-[1400px] mx-auto px-6 md:px-10">
          <div className="flex flex-col md:flex-row items-start justify-between gap-10 mb-12">
            <Logo size="sm" />
            <div className="flex flex-wrap gap-x-10 gap-y-3 text-sm text-white/30">
              <Link href="/parlays" className="hover:text-white/60 transition-colors">
                Parlays
              </Link>
              <Link href="/odds" className="hover:text-white/60 transition-colors">
                Odds
              </Link>
              <Link href="/builder" className="hover:text-white/60 transition-colors">
                Builder
              </Link>
              <Link href="/subscribe" className="hover:text-white/60 transition-colors">
                Pricing
              </Link>
              <Link href="/live" className="hover:text-white/60 transition-colors">
                Live
              </Link>
            </div>
          </div>
          <div className="pt-8 border-t border-white/[0.04] flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-xs text-white/20">
              &copy; {new Date().getFullYear()} BayParlays. All rights reserved.
            </p>
            <p className="text-xs text-white/15 max-w-lg text-center md:text-right leading-relaxed">
              For entertainment purposes only. BayParlays does not accept or place bets.
              Please gamble responsibly. If you or someone you know has a gambling problem,
              call 1-800-GAMBLER.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ─── GAME CARD ─── */

function GameCard({
  game,
  index,
  simBets,
}: {
  game: Game;
  index: number;
  simBets: { pick: string }[];
}) {
  const isLive = game.status === "live";
  const isFinal = game.status === "final";
  const isUpcoming = game.status === "upcoming";

  const homeNum = game.homeScore !== null ? parseInt(game.homeScore) : null;
  const awayNum = game.awayScore !== null ? parseInt(game.awayScore) : null;
  const homeWinning =
    homeNum !== null && awayNum !== null ? homeNum >= awayNum : false;
  const awayWinning =
    homeNum !== null && awayNum !== null ? awayNum > homeNum : false;

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={fadeUp}
      custom={index}
      className={`
        relative rounded-xl border transition-all duration-300
        ${
          isLive
            ? "bg-[#111] border-l-4 border-l-[#FF3B3B] border-t-white/[0.06] border-r-white/[0.06] border-b-white/[0.06] hover:border-t-white/[0.1] hover:border-r-white/[0.1] hover:border-b-white/[0.1]"
            : isFinal
            ? "bg-[#0e0e0e] border-white/[0.04] opacity-75 hover:opacity-90"
            : "bg-[#0e0e0e] border-white/[0.06] hover:border-white/[0.1]"
        }
      `}
    >
      <div className="p-6 md:p-8">
        {/* Status badge */}
        <div className="flex items-center justify-between mb-6">
          {isLive && (
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#FF3B3B] opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#FF3B3B]" />
              </span>
              <span
                className="text-[11px] font-bold uppercase tracking-[0.15em] text-[#FF3B3B]"
                style={{ fontFamily: "var(--font-geist-mono)" }}
              >
                Live
              </span>
            </div>
          )}
          {isUpcoming && (
            <div className="flex items-center gap-2">
              <span
                className="text-[11px] font-medium uppercase tracking-[0.15em] text-white/25"
                style={{ fontFamily: "var(--font-geist-mono)" }}
              >
                Upcoming
              </span>
              <span className="text-[11px] text-white/20" style={{ fontFamily: "var(--font-geist-mono)" }}>
                {formatGameTime(game.commenceTime)}
              </span>
            </div>
          )}
          {isFinal && (
            <span
              className="text-[11px] font-bold uppercase tracking-[0.15em] text-white/30"
              style={{ fontFamily: "var(--font-geist-mono)" }}
            >
              Final
            </span>
          )}
        </div>

        {/* Teams + Scores */}
        <div className="space-y-3">
          {/* Away team */}
          <div className="flex items-center justify-between">
            <span
              className={`text-base md:text-lg font-medium truncate pr-4 ${
                isFinal && !awayWinning ? "text-white/30" : isUpcoming ? "text-white/60" : "text-white/80"
              }`}
            >
              {game.awayTeam}
            </span>
            {!isUpcoming && game.awayScore !== null && (
              <div className="flex items-center gap-2">
                <span
                  className={`text-2xl md:text-[36px] font-bold leading-none tabular-nums ${
                    isLive && awayWinning
                      ? "text-white"
                      : isLive
                      ? "text-white/40"
                      : isFinal && awayWinning
                      ? "text-white"
                      : "text-white/30"
                  }`}
                  style={{ fontFamily: "var(--font-geist-mono)" }}
                >
                  {game.awayScore}
                </span>
                {isFinal && awayWinning && (
                  <Check className="w-4 h-4 text-[#22C55E]" />
                )}
              </div>
            )}
          </div>

          {/* Home team */}
          <div className="flex items-center justify-between">
            <span
              className={`text-base md:text-lg font-medium truncate pr-4 ${
                isFinal && !homeWinning ? "text-white/30" : isUpcoming ? "text-white/60" : "text-white/80"
              }`}
            >
              {game.homeTeam}
            </span>
            {!isUpcoming && game.homeScore !== null && (
              <div className="flex items-center gap-2">
                <span
                  className={`text-2xl md:text-[36px] font-bold leading-none tabular-nums ${
                    isLive && homeWinning
                      ? "text-white"
                      : isLive
                      ? "text-white/40"
                      : isFinal && homeWinning
                      ? "text-white"
                      : "text-white/30"
                  }`}
                  style={{ fontFamily: "var(--font-geist-mono)" }}
                >
                  {game.homeScore}
                </span>
                {isFinal && homeWinning && (
                  <Check className="w-4 h-4 text-[#22C55E]" />
                )}
              </div>
            )}
          </div>
        </div>

        {/* Sim bet overlay */}
        {simBets.length > 0 && (
          <div className="mt-5 pt-4 border-t border-white/[0.06]">
            {simBets.map((bet, i) => (
              <div
                key={i}
                className="inline-flex items-center gap-1.5 bg-[#FF3B3B]/10 border border-[#FF3B3B]/20 rounded-full px-3 py-1 mr-2 mb-1"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-[#FF3B3B]" />
                <span
                  className="text-[10px] font-semibold text-[#FF3B3B]"
                  style={{ fontFamily: "var(--font-geist-mono)" }}
                >
                  Your sim bet: {bet.pick}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
