"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Menu,
  X,
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
import { Logo } from "@/app/components/Logo";
import { NavUser } from "@/app/components/NavUser";
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
}

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
}

interface PickParlay {
  id: string;
  legs: SimLeg[];
  combined_odds: string;
  combined_decimal: number;
  payout: number;
}

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

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isVip, setIsVip] = useState(false);
  const [userTier, setUserTier] = useState<string>("free");
  const [tierLoading, setTierLoading] = useState(true);

  // Sim state
  const [bankroll, setBankroll] = useState<SimBankroll | null>(null);
  const [parlays, setParlays] = useState<SimParlay[]>([]);
  const [picks, setPicks] = useState<PickParlay[]>([]);
  const [stake, setStake] = useState(10);
  const [placing, setPlacing] = useState<string | null>(null);
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

  // Load picks for quick sim
  const loadPicks = useCallback(async () => {
    try {
      const res = await fetch("/api/parlays?count=5&legs=3");
      if (res.ok) {
        const data = await res.json();
        setPicks(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (data.parlays || []).slice(0, 5).map((p: any) => ({
            id: p.id,
            legs: p.legs,
            combined_odds: p.combinedOdds || p.combined_odds,
            combined_decimal: p.combinedDecimal || p.combined_decimal,
            payout: p.payout,
          }))
        );
      }
    } catch {
      // silent
    }
  }, []);

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
      loadPicks();
    }
  }, [isVip, user, loadData, loadPicks]);

  // Place sim bet
  async function placeBet(pick: PickParlay) {
    if (!user || !bankroll || placing) return;

    if (stake > bankroll.balance) {
      setConfirmation("Insufficient balance");
      setTimeout(() => setConfirmation(null), 2000);
      return;
    }

    setPlacing(pick.id);

    try {
      const res = await fetch("/api/sim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: user.id,
          legs: pick.legs,
          combined_odds: pick.combined_odds,
          combined_decimal: pick.combined_decimal,
          stake,
          payout: Math.round(stake * pick.combined_decimal * 100) / 100,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setConfirmation(`Placed $${stake} sim bet`);
        setTimeout(() => setConfirmation(null), 2500);
        await loadData();
      } else {
        setConfirmation(data.error || "Failed to place bet");
        setTimeout(() => setConfirmation(null), 2500);
      }
    } catch {
      setConfirmation("Network error");
      setTimeout(() => setConfirmation(null), 2500);
    }

    setPlacing(null);
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
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-white/30 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-[#ededed] flex flex-col items-center justify-center px-6">
        <Lock className="w-10 h-10 text-white/20 mb-6" />
        <h1
          className="text-3xl md:text-4xl mb-4 text-center"
          style={{ fontFamily: "'DM Serif Display', serif" }}
        >
          Sign in to access the Simulator
        </h1>
        <p className="text-white/40 mb-8 text-center max-w-md">
          Paper trade parlays with simulated money. Track your P&L over time.
        </p>
        <Link
          href="/login"
          className="bg-[#FF3B3B] text-[#0a0a0a] px-8 py-3 text-sm font-semibold rounded-full hover:bg-[#FF5252] transition-colors"
        >
          Sign In
        </Link>
      </div>
    );
  }

  if (!isVip && !isAdmin) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-[#ededed]">
        {/* Nav */}
        <Nav mobileMenuOpen={mobileMenuOpen} setMobileMenuOpen={setMobileMenuOpen} />

        <div className="pt-32 pb-20 flex flex-col items-center justify-center px-6 text-center">
          <div className="w-20 h-20 rounded-2xl bg-[#FF3B3B]/10 border border-[#FF3B3B]/20 flex items-center justify-center mb-8">
            <Lock className="w-8 h-8 text-[#FF3B3B]" />
          </div>
          <h1
            className="text-3xl md:text-5xl mb-4"
            style={{ fontFamily: "'DM Serif Display', serif" }}
          >
            Simulator is a Pro Feature
          </h1>
          <p className="text-white/40 mb-10 max-w-lg leading-relaxed">
            Paper trade AI-generated parlays with simulated money.
            Sharp gets $1K. VIP gets $10K. See how you&apos;d perform
            before risking real cash.
          </p>
          <Link
            href="/subscribe"
            className="bg-[#FF3B3B] text-[#0a0a0a] px-10 py-4 text-sm font-semibold rounded-full hover:bg-[#FF5252] transition-colors"
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
    <div className="min-h-screen bg-[#0a0a0a] text-[#ededed] overflow-x-hidden">
      <Nav mobileMenuOpen={mobileMenuOpen} setMobileMenuOpen={setMobileMenuOpen} />

      {/* Confirmation toast */}
      {confirmation && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className="fixed top-24 left-1/2 -translate-x-1/2 z-50 bg-[#1a1a1a] border border-white/10 text-white text-sm px-6 py-3 rounded-full shadow-2xl"
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
            <span className="text-[10px] font-bold uppercase tracking-wider bg-[#FF3B3B]/15 text-[#FF3B3B] px-2 py-1 rounded-full">
              VIP
            </span>
            <span className="text-xs text-white/30" style={{ fontFamily: "var(--font-geist-mono)" }}>
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
            <Loader2 className="w-6 h-6 text-white/30 animate-spin" />
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
                  className="text-xs text-white/30 hover:text-[#FF3B3B] transition-colors border border-white/[0.06] hover:border-[#FF3B3B]/30 px-4 py-2 rounded-lg"
                >
                  Reset Bankroll
                </button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 md:gap-6">
                {/* Balance — large */}
                <motion.div
                  variants={fadeUp}
                  custom={0}
                  className="col-span-2 md:col-span-2 bg-[#111] border border-white/[0.06] rounded-2xl p-6 md:p-8"
                >
                  <div className="text-xs text-white/30 uppercase tracking-widest mb-3">
                    Balance
                  </div>
                  <div
                    className={`text-4xl md:text-5xl font-bold ${
                      pnl >= 0 ? "text-[#22C55E]" : "text-[#FF3B3B]"
                    }`}
                    style={{ fontFamily: "var(--font-geist-mono)" }}
                  >
                    ${bankroll?.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || "1,000.00"}
                  </div>
                  <div className="text-xs text-white/25 mt-2" style={{ fontFamily: "var(--font-geist-mono)" }}>
                    Started: ${bankroll?.starting_balance.toLocaleString() || "1,000"}
                  </div>
                </motion.div>

                {/* P&L */}
                <motion.div
                  variants={fadeUp}
                  custom={1}
                  className="bg-[#111] border border-white/[0.06] rounded-2xl p-6"
                >
                  <div className="text-xs text-white/30 uppercase tracking-widest mb-3">
                    P&L
                  </div>
                  <div
                    className={`text-2xl font-bold flex items-center gap-2 ${
                      pnl >= 0 ? "text-[#22C55E]" : "text-[#FF3B3B]"
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
                  <div className="text-xs text-white/25 mt-1" style={{ fontFamily: "var(--font-geist-mono)" }}>
                    {pnl >= 0 ? "+" : ""}{pnlPct}%
                  </div>
                </motion.div>

                {/* Win Rate */}
                <motion.div
                  variants={fadeUp}
                  custom={2}
                  className="bg-[#111] border border-white/[0.06] rounded-2xl p-6"
                >
                  <div className="text-xs text-white/30 uppercase tracking-widest mb-3">
                    Win Rate
                  </div>
                  <div
                    className="text-2xl font-bold text-white"
                    style={{ fontFamily: "var(--font-geist-mono)" }}
                  >
                    {winRate}%
                  </div>
                  <div className="text-xs text-white/25 mt-1" style={{ fontFamily: "var(--font-geist-mono)" }}>
                    {bankroll?.wins || 0}W / {bankroll?.losses || 0}L
                  </div>
                </motion.div>

                {/* Total Wagered */}
                <motion.div
                  variants={fadeUp}
                  custom={3}
                  className="bg-[#111] border border-white/[0.06] rounded-2xl p-6"
                >
                  <div className="text-xs text-white/30 uppercase tracking-widest mb-3">
                    Wagered
                  </div>
                  <div
                    className="text-2xl font-bold text-white"
                    style={{ fontFamily: "var(--font-geist-mono)" }}
                  >
                    ${bankroll?.total_wagered.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || "0.00"}
                  </div>
                </motion.div>
              </div>
            </motion.section>

            {/* ── Quick Sim ── */}
            <motion.section
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-60px" }}
              className="mb-16"
            >
              <motion.h2
                variants={fadeUp}
                custom={0}
                className="text-2xl md:text-3xl tracking-tight mb-2"
                style={{ fontFamily: "'DM Serif Display', serif" }}
              >
                Quick Sim
              </motion.h2>
              <motion.p variants={fadeUp} custom={1} className="text-sm text-white/30 mb-8">
                Place a sim bet on today&apos;s AI picks. Results resolve after 24 hours.
              </motion.p>

              {/* Stake input */}
              <motion.div variants={fadeUp} custom={2} className="flex items-center gap-4 mb-8">
                <label className="text-xs text-white/40 uppercase tracking-wider">
                  Stake
                </label>
                <div className="relative">
                  <span
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 text-sm"
                    style={{ fontFamily: "var(--font-geist-mono)" }}
                  >
                    $
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={bankroll?.balance || 1000}
                    value={stake}
                    onChange={(e) => setStake(Math.max(1, Number(e.target.value)))}
                    className="bg-[#111] border border-white/[0.08] rounded-lg pl-7 pr-4 py-2.5 text-sm text-white w-28 focus:outline-none focus:border-[#FF3B3B]/40 transition-colors"
                    style={{ fontFamily: "var(--font-geist-mono)" }}
                  />
                </div>
                <div className="flex gap-2">
                  {[5, 10, 25, 50, 100].map((amt) => (
                    <button
                      key={amt}
                      onClick={() => setStake(amt)}
                      className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${
                        stake === amt
                          ? "bg-[#FF3B3B]/15 text-[#FF3B3B] border border-[#FF3B3B]/20"
                          : "bg-white/[0.04] text-white/40 border border-white/[0.06] hover:text-white/60"
                      }`}
                      style={{ fontFamily: "var(--font-geist-mono)" }}
                    >
                      ${amt}
                    </button>
                  ))}
                </div>
              </motion.div>

              {/* Picks */}
              {picks.length === 0 ? (
                <motion.div
                  variants={fadeUp}
                  custom={3}
                  className="bg-[#111] border border-white/[0.06] rounded-2xl p-8 text-center text-white/30"
                >
                  No picks available right now. Check back later.
                </motion.div>
              ) : (
                <div className="space-y-3">
                  {picks.map((pick, i) => (
                    <motion.div
                      key={pick.id}
                      variants={fadeUp}
                      custom={i + 3}
                      className="bg-[#111] border border-white/[0.06] rounded-xl p-5 hover:border-white/[0.12] transition-all"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-2">
                            {pick.legs.map((leg, j) => (
                              <span
                                key={j}
                                className="text-[10px] font-bold uppercase tracking-wider bg-white/[0.06] text-white/50 px-2 py-0.5 rounded"
                              >
                                {leg.sport}
                              </span>
                            ))}
                          </div>
                          <div className="text-sm text-white/70 truncate">
                            {pick.legs.map((l) => l.pick).join(" + ")}
                          </div>
                          <div className="flex items-center gap-4 mt-2">
                            <span
                              className="text-lg font-bold text-[#FF3B3B]"
                              style={{ fontFamily: "var(--font-geist-mono)" }}
                            >
                              {pick.combined_odds}
                            </span>
                            <span
                              className="text-xs text-white/30"
                              style={{ fontFamily: "var(--font-geist-mono)" }}
                            >
                              ${stake} pays ${(stake * pick.combined_decimal).toFixed(2)}
                            </span>
                          </div>
                        </div>

                        <button
                          onClick={() => placeBet(pick)}
                          disabled={placing === pick.id || stake > (bankroll?.balance || 0)}
                          className="ml-4 bg-[#FF3B3B] text-[#0a0a0a] px-5 py-2.5 text-xs font-semibold rounded-lg hover:bg-[#FF5252] transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 flex-shrink-0"
                        >
                          {placing === pick.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : null}
                          Place Sim Bet
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}

              {/* Custom sim link */}
              <motion.div variants={fadeUp} custom={8} className="mt-6">
                <Link
                  href="/builder"
                  className="text-sm text-white/30 hover:text-[#FF3B3B] transition-colors"
                >
                  Or build a custom parlay in the Builder &rarr;
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
                  className="bg-[#111] border border-white/[0.06] rounded-2xl p-6 md:p-8"
                >
                  {/* Y-axis labels + chart */}
                  <div className="flex items-stretch gap-4">
                    {/* Y labels */}
                    <div className="flex flex-col justify-between text-[10px] text-white/25 py-1" style={{ fontFamily: "var(--font-geist-mono)" }}>
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
                          stroke="rgba(255,255,255,0.06)"
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
                          stroke={pnl >= 0 ? "#22C55E" : "#FF3B3B"}
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
                              fill={val >= bankroll!.starting_balance ? "#22C55E" : "#FF3B3B"}
                              opacity={0.8}
                            />
                          );
                        })}
                      </svg>
                    </div>
                  </div>

                  <div className="text-[10px] text-white/20 mt-3 text-center" style={{ fontFamily: "var(--font-geist-mono)" }}>
                    {resolvedParlays.length} resolved bet{resolvedParlays.length !== 1 ? "s" : ""}
                  </div>
                </motion.div>
              </motion.section>
            )}

            {/* ── Sim History ── */}
            <motion.section
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-60px" }}
            >
              <motion.h2
                variants={fadeUp}
                custom={0}
                className="text-2xl md:text-3xl tracking-tight mb-8"
                style={{ fontFamily: "'DM Serif Display', serif" }}
              >
                History
              </motion.h2>

              {parlays.length === 0 ? (
                <motion.div
                  variants={fadeUp}
                  custom={1}
                  className="bg-[#111] border border-white/[0.06] rounded-2xl p-10 text-center text-white/30"
                >
                  No sim bets yet. Place your first one above.
                </motion.div>
              ) : (
                <div className="space-y-2">
                  {parlays.map((p, i) => (
                    <motion.div
                      key={p.id}
                      variants={fadeUp}
                      custom={i + 1}
                      className={`border rounded-xl transition-all cursor-pointer ${
                        p.status === "won"
                          ? "bg-[#22C55E]/[0.04] border-[#22C55E]/10"
                          : p.status === "lost"
                          ? "bg-[#FF3B3B]/[0.04] border-[#FF3B3B]/10"
                          : "bg-[#111] border-white/[0.06]"
                      }`}
                      onClick={() =>
                        setExpandedParlay(expandedParlay === p.id ? null : p.id)
                      }
                    >
                      {/* Row */}
                      <div className="flex items-center justify-between p-4 md:px-6">
                        <div className="flex items-center gap-4 min-w-0 flex-1">
                          {/* Date */}
                          <span
                            className="text-xs text-white/30 w-20 flex-shrink-0 hidden md:block"
                            style={{ fontFamily: "var(--font-geist-mono)" }}
                          >
                            {new Date(p.created_at).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                            })}
                          </span>

                          {/* Legs count */}
                          <span className="text-xs text-white/40">
                            {p.legs.length}L
                          </span>

                          {/* Odds */}
                          <span
                            className="text-sm font-bold text-white/70"
                            style={{ fontFamily: "var(--font-geist-mono)" }}
                          >
                            {p.combined_odds}
                          </span>

                          {/* Stake */}
                          <span
                            className="text-xs text-white/30"
                            style={{ fontFamily: "var(--font-geist-mono)" }}
                          >
                            ${p.stake}
                          </span>
                        </div>

                        <div className="flex items-center gap-4">
                          {/* Status badge */}
                          <span
                            className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded ${
                              p.status === "won"
                                ? "bg-[#22C55E]/15 text-[#22C55E]"
                                : p.status === "lost"
                                ? "bg-[#FF3B3B]/15 text-[#FF3B3B]"
                                : "bg-white/[0.06] text-white/40"
                            }`}
                          >
                            {p.status}
                          </span>

                          {/* Cash out value for pending */}
                          {p.status === "pending" && cashoutValues[p.id] !== undefined && (
                            <span
                              className={`text-xs font-medium px-2 py-1 rounded ${
                                cashoutValues[p.id] >= p.stake
                                  ? "bg-[#22C55E]/10 text-[#22C55E]"
                                  : "bg-white/[0.04] text-white/40"
                              }`}
                              style={{ fontFamily: "var(--font-geist-mono)" }}
                            >
                              ${cashoutValues[p.id].toFixed(2)}
                            </span>
                          )}

                          {/* Profit */}
                          <span
                            className={`text-sm font-bold w-20 text-right ${
                              p.status === "won"
                                ? "text-[#22C55E]"
                                : p.status === "lost"
                                ? "text-[#FF3B3B]"
                                : "text-white/30"
                            }`}
                            style={{ fontFamily: "var(--font-geist-mono)" }}
                          >
                            {p.status === "pending"
                              ? "-"
                              : p.profit >= 0
                              ? `+$${p.profit.toFixed(2)}`
                              : `-$${Math.abs(p.profit).toFixed(2)}`}
                          </span>

                          {/* Expand */}
                          {expandedParlay === p.id ? (
                            <ChevronUp className="w-4 h-4 text-white/20" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-white/20" />
                          )}
                        </div>
                      </div>

                      {/* Expanded legs + actions */}
                      {expandedParlay === p.id && (
                        <div className="px-4 md:px-6 pb-4 space-y-2 border-t border-white/[0.04] pt-3">
                          {p.legs.map((leg, j) => (
                            <div
                              key={j}
                              className="flex items-center justify-between text-sm"
                            >
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold uppercase tracking-wider bg-white/[0.06] text-white/40 px-1.5 py-0.5 rounded">
                                  {leg.sport}
                                </span>
                                <span className="text-white/60">{leg.pick}</span>
                                <span className="text-white/25 text-xs">{leg.game}</span>
                              </div>
                              <span
                                className="text-white/50"
                                style={{ fontFamily: "var(--font-geist-mono)" }}
                              >
                                {leg.odds > 0 ? `+${leg.odds}` : leg.odds}
                              </span>
                            </div>
                          ))}

                          {/* Pending parlay actions: Cash Out + Edit Stake */}
                          {p.status === "pending" && (
                            <div className="pt-3 mt-2 border-t border-white/[0.04] space-y-3">
                              {/* Edit Stake */}
                              {editingParlay === p.id ? (
                                <div className="flex items-center gap-3">
                                  <label className="text-xs text-white/40 uppercase tracking-wider">
                                    New Stake
                                  </label>
                                  <div className="relative">
                                    <span
                                      className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/40 text-xs"
                                      style={{ fontFamily: "var(--font-geist-mono)" }}
                                    >
                                      $
                                    </span>
                                    <input
                                      type="number"
                                      min={1}
                                      value={editStake}
                                      onChange={(e) =>
                                        setEditStake(Math.max(1, Number(e.target.value)))
                                      }
                                      onClick={(e) => e.stopPropagation()}
                                      className="bg-[#0a0a0a] border border-white/[0.08] rounded-lg pl-6 pr-3 py-2 text-xs text-white w-24 focus:outline-none focus:border-[#FF3B3B]/40 transition-colors"
                                      style={{ fontFamily: "var(--font-geist-mono)" }}
                                    />
                                  </div>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleEditStake(p.id);
                                    }}
                                    disabled={savingEdit}
                                    className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-[#22C55E]/10 text-[#22C55E] border border-[#22C55E]/20 hover:bg-[#22C55E]/15 transition-colors disabled:opacity-40"
                                  >
                                    {savingEdit ? (
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : (
                                      <Check className="w-3 h-3" />
                                    )}
                                    Save
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditingParlay(null);
                                    }}
                                    className="text-xs text-white/30 hover:text-white/50 transition-colors px-2 py-2"
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
                                  className="flex items-center gap-2 text-xs font-medium text-white/40 hover:text-white/60 transition-colors"
                                >
                                  <Pencil className="w-3 h-3" />
                                  Edit Stake (${p.stake})
                                </button>
                              )}

                              {/* Cash Out */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCashOut(p.id);
                                }}
                                disabled={cashingOut === p.id || cashoutValues[p.id] === undefined}
                                className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-semibold transition-all ${
                                  cashoutValues[p.id] !== undefined && cashoutValues[p.id] >= p.stake
                                    ? "bg-[#22C55E]/10 text-[#22C55E] border border-[#22C55E]/20 hover:bg-[#22C55E]/15"
                                    : "bg-white/[0.04] text-white/50 border border-white/[0.08] hover:bg-white/[0.06]"
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
                          )}
                        </div>
                      )}
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.section>
          </>
        )}
      </div>

      {/* Footer */}
      <footer className="border-t border-white/[0.04] py-12">
        <div className="w-full max-w-[1400px] mx-auto px-6 md:px-10 text-center">
          <p className="text-xs text-white/15">
            Simulator uses simulated money only. No real bets are placed.
          </p>
        </div>
      </footer>
    </div>
  );
}

/* ─── Nav Component ─── */

function Nav({
  mobileMenuOpen,
  setMobileMenuOpen,
}: {
  mobileMenuOpen: boolean;
  setMobileMenuOpen: (v: boolean) => void;
}) {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-xl bg-[#0a0a0a]/80 border-b border-white/[0.06]">
      <div className="w-full max-w-[1400px] mx-auto flex items-center justify-between px-6 md:px-10 h-20">
        <Link href="/" className="flex items-center gap-2 -mb-2">
          <Logo />
        </Link>

        <div className="hidden md:flex items-center gap-8 text-sm text-white/50">
          <Link href="/parlays" className="hover:text-white transition-colors duration-200">
            Parlays
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
          <Link
            href="/simulator"
            className="text-[#FF3B3B] hover:text-[#FF5252] transition-colors duration-200"
          >
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
            <Link href="/parlays" onClick={() => setMobileMenuOpen(false)} className="text-sm text-white/50 hover:text-white transition-colors">
              Parlays
            </Link>
            <Link href="/odds" onClick={() => setMobileMenuOpen(false)} className="text-sm text-white/50 hover:text-white transition-colors">
              Odds
            </Link>
            <Link href="/builder" onClick={() => setMobileMenuOpen(false)} className="text-sm text-white/50 hover:text-white transition-colors">
              Builder
            </Link>
            <Link href="/results" onClick={() => setMobileMenuOpen(false)} className="text-sm text-white/50 hover:text-white transition-colors">
              Results
            </Link>
            <Link href="/simulator" onClick={() => setMobileMenuOpen(false)} className="text-sm text-[#FF3B3B] hover:text-[#FF5252] transition-colors">
              Simulator
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}
