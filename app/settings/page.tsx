"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Menu,
  X,
  Copy,
  Check,
  LogOut,
  Trash2,
  Crown,
  Shield,
  Link2,
  MousePointerClick,
  Users,
  Loader2,
} from "lucide-react";
import { Logo } from "@/app/components/Logo";
import { useAuth } from "@/app/components/AuthProvider";
import { supabase } from "@/lib/supabase";

/* ─── animation ─── */
const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.08, duration: 0.5, ease: [0.22, 1, 0.36, 1] as const },
  }),
};

const stagger = {
  visible: { transition: { staggerChildren: 0.1 } },
};

export default function SettingsPage() {
  const { user, isPro, isAdmin, signOut, loading: authLoading } = useAuth();
  const router = useRouter();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(true);

  // Referral state
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [referralLink, setReferralLink] = useState<string | null>(null);
  const [referralStats, setReferralStats] = useState<{ clicks: number; signups: number } | null>(null);
  const [generatingRef, setGeneratingRef] = useState(false);
  const [copied, setCopied] = useState(false);

  // Delete account state
  const [showDeleteMsg, setShowDeleteMsg] = useState(false);

  // Subscription info
  const [subTier, setSubTier] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [subStatus, setSubStatus] = useState<string | null>(null);

  // Load user profile data
  useEffect(() => {
    if (!user) {
      setLoadingProfile(false);
      return;
    }

    async function loadProfile() {
      const { data } = await supabase
        .from("users")
        .select("name, subscription_tier, subscription_status")
        .eq("email", user!.email)
        .single();

      if (data) {
        setName(data.name || "");
        setSubTier(data.subscription_tier || null);
        setSubStatus(data.subscription_status || null);
      }
      setLoadingProfile(false);
    }

    loadProfile();
  }, [user]);

  // Load referral code from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("bp_referral_code");
    const savedLink = localStorage.getItem("bp_referral_link");
    if (saved && savedLink) {
      setReferralCode(saved);
      setReferralLink(savedLink);
      fetchReferralStats(saved);
    }
  }, []);

  async function fetchReferralStats(code: string) {
    try {
      const res = await fetch(`/api/referral?code=${code}`);
      if (res.ok) {
        const data = await res.json();
        setReferralStats({ clicks: data.clicks || 0, signups: data.signups || 0 });
      }
    } catch {
      // silently fail
    }
  }

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    setSaved(false);

    await supabase
      .from("users")
      .update({ name })
      .eq("email", user.email);

    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  async function handleGenerateReferral() {
    if (!user) return;
    setGeneratingRef(true);
    try {
      const res = await fetch("/api/referral", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name || undefined, email: user.email }),
      });
      const data = await res.json();
      if (data.code) {
        const link = `${window.location.origin}?ref=${data.code}`;
        setReferralCode(data.code);
        setReferralLink(link);
        localStorage.setItem("bp_referral_code", data.code);
        localStorage.setItem("bp_referral_link", link);
        fetchReferralStats(data.code);
      }
    } catch {
      // silently fail
    }
    setGeneratingRef(false);
  }

  function copyReferralLink() {
    if (!referralLink) return;
    navigator.clipboard.writeText(referralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleSignOut() {
    await signOut();
    router.push("/");
  }

  function getPlanDisplay() {
    if (isAdmin) return { label: "Admin", sublabel: "Full Access", color: "text-[#FF3B3B]", bg: "bg-[#FF3B3B]/10" };
    if (isPro && subTier === "vip") return { label: "VIP", sublabel: "Active", color: "text-emerald-400", bg: "bg-emerald-400/10" };
    if (isPro) return { label: "Sharp", sublabel: "Active", color: "text-emerald-400", bg: "bg-emerald-400/10" };
    return { label: "Free", sublabel: "No active subscription", color: "text-white/40", bg: "bg-white/[0.04]" };
  }

  const plan = getPlanDisplay();

  const memberSince = user?.created_at
    ? new Date(user.created_at).toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      })
    : "—";

  // Loading state
  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-white/20" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#ededed] overflow-x-hidden">
      {/* ── NAV ── */}
      <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-xl bg-[#0a0a0a]/80 border-b border-white/[0.06]">
        <div className="w-full max-w-[1400px] mx-auto flex items-center justify-between px-6 md:px-10 h-20">
          <Link href="/" className="flex items-center gap-2">
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
          </div>

          <div className="flex items-center gap-3">
            {user ? (
              <Link
                href="/settings"
                className="text-xs text-white/40 hover:text-white transition-colors"
              >
                Settings
              </Link>
            ) : (
              <Link
                href="/login"
                className="text-xs sm:text-sm text-white/50 hover:text-white transition-colors"
              >
                Sign In
              </Link>
            )}
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
              <Link href="/parlays" onClick={() => setMobileMenuOpen(false)} className="text-sm text-white/50 hover:text-white transition-colors duration-200">
                Parlays
              </Link>
              <Link href="/odds" onClick={() => setMobileMenuOpen(false)} className="text-sm text-white/50 hover:text-white transition-colors duration-200">
                Odds
              </Link>
              <Link href="/builder" onClick={() => setMobileMenuOpen(false)} className="text-sm text-white/50 hover:text-white transition-colors duration-200">
                Builder
              </Link>
              {user && (
                <Link href="/settings" onClick={() => setMobileMenuOpen(false)} className="text-sm text-white/50 hover:text-white transition-colors duration-200">
                  Settings
                </Link>
              )}
            </div>
          </div>
        )}
      </nav>

      {/* ── CONTENT ── */}
      <main className="pt-32 pb-24 px-6 md:px-10">
        <div className="w-full max-w-[720px] mx-auto">
          {!user ? (
            /* ── NOT SIGNED IN ── */
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="text-center py-24"
            >
              <h1
                className="text-3xl md:text-4xl tracking-tight mb-4"
                style={{ fontFamily: "'DM Serif Display', serif" }}
              >
                Sign in to view your profile
              </h1>
              <p className="text-sm text-white/35 mb-8">
                Access your account settings, subscription, and referral stats.
              </p>
              <Link
                href="/login"
                className="inline-flex items-center gap-2 bg-[#FF3B3B] text-[#0a0a0a] px-8 py-3 text-sm font-semibold rounded-full hover:bg-[#FF5252] transition-colors duration-200"
              >
                Sign In
              </Link>
            </motion.div>
          ) : loadingProfile ? (
            <div className="flex items-center justify-center py-24">
              <Loader2 className="w-6 h-6 animate-spin text-white/20" />
            </div>
          ) : (
            /* ── SIGNED IN ── */
            <motion.div
              initial="hidden"
              animate="visible"
              variants={stagger}
              className="space-y-8"
            >
              {/* Page header */}
              <motion.div variants={fadeUp} custom={0}>
                <h1
                  className="text-3xl md:text-4xl tracking-tight mb-2"
                  style={{ fontFamily: "'DM Serif Display', serif" }}
                >
                  Settings
                </h1>
                <p className="text-sm text-white/35">
                  Manage your profile, subscription, and account.
                </p>
              </motion.div>

              {/* ── PROFILE ── */}
              <motion.section
                variants={fadeUp}
                custom={1}
                className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 md:p-8"
              >
                <h2
                  className="text-xl tracking-tight mb-6"
                  style={{ fontFamily: "'DM Serif Display', serif" }}
                >
                  Profile
                </h2>

                <div className="space-y-5">
                  {/* Email */}
                  <div>
                    <label className="block text-xs uppercase tracking-[0.15em] text-white/25 mb-2 font-medium">
                      Email
                    </label>
                    <p
                      className="text-sm text-white/70"
                      style={{ fontFamily: "var(--font-geist-mono)" }}
                    >
                      {user.email}
                    </p>
                  </div>

                  {/* Name */}
                  <div>
                    <label className="block text-xs uppercase tracking-[0.15em] text-white/25 mb-2 font-medium">
                      Name
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Your name"
                      className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-white/80 placeholder:text-white/20 focus:outline-none focus:border-[#FF3B3B]/40 transition-colors"
                      style={{ fontFamily: "var(--font-geist-mono)" }}
                    />
                  </div>

                  {/* Member since */}
                  <div>
                    <label className="block text-xs uppercase tracking-[0.15em] text-white/25 mb-2 font-medium">
                      Member Since
                    </label>
                    <p
                      className="text-sm text-white/50"
                      style={{ fontFamily: "var(--font-geist-mono)" }}
                    >
                      {memberSince}
                    </p>
                  </div>

                  {/* Save */}
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-2 bg-[#FF3B3B] text-[#0a0a0a] px-6 py-2.5 text-sm font-semibold rounded-full hover:bg-[#FF5252] transition-colors duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {saving ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Saving...
                      </>
                    ) : saved ? (
                      <>
                        <Check className="w-4 h-4" />
                        Saved
                      </>
                    ) : (
                      "Save Changes"
                    )}
                  </button>
                </div>
              </motion.section>

              {/* ── SUBSCRIPTION ── */}
              <motion.section
                variants={fadeUp}
                custom={2}
                className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 md:p-8"
              >
                <h2
                  className="text-xl tracking-tight mb-6"
                  style={{ fontFamily: "'DM Serif Display', serif" }}
                >
                  Subscription
                </h2>

                <div className="flex items-center gap-3 mb-6">
                  <div className={`flex items-center gap-2 px-4 py-2 rounded-full ${plan.bg}`}>
                    {isAdmin ? (
                      <Shield className={`w-4 h-4 ${plan.color}`} />
                    ) : isPro ? (
                      <Crown className={`w-4 h-4 ${plan.color}`} />
                    ) : null}
                    <span
                      className={`text-sm font-bold ${plan.color}`}
                      style={{ fontFamily: "var(--font-geist-mono)" }}
                    >
                      {plan.label}
                    </span>
                  </div>
                  <span className={`text-xs ${isAdmin ? "text-[#FF3B3B]/60" : isPro ? "text-emerald-400/60" : "text-white/30"}`}>
                    {plan.sublabel}
                  </span>
                </div>

                {!isPro && !isAdmin && (
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                    <Link
                      href="/subscribe"
                      className="inline-flex items-center gap-2 bg-[#FF3B3B] text-[#0a0a0a] px-6 py-2.5 text-sm font-semibold rounded-full hover:bg-[#FF5252] transition-colors duration-200"
                    >
                      Upgrade
                    </Link>
                    <span className="text-xs text-white/20">
                      Get unlimited parlays, builder access, and more.
                    </span>
                  </div>
                )}

                {(isPro || isAdmin) && (
                  <Link
                    href="/subscribe"
                    className="inline-flex text-xs text-white/30 hover:text-white/50 transition-colors underline underline-offset-4"
                  >
                    Manage Subscription
                  </Link>
                )}
              </motion.section>

              {/* ── REFERRAL ── */}
              <motion.section
                variants={fadeUp}
                custom={3}
                className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 md:p-8"
              >
                <h2
                  className="text-xl tracking-tight mb-6"
                  style={{ fontFamily: "'DM Serif Display', serif" }}
                >
                  Referral
                </h2>

                {referralCode && referralLink ? (
                  <div className="space-y-5">
                    {/* Referral link */}
                    <div>
                      <label className="block text-xs uppercase tracking-[0.15em] text-white/25 mb-2 font-medium">
                        Your Link
                      </label>
                      <div className="flex items-center gap-2">
                        <div
                          className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-3 text-xs text-white/50 truncate"
                          style={{ fontFamily: "var(--font-geist-mono)" }}
                        >
                          {referralLink}
                        </div>
                        <button
                          onClick={copyReferralLink}
                          className="flex-shrink-0 p-3 rounded-xl bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] transition-colors"
                        >
                          {copied ? (
                            <Check className="w-4 h-4 text-emerald-400" />
                          ) : (
                            <Copy className="w-4 h-4 text-white/40" />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Stats */}
                    {referralStats && (
                      <div className="flex gap-6">
                        <div className="flex items-center gap-2">
                          <MousePointerClick className="w-4 h-4 text-white/20" />
                          <span
                            className="text-lg font-bold text-white/70"
                            style={{ fontFamily: "var(--font-geist-mono)" }}
                          >
                            {referralStats.clicks}
                          </span>
                          <span className="text-xs text-white/25">clicks</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Users className="w-4 h-4 text-white/20" />
                          <span
                            className="text-lg font-bold text-white/70"
                            style={{ fontFamily: "var(--font-geist-mono)" }}
                          >
                            {referralStats.signups}
                          </span>
                          <span className="text-xs text-white/25">signups</span>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    <p className="text-sm text-white/35 mb-5">
                      Share BayParlays with friends and track your referrals.
                    </p>
                    <button
                      onClick={handleGenerateReferral}
                      disabled={generatingRef}
                      className="flex items-center gap-2 bg-white/[0.06] text-white/70 px-6 py-2.5 text-sm font-semibold rounded-full border border-white/[0.08] hover:bg-white/[0.1] transition-colors duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {generatingRef ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Generating...
                        </>
                      ) : (
                        <>
                          <Link2 className="w-4 h-4" />
                          Generate Referral Link
                        </>
                      )}
                    </button>
                  </div>
                )}
              </motion.section>

              {/* ── ACCOUNT ACTIONS ── */}
              <motion.section
                variants={fadeUp}
                custom={4}
                className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 md:p-8"
              >
                <h2
                  className="text-xl tracking-tight mb-6"
                  style={{ fontFamily: "'DM Serif Display', serif" }}
                >
                  Account
                </h2>

                <div className="space-y-4">
                  <button
                    onClick={handleSignOut}
                    className="flex items-center gap-2 text-sm text-white/50 hover:text-white transition-colors duration-200"
                  >
                    <LogOut className="w-4 h-4" />
                    Sign Out
                  </button>

                  <div className="pt-4 border-t border-white/[0.04]">
                    <button
                      onClick={() => setShowDeleteMsg(!showDeleteMsg)}
                      className="flex items-center gap-2 text-sm text-[#FF3B3B]/50 hover:text-[#FF3B3B] transition-colors duration-200"
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete Account
                    </button>
                    {showDeleteMsg && (
                      <motion.p
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        className="text-xs text-white/30 mt-3 pl-6"
                      >
                        Contact support at eljordp@gmail.com to delete your account.
                      </motion.p>
                    )}
                  </div>
                </div>
              </motion.section>
            </motion.div>
          )}
        </div>
      </main>

      {/* ── FOOTER ── */}
      <footer className="border-t border-white/[0.04] py-16 md:py-20">
        <div className="w-full max-w-[1400px] mx-auto px-6 md:px-10">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 md:gap-8 mb-16">
            <div className="md:col-span-2">
              <Logo size="sm" />
              <p className="text-sm text-white/30 mt-3 max-w-sm leading-relaxed">
                AI-powered parlay optimization. We find the best odds across
                every sportsbook so you can bet with a mathematical edge.
              </p>
            </div>

            <div>
              <h4 className="text-xs uppercase tracking-[0.15em] text-white/20 mb-4 font-medium">
                Product
              </h4>
              <div className="space-y-3">
                {["Parlays", "Odds", "Builder", "Subscribe"].map((link) => (
                  <Link
                    key={link}
                    href={`/${link.toLowerCase()}`}
                    className="block text-sm text-white/40 hover:text-white/70 transition-colors"
                  >
                    {link}
                  </Link>
                ))}
              </div>
            </div>

            <div>
              <h4 className="text-xs uppercase tracking-[0.15em] text-white/20 mb-4 font-medium">
                Company
              </h4>
              <div className="space-y-3">
                {["About", "Terms", "Privacy", "Contact"].map((link) => (
                  <Link
                    key={link}
                    href={`/${link.toLowerCase()}`}
                    className="block text-sm text-white/40 hover:text-white/70 transition-colors"
                  >
                    {link}
                  </Link>
                ))}
              </div>
            </div>
          </div>

          <div className="pt-8 border-t border-white/[0.04] flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-xs text-white/20">
              &copy; {new Date().getFullYear()} BayParlays. All rights reserved.
            </p>
            <p className="text-xs text-white/15 max-w-lg text-center md:text-right leading-relaxed">
              For entertainment purposes only. BayParlays does not accept or
              place bets. Please gamble responsibly. If you or someone you
              know has a gambling problem, call 1-800-GAMBLER.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
