"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  TrendingUp,
  TrendingDown,
  Lock,
  Loader2,
  ChevronDown,
  ChevronUp,
  DollarSign,
  Pencil,
  Check,
} from "lucide-react";
import { AppNav } from "@/app/components/AppNav";
import { useAuth } from "@/app/components/AuthProvider";
import { supabase } from "@/lib/supabase";

/* ─── Types ─── */

interface SimBankroll {
  user_id: string;
  balance: number;
  starting_balance: number;
  total_wagered: number;
  total_won: number;
  total_lost: number;
  wins: number;
  losses: number;
}

interface SimLeg {
  sport: string;
  pick: string;
  game: string;
  odds: number;
  book: string;
  commenceTime?: string;
}

// Given a parlay's legs, figure out its lifecycle status based on commence
// times. "Upcoming" = all games still in the future. "Live" = at least one
// game started within the last ~4 hours. "Awaiting result" = all games are
// past their start+3h window, we're just waiting on the resolver. Returns
// null if the parlay has no commenceTime data (older bets before we stored it).
type GameStatus =
  | { kind: "upcoming"; startsIn: string }
  | { kind: "live"; label: string }
  | { kind: "awaiting"; label: string };

function getGameStatus(legs: SimLeg[]): GameStatus | null {
  const times = legs
    .map((l) => (l.commenceTime ? new Date(l.commenceTime).getTime() : null))
    .filter((t): t is number => typeof t === "number");
  if (times.length === 0) return null;

  const now = Date.now();
  const earliest = Math.min(...times);
  const latest = Math.max(...times);
  // Assume 3 hours is enough to finish a game (NBA/NHL/MLB all typically <3h).
  const GAME_DURATION_MS = 3 * 60 * 60 * 1000;
  const latestEnd = latest + GAME_DURATION_MS;

  if (earliest > now) {
    const diff = earliest - now;
    const hours = Math.floor(diff / (60 * 60 * 1000));
    const minutes = Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000));
    const startsIn =
      hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
    return { kind: "upcoming", startsIn };
  }
  if (now < latestEnd) {
    return { kind: "live", label: "Live" };
  }
  return { kind: "awaiting", label: "Awaiting result" };
}

type PickCategory = "ev" | "payout" | "confidence";

interface SimParlay {
  id: string;
  created_at: string;
  legs: SimLeg[];
  combined_odds: string;
  combined_decimal: number;
  stake: number;
  payout: number;
  status: "pending" | "won" | "lost";
  profit: number;
  resolved_at: string | null;
  category?: PickCategory | null;
}

const CATEGORY_META: Record<PickCategory, { label: string; color: string; bg: string; border: string }> = {
  ev: {
    label: "Best EV",
    color: "text-[#22C55E]",
    bg: "bg-[#22C55E]/10",
    border: "border-[#22C55E]/20",
  },
  payout: {
    label: "Highest Payout",
    color: "text-[#0a0a0a]",
    bg: "bg-[#0a0a0a]/10",
    border: "border-[#0a0a0a]/20",
  },
  confidence: {
    label: "Most Confident",
    color: "text-[#60A5FA]",
    bg: "bg-[#60A5FA]/10",
    border: "border-[#60A5FA]/20",
  },
};

/* ─── Animations ─── */

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: i * 0.08,
      duration: 0.5,
      ease: [0.22, 1, 0.36, 1] as const,
    },
  }),
};

/* ─── Page ─── */

export default function SimulatorPage() {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { user, isPro, isAdmin, loading: authLoading } = useAuth();

  const [isVip, setIsVip] = useState(false);
  const [userTier, setUserTier] = useState<string>("free");
  const [tierLoading, setTierLoading] = useState(true);

  // Sim state
  const [bankroll, setBankroll] = useState<SimBankroll | null>(null);
  const [parlays, setParlays] = useState<SimParlay[]>([]);
  const [expandedParlay, setExpandedParlay] = useState<string | null>(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  // Cash out state
  const [cashoutValues, setCashoutValues] = useState<Record<string, number>>({});
  const [cashingOut, setCashingOut] = useState<string | null>(null);

  // Edit stake state
  const [editingParlay, setEditingParlay] = useState<string | null>(null);
  const [editStake, setEditStake] = useState<number>(0);
  const [savingEdit, setSavingEdit] = useState(false);

  // Check VIP tier
  useEffect(() => {
    if (!user) {
      setTierLoading(false);
      return;
    }

    if (isAdmin) {
      setIsVip(true);
      setTierLoading(false);
      return;
    }

    async function checkTier() {
      const { data } = await supabase
        .from("users")
        .select("subscription_tier, subscription_status")
        .eq("email", user!.email)
        .single();

      const active =
        data?.subscription_status === "active" ||
        data?.subscription_status === "trialing";
      const hasAccess = data?.subscription_tier === "vip" || data?.subscription_tier === "sharp" || data?.subscription_tier === "admin";
      setUserTier(data?.subscription_tier || "free");
      setIsVip(active && hasAccess);
      setTierLoading(false);
    }

    checkTier();
  }, [user, isAdmin]);

  // Load bankroll + history
  const loadData = useCallback(async () => {
    if (!user) return;

    setDataLoading(true);

    // Initialize bankroll if needed
    const { data: existing } = await supabase
      .from("sim_bankroll")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (!existing) {
      // Sharp gets $1K, VIP/Admin gets $10K
      const startingBalance = userTier === "vip" || userTier === "admin" ? 10000 : 1000;
      await supabase.from("sim_bankroll").insert({
        user_id: user.id,
        balance: startingBalance,
        starting_balance: startingBalance,
      });
    }

    // Fetch from API
    const res = await fetch(`/api/sim?user_id=${user.id}`);
    if (res.ok) {
      const data = await res.json();
      setBankroll(data.bankroll);
      setParlays(data.parlays || []);
    }

    setDataLoading(false);
  }, [user]);

  // Fetch cashout values for all pending parlays
  const fetchCashoutValues = useCallback(async () => {
    if (!user) return;
    const pending = parlays.filter((p) => p.status === "pending");
    const values: Record<string, number> = {};
    await Promise.all(
      pending.map(async (p) => {
        try {
          const res = await fetch(
            `/api/sim/cashout?parlay_id=${p.id}&user_id=${user.id}`
          );
          if (res.ok) {
            const data = await res.json();
            if (data.cashoutAvailable) {
              values[p.id] = data.cashoutValue;
            }
          }
        } catch {
          // silent
        }
      })
    );
    setCashoutValues(values);
  }, [user, parlays]);

  useEffect(() => {
    if (parlays.length > 0) {
      fetchCashoutValues();
    }
  }, [parlays, fetchCashoutValues]);

  useEffect(() => {
    if (isVip && user) {
      loadData();
      // Kick the sim resolver on page load so finished games flip without
      // waiting for the daily cron. Fire-and-forget, then reload.
      fetch("/api/sim/resolve", { cache: "no-store" })
        .then(() => loadData())
        .catch(() => null);
    }
  }, [isVip, user, loadData]);

  // Manual refresh — trigger resolver + refetch
  const [refreshing, setRefreshing] = useState(false);
  async function refreshSim() {
    if (refreshing || !user) return;
    setRefreshing(true);
    try {
      await fetch("/api/sim/resolve", { cache: "no-store" }).catch(() => null);
      await loadData();
      setConfirmation("Results refreshed");
      setTimeout(() => setConfirmation(null), 2000);
    } finally {
      setRefreshing(false);
    }
  }

  // Cash out a pending parlay
  async function handleCashOut(parlayId: string) {
    if (!user || cashingOut) return;

    const value = cashoutValues[parlayId];
    const confirmed = window.confirm(
      `Cash out this parlay for $${value?.toFixed(2) || "??"}? This cannot be undone.`
    );
    if (!confirmed) return;

    setCashingOut(parlayId);
    try {
      const res = await fetch("/api/sim/cashout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parlay_id: parlayId, user_id: user.id }),
      });
      const data = await res.json();
      if (res.ok) {
        setConfirmation(`Cashed out for $${data.cashoutValue.toFixed(2)}`);
        setTimeout(() => setConfirmation(null), 2500);
        await loadData();
      } else {
        setConfirmation(data.error || "Failed to cash out");
        setTimeout(() => setConfirmation(null), 2500);
      }
    } catch {
      setConfirmation("Network error");
      setTimeout(() => setConfirmation(null), 2500);
    }
    setCashingOut(null);
  }

  // Edit stake on a pending parlay
  async function handleEditStake(parlayId: string) {
    if (!user || savingEdit) return;

    if (editStake < 1) {
      setConfirmation("Minimum stake is $1");
      setTimeout(() => setConfirmation(null), 2000);
      return;
    }

    setSavingEdit(true);
    try {
      const res = await fetch("/api/sim", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parlay_id: parlayId,
          user_id: user.id,
          new_stake: editStake,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setConfirmation(`Stake updated to $${editStake}`);
        setTimeout(() => setConfirmation(null), 2500);
        setEditingParlay(null);
        await loadData();
      } else {
        setConfirmation(data.error || "Failed to update stake");
        setTimeout(() => setConfirmation(null), 2500);
      }
    } catch {
      setConfirmation("Network error");
      setTimeout(() => setConfirmation(null), 2500);
    }
    setSavingEdit(false);
  }

  // Bankroll chart data
  const resolvedParlays = parlays
    .filter((p) => p.status !== "pending")
    .sort(
      (a, b) =>
        new Date(a.resolved_at || a.created_at).getTime() -
        new Date(b.resolved_at || b.created_at).getTime()
    );

  const chartPoints: number[] = [];
  if (bankroll) {
    let running = bankroll.starting_balance;
    chartPoints.push(running);
    for (const p of resolvedParlays) {
      running += p.profit;
      chartPoints.push(running);
    }
  }

  const chartMax = chartPoints.length > 0 ? Math.max(...chartPoints) : 1000;
  const chartMin = chartPoints.length > 0 ? Math.min(...chartPoints) : 0;
  const chartRange = chartMax - chartMin || 1;

  /* ─── Loading / Auth States ─── */

  if (authLoading || tierLoading) {
    return (
      <div className="min-h-screen bg-[#FAFAF7] flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-black/40 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#FAFAF7] text-[#0a0a0a] flex flex-col items-center justify-center px-6">
        <Lock className="w-10 h-10 text-black/30 mb-6" />
        <h1
          className="text-3xl md:text-4xl mb-4 text-center"
          style={{ fontFamily: "'DM Serif Display', serif" }}
        >
          Sign in to access the Simulator
        </h1>
        <p className="text-black/45 mb-8 text-center max-w-md">
          Paper trade parlays with simulated money. Track your P&L over time.
        </p>
        <Link
          href="/login"
          className="bg-[#0a0a0a] text-white px-8 py-3 text-sm font-semibold rounded-full hover:bg-[#222] transition-colors"
        >
          Sign In
        </Link>
      </div>
    );
  }

  if (!isVip && !isAdmin) {
    return (
      <div className="min-h-screen bg-[#FAFAF7] text-[#0a0a0a]">
        <AppNav />

        <div className="pt-32 pb-20 flex flex-col items-center justify-center px-6 text-center">
          <div className="w-20 h-20 rounded-2xl bg-[#0a0a0a]/10 border border-[#0a0a0a]/20 flex items-center justify-center mb-8">
            <Lock className="w-8 h-8 text-[#0a0a0a]" />
          </div>
          <h1
            className="text-3xl md:text-5xl mb-4"
            style={{ fontFamily: "'DM Serif Display', serif" }}
          >
            Simulator is a Pro Feature
          </h1>
          <p className="text-black/45 mb-10 max-w-lg leading-relaxed">
            Paper trade AI-generated parlays with simulated money.
            Sharp gets $1K. VIP gets $10K. See how you&apos;d perform
            before risking real cash.
          </p>
          <Link
            href="/subscribe"
            className="bg-[#0a0a0a] text-white px-10 py-4 text-sm font-semibold rounded-full hover:bg-[#222] transition-colors"
          >
            Subscribe — Starting at $50/mo
          </Link>
        </div>
      </div>
    );
  }

  /* ─── P&L Calculations ─── */

  const pnl = bankroll
    ? bankroll.balance - bankroll.starting_balance
    : 0;
  const pnlPct = bankroll && bankroll.starting_balance > 0
    ? ((pnl / bankroll.starting_balance) * 100).toFixed(1)
    : "0.0";
  const winRate =
    bankroll && bankroll.wins + bankroll.losses > 0
      ? ((bankroll.wins / (bankroll.wins + bankroll.losses)) * 100).toFixed(1)
      : "0.0";

  /* ─── Main View ─── */

  return (
    <div className="min-h-screen bg-[#FAFAF7] text-[#0a0a0a] overflow-x-hidden">
      <AppNav />

      {/* Confirmation toast */}
      {confirmation && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className="fixed top-24 left-1/2 -translate-x-1/2 z-50 bg-[#1a1a1a] border border-black/10 text-white text-sm px-6 py-3 rounded-full shadow-2xl"
          style={{ fontFamily: "var(--font-geist-mono)" }}
        >
          {confirmation}
        </motion.div>
      )}

      <div className="pt-28 pb-20 w-full max-w-[1400px] mx-auto px-6 md:px-10">
        {/* ── Header ── */}
        <motion.div
          initial="hidden"
          animate="visible"
          className="mb-16"
        >
          <motion.div variants={fadeUp} custom={0} className="flex items-center gap-3 mb-2">
            <span className="text-[10px] font-bold uppercase tracking-wider bg-[#0a0a0a]/15 text-white px-2 py-1 rounded-full">
              VIP
            </span>
            <span className="text-xs text-black/40" style={{ fontFamily: "var(--font-geist-mono)" }}>
              Paper Trading
            </span>
          </motion.div>
          <motion.h1
            variants={fadeUp}
            custom={1}
            className="text-4xl md:text-6xl tracking-tight"
            style={{ fontFamily: "'DM Serif Display', serif" }}
          >
            Simulator
          </motion.h1>
        </motion.div>

        {dataLoading ? (
          <div className="flex items-center justify-center py-32">
            <Loader2 className="w-6 h-6 text-black/40 animate-spin" />
          </div>
        ) : (
          <>
            {/* ── Bankroll Header ── */}
            <motion.section
              initial="hidden"
              animate="visible"
              className="mb-16"
            >
              <div className="flex items-center justify-between mb-6">
                <h2
                  className="text-xl md:text-2xl tracking-tight"
                  style={{ fontFamily: "'DM Serif Display', serif" }}
                >
                  Bankroll
                </h2>
                <button
                  onClick={async () => {
                    if (!user || !bankroll) return;
                    const confirmed = window.confirm(
                      "Reset your bankroll? This will delete all sim history and reset your balance to the starting amount."
                    );
                    if (!confirmed) return;

                    // Reset bankroll
                    await supabase
                      .from("sim_bankroll")
                      .update({
                        balance: bankroll.starting_balance,
                        total_wagered: 0,
                        total_won: 0,
                        total_lost: 0,
                        wins: 0,
                        losses: 0,
                      })
                      .eq("user_id", user.id);

                    // Delete all sim parlays
                    await supabase
                      .from("sim_parlays")
                      .delete()
                      .eq("user_id", user.id);

                    // Reload
                    await loadData();
                    setConfirmation("Bankroll reset");
                    setTimeout(() => setConfirmation(null), 2500);
                  }}
                  className="text-xs text-black/40 hover:text-[#0a0a0a] transition-colors border border-black/[0.06] hover:border-[#0a0a0a]/30 px-4 py-2 rounded-lg"
                >
                  Reset Bankroll
                </button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 md:gap-6">
                {/* Balance — large */}
                <motion.div
                  variants={fadeUp}
                  custom={0}
                  className="col-span-2 md:col-span-2 bg-white border border-black/[0.06] rounded-2xl p-6 md:p-8"
                >
                  <div className="text-xs text-black/40 uppercase tracking-widest mb-3">
                    Balance
                  </div>
                  <div
                    className={`text-4xl md:text-5xl font-bold ${
                      pnl >= 0 ? "text-[#22C55E]" : "text-[#0a0a0a]"
                    }`}
                    style={{ fontFamily: "var(--font-geist-mono)" }}
                  >
                    ${bankroll?.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || "1,000.00"}
                  </div>
                  <div className="text-xs text-black/40 mt-2" style={{ fontFamily: "var(--font-geist-mono)" }}>
                    Started: ${bankroll?.starting_balance.toLocaleString() || "1,000"}
                  </div>
                </motion.div>

                {/* P&L */}
                <motion.div
                  variants={fadeUp}
                  custom={1}
                  className="bg-white border border-black/[0.06] rounded-2xl p-6"
                >
                  <div className="text-xs text-black/40 uppercase tracking-widest mb-3">
                    P&L
                  </div>
                  <div
                    className={`text-2xl font-bold flex items-center gap-2 ${
                      pnl >= 0 ? "text-[#22C55E]" : "text-[#0a0a0a]"
                    }`}
                    style={{ fontFamily: "var(--font-geist-mono)" }}
                  >
                    {pnl >= 0 ? (
                      <TrendingUp className="w-4 h-4" />
                    ) : (
                      <TrendingDown className="w-4 h-4" />
                    )}
                    {pnl >= 0 ? "+" : ""}${Math.abs(pnl).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <div className="text-xs text-black/40 mt-1" style={{ fontFamily: "var(--font-geist-mono)" }}>
                    {pnl >= 0 ? "+" : ""}{pnlPct}%
                  </div>
                </motion.div>

                {/* Win Rate */}
                <motion.div
                  variants={fadeUp}
                  custom={2}
                  className="bg-white border border-black/[0.06] rounded-2xl p-6"
                >
                  <div className="text-xs text-black/40 uppercase tracking-widest mb-3">
                    Win Rate
                  </div>
                  <div
                    className="text-2xl font-bold text-black"
                    style={{ fontFamily: "var(--font-geist-mono)" }}
                  >
                    {winRate}%
                  </div>
                  <div className="text-xs text-black/40 mt-1" style={{ fontFamily: "var(--font-geist-mono)" }}>
                    {bankroll?.wins || 0}W / {bankroll?.losses || 0}L
                  </div>
                </motion.div>

                {/* Total Wagered */}
                <motion.div
                  variants={fadeUp}
                  custom={3}
                  className="bg-white border border-black/[0.06] rounded-2xl p-6"
                >
                  <div className="text-xs text-black/40 uppercase tracking-widest mb-3">
                    Wagered
                  </div>
                  <div
                    className="text-2xl font-bold text-black"
                    style={{ fontFamily: "var(--font-geist-mono)" }}
                  >
                    ${bankroll?.total_wagered.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || "0.00"}
                  </div>
                </motion.div>
              </div>
            </motion.section>

            {/* ── Browse Picks CTA (Quick Sim section removed — picks live on /parlays now) ── */}
            <motion.section
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-60px" }}
              className="mb-16"
            >
              <motion.div
                variants={fadeUp}
                custom={0}
                className="rounded-2xl px-6 py-10 md:px-12 md:py-14 flex flex-col md:flex-row items-start md:items-center justify-between gap-6"
                style={{
                  background: "linear-gradient(135deg, rgba(0,0,0,0.06) 0%, rgba(0,0,0,0.03) 100%)",
                  border: "1px solid rgba(0,0,0,0.08)",
                }}
              >
                <div>
                  <p
                    className="text-2xl md:text-3xl tracking-tight mb-2"
                    style={{ fontFamily: "'DM Serif Display', serif" }}
                  >
                    Place a new sim bet
                  </p>
                  <p className="text-sm md:text-base" style={{ color: "rgba(0,0,0,0.6)" }}>
                    Browse today&apos;s AI slate, open any parlay&apos;s &quot;Why this pick&quot; panel, and click &quot;Try $10 in Simulator&quot; to paper-trade it here.
                  </p>
                </div>
                <Link
                  href="/parlays"
                  className="flex-shrink-0 px-8 py-4 rounded-full text-base font-bold transition-all duration-200"
                  style={{ background: "#0a0a0a", color: "#FFFFFF" }}
                >
                  Browse Picks →
                </Link>
              </motion.div>
            </motion.section>


            {/* ── Bankroll Chart ── */}
            {chartPoints.length > 1 && (
              <motion.section
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-60px" }}
                className="mb-16"
              >
                <motion.h2
                  variants={fadeUp}
                  custom={0}
                  className="text-2xl md:text-3xl tracking-tight mb-8"
                  style={{ fontFamily: "'DM Serif Display', serif" }}
                >
                  Bankroll Chart
                </motion.h2>

                <motion.div
                  variants={fadeUp}
                  custom={1}
                  className="bg-white border border-black/[0.06] rounded-2xl p-6 md:p-8"
                >
                  {/* Y-axis labels + chart */}
                  <div className="flex items-stretch gap-4">
                    {/* Y labels */}
                    <div className="flex flex-col justify-between text-[10px] text-black/40 py-1" style={{ fontFamily: "var(--font-geist-mono)" }}>
                      <span>${chartMax.toFixed(0)}</span>
                      <span>${((chartMax + chartMin) / 2).toFixed(0)}</span>
                      <span>${chartMin.toFixed(0)}</span>
                    </div>

                    {/* SVG chart */}
                    <div className="flex-1 h-40 md:h-52">
                      <svg
                        viewBox={`0 0 ${chartPoints.length * 40} 200`}
                        className="w-full h-full"
                        preserveAspectRatio="none"
                      >
                        {/* Starting balance line */}
                        <line
                          x1="0"
                          y1={200 - ((bankroll!.starting_balance - chartMin) / chartRange) * 180 - 10}
                          x2={chartPoints.length * 40}
                          y2={200 - ((bankroll!.starting_balance - chartMin) / chartRange) * 180 - 10}
                          stroke="rgba(0,0,0,0.06)"
                          strokeDasharray="4 4"
                        />

                        {/* Line */}
                        <polyline
                          points={chartPoints
                            .map((val, i) => {
                              const x = i * (chartPoints.length > 1 ? (chartPoints.length * 40 - 40) / (chartPoints.length - 1) : 0) + 20;
                              const y = 200 - ((val - chartMin) / chartRange) * 180 - 10;
                              return `${x},${y}`;
                            })
                            .join(" ")}
                          fill="none"
                          stroke={pnl >= 0 ? "#22C55E" : "#0a0a0a"}
                          strokeWidth="2"
                          strokeLinejoin="round"
                        />

                        {/* Dots */}
                        {chartPoints.map((val, i) => {
                          const x = i * (chartPoints.length > 1 ? (chartPoints.length * 40 - 40) / (chartPoints.length - 1) : 0) + 20;
                          const y = 200 - ((val - chartMin) / chartRange) * 180 - 10;
                          return (
                            <circle
                              key={i}
                              cx={x}
                              cy={y}
                              r="4"
                              fill={val >= bankroll!.starting_balance ? "#22C55E" : "#0a0a0a"}
                              opacity={0.8}
                            />
                          );
                        })}
                      </svg>
                    </div>
                  </div>

                  <div className="text-[10px] text-black/30 mt-3 text-center" style={{ fontFamily: "var(--font-geist-mono)" }}>
                    {resolvedParlays.length} resolved bet{resolvedParlays.length !== 1 ? "s" : ""}
                  </div>
                </motion.div>
              </motion.section>
            )}

            {/* ── Active Bets (pending only — full history lives on /my-stats) ── */}
            <motion.section
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-60px" }}
            >
              <motion.div
                variants={fadeUp}
                custom={0}
                className="flex items-center justify-between mb-8 gap-4"
              >
                <h2
                  className="text-2xl md:text-3xl tracking-tight"
                  style={{ fontFamily: "'DM Serif Display', serif" }}
                >
                  Active Bets
                </h2>
                <div className="flex items-center gap-3">
                  <button
                    onClick={refreshSim}
                    disabled={refreshing}
                    className="text-xs font-semibold px-4 py-2 rounded-full transition-all disabled:opacity-50 bg-[#0a0a0a]/10 text-white border border-[#0a0a0a]/25 hover:bg-[#0a0a0a]/15"
                  >
                    {refreshing ? "Refreshing…" : "Refresh Results"}
                  </button>
                  <Link
                    href="/my-stats"
                    className="text-xs text-black/45 hover:text-black/70 transition-colors"
                  >
                    Full history →
                  </Link>
                </div>
              </motion.div>

              {(() => {
                const pending = parlays.filter((p) => p.status === "pending");
                if (pending.length === 0) {
                  return (
                    <motion.div
                      variants={fadeUp}
                      custom={1}
                      className="bg-white border border-black/[0.06] rounded-2xl p-10 text-center"
                    >
                      <p className="text-black/45 mb-2">No active bets.</p>
                      <p className="text-xs text-black/40">
                        Head to{" "}
                        <Link href="/parlays" className="text-[#0a0a0a] hover:underline">
                          today&apos;s picks
                        </Link>{" "}
                        to place one.
                      </p>
                    </motion.div>
                  );
                }
                return (
                  <div className="space-y-2">
                    {pending.map((p, i) => (
                      <motion.div
                        key={p.id}
                        variants={fadeUp}
                        custom={i + 1}
                        className="border rounded-xl transition-all cursor-pointer bg-white border-black/[0.06]"
                        onClick={() =>
                          setExpandedParlay(expandedParlay === p.id ? null : p.id)
                        }
                      >
                        <div className="flex items-center justify-between p-4 md:px-6 flex-wrap gap-2">
                          <div className="flex items-center gap-4 min-w-0 flex-1">
                            <span className="text-xs text-black/45">{p.legs.length}L</span>
                            {p.category && CATEGORY_META[p.category] && (
                              <span
                                className={`hidden sm:inline text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${CATEGORY_META[p.category].color} ${CATEGORY_META[p.category].bg}`}
                              >
                                {CATEGORY_META[p.category].label}
                              </span>
                            )}
                            <span
                              className="text-sm font-bold text-black/70"
                              style={{ fontFamily: "var(--font-geist-mono)" }}
                            >
                              {p.combined_odds}
                            </span>
                            <span className="text-xs text-black/40" style={{ fontFamily: "var(--font-geist-mono)" }}>
                              ${p.stake}
                            </span>
                            {(() => {
                              const gs = getGameStatus(p.legs);
                              if (!gs) return null;
                              const colorClass =
                                gs.kind === "live"
                                  ? "bg-[#0a0a0a]/15 text-white animate-pulse"
                                  : gs.kind === "awaiting"
                                  ? "bg-[#eab308]/15 text-[#eab308]"
                                  : "bg-black/[0.04] text-black/55";
                              const text =
                                gs.kind === "upcoming"
                                  ? `Starts in ${gs.startsIn}`
                                  : gs.kind === "live"
                                  ? "Live"
                                  : "Awaiting result";
                              return (
                                <span
                                  className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded ${colorClass}`}
                                >
                                  {text}
                                </span>
                              );
                            })()}
                          </div>
                          <div className="flex items-center gap-3">
                            {cashoutValues[p.id] !== undefined && (
                              <span
                                className={`text-xs font-medium px-2 py-1 rounded ${
                                  cashoutValues[p.id] >= p.stake
                                    ? "bg-[#22C55E]/10 text-[#22C55E]"
                                    : "bg-black/[0.04] text-black/45"
                                }`}
                                style={{ fontFamily: "var(--font-geist-mono)" }}
                              >
                                Cash: ${cashoutValues[p.id].toFixed(2)}
                              </span>
                            )}
                            {expandedParlay === p.id ? (
                              <ChevronUp className="w-4 h-4 text-black/30" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-black/30" />
                            )}
                          </div>
                        </div>

                        {expandedParlay === p.id && (
                          <div className="px-4 md:px-6 pb-4 space-y-2 border-t border-black/[0.04] pt-3">
                            {p.legs.map((leg, j) => (
                              <div key={j} className="flex items-center justify-between text-sm">
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] font-bold uppercase tracking-wider bg-black/[0.06] text-black/45 px-1.5 py-0.5 rounded">
                                    {leg.sport}
                                  </span>
                                  <span className="text-black/60">{leg.pick}</span>
                                  <span className="text-black/40 text-xs">{leg.game}</span>
                                </div>
                                <span className="text-black/55" style={{ fontFamily: "var(--font-geist-mono)" }}>
                                  {leg.odds > 0 ? `+${leg.odds}` : leg.odds}
                                </span>
                              </div>
                            ))}

                            <div className="pt-3 mt-2 border-t border-black/[0.04] space-y-3">
                              {editingParlay === p.id ? (
                                <div className="flex items-center gap-3">
                                  <label className="text-xs text-black/45 uppercase tracking-wider">
                                    New Stake
                                  </label>
                                  <div className="relative">
                                    <span
                                      className="absolute left-2.5 top-1/2 -translate-y-1/2 text-black/45 text-xs"
                                      style={{ fontFamily: "var(--font-geist-mono)" }}
                                    >
                                      $
                                    </span>
                                    <input
                                      type="number"
                                      min={1}
                                      value={editStake}
                                      onChange={(e) => setEditStake(Math.max(1, Number(e.target.value)))}
                                      onClick={(e) => e.stopPropagation()}
                                      className="bg-[#FAFAF7] border border-black/[0.08] rounded-lg pl-6 pr-3 py-2 text-xs text-black w-24 focus:outline-none focus:border-[#0a0a0a]/40"
                                      style={{ fontFamily: "var(--font-geist-mono)" }}
                                    />
                                  </div>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleEditStake(p.id);
                                    }}
                                    disabled={savingEdit}
                                    className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-[#22C55E]/10 text-[#22C55E] border border-[#22C55E]/20 hover:bg-[#22C55E]/15 disabled:opacity-40"
                                  >
                                    {savingEdit ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                                    Save
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditingParlay(null);
                                    }}
                                    className="text-xs text-black/40 hover:text-black/55 px-2 py-2"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingParlay(p.id);
                                    setEditStake(p.stake);
                                  }}
                                  className="flex items-center gap-2 text-xs font-medium text-black/45 hover:text-black/60"
                                >
                                  <Pencil className="w-3 h-3" />
                                  Edit Stake (${p.stake})
                                </button>
                              )}

                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCashOut(p.id);
                                }}
                                disabled={cashingOut === p.id || cashoutValues[p.id] === undefined}
                                className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-semibold transition-all ${
                                  cashoutValues[p.id] !== undefined && cashoutValues[p.id] >= p.stake
                                    ? "bg-[#22C55E]/10 text-[#22C55E] border border-[#22C55E]/20 hover:bg-[#22C55E]/15"
                                    : "bg-black/[0.04] text-black/55 border border-black/[0.08] hover:bg-black/[0.06]"
                                } disabled:opacity-40 disabled:cursor-not-allowed`}
                              >
                                {cashingOut === p.id ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <DollarSign className="w-3 h-3" />
                                )}
                                {cashoutValues[p.id] !== undefined
                                  ? `Cash Out: $${cashoutValues[p.id].toFixed(2)}`
                                  : "Loading..."}
                              </button>
                            </div>
                          </div>
                        )}
                      </motion.div>
                    ))}
                  </div>
                );
              })()}
            </motion.section>
          </>
        )}
      </div>

      {/* Footer */}
      <footer className="border-t border-black/[0.04] py-12">
        <div className="w-full max-w-[1400px] mx-auto px-6 md:px-10 text-center">
          <p className="text-xs text-black/25">
            Simulator uses simulated money only. No real bets are placed.
          </p>
        </div>
      </footer>
    </div>
  );
}

