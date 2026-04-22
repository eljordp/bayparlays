"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Copy, Check, Menu, X, Share2, Users, MousePointerClick, Gift } from "lucide-react";
import { NavUser } from "@/app/components/NavUser";
import { Logo } from "@/app/components/Logo";

/* ─── animation helpers ─── */
const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.6, ease: [0.22, 1, 0.36, 1] as const },
  }),
};

export default function ReferPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [name, setName] = useState("");
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [referralLink, setReferralLink] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [stats, setStats] = useState<{ clicks: number; signups: number } | null>(null);

  // Load existing code from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("bp_referral_code");
    const savedLink = localStorage.getItem("bp_referral_link");
    if (saved && savedLink) {
      setReferralCode(saved);
      setReferralLink(savedLink);
      fetchStats(saved);
    }
  }, []);

  async function fetchStats(code: string) {
    try {
      const res = await fetch(`/api/referral?code=${code}`);
      if (res.ok) {
        const data = await res.json();
        setStats({ clicks: data.clicks || 0, signups: data.signups || 0 });
      }
    } catch {
      // silently fail
    }
  }

  async function handleGenerate() {
    setLoading(true);
    try {
      const res = await fetch("/api/referral", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name || undefined }),
      });
      const data = await res.json();
      if (data.code) {
        setReferralCode(data.code);
        setReferralLink(data.link);
        localStorage.setItem("bp_referral_code", data.code);
        localStorage.setItem("bp_referral_link", data.link);
        setStats({ clicks: 0, signups: 0 });
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }

  function handleCopy() {
    if (referralLink) {
      navigator.clipboard.writeText(referralLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  function handleShareTwitter() {
    const text = encodeURIComponent(
      `I'm using BayParlays to find +EV parlays backed by AI. Use my link to sign up:`
    );
    const url = encodeURIComponent(referralLink || "");
    window.open(`https://twitter.com/intent/tweet?text=${text}&url=${url}`, "_blank");
  }

  function handleShareIG() {
    // Copy link and prompt user
    handleCopy();
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
            <Link href="/parlays" className="hover:text-white transition-colors duration-200">Parlays</Link>
            <Link href="/props" className="hover:text-white transition-colors duration-200">Props</Link>
            <Link href="/odds" className="hover:text-white transition-colors duration-200">Odds</Link>
            <Link href="/builder" className="hover:text-white transition-colors duration-200">Builder</Link>
            <Link href="/results" className="hover:text-white transition-colors duration-200">Results</Link>
            <Link href="/simulator" className="hover:text-white transition-colors duration-200">Simulator</Link>
            <Link href="/my-stats" className="hover:text-white transition-colors duration-200">My Stats</Link>
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
              <Link href="/parlays" onClick={() => setMobileMenuOpen(false)} className="text-sm text-white/50 hover:text-white transition-colors duration-200">Parlays</Link>
              <Link href="/props" onClick={() => setMobileMenuOpen(false)} className="text-sm text-white/50 hover:text-white transition-colors duration-200">Props</Link>
              <Link href="/odds" onClick={() => setMobileMenuOpen(false)} className="text-sm text-white/50 hover:text-white transition-colors duration-200">Odds</Link>
              <Link href="/builder" onClick={() => setMobileMenuOpen(false)} className="text-sm text-white/50 hover:text-white transition-colors duration-200">Builder</Link>
              <Link href="/results" onClick={() => setMobileMenuOpen(false)} className="text-sm text-white/50 hover:text-white transition-colors duration-200">Results</Link>
              <Link href="/simulator" onClick={() => setMobileMenuOpen(false)} className="text-sm text-white/50 hover:text-white transition-colors duration-200">Simulator</Link>
              <Link href="/my-stats" onClick={() => setMobileMenuOpen(false)} className="text-sm text-white/50 hover:text-white transition-colors duration-200">My Stats</Link>
            </div>
          </div>
        )}
      </nav>

      {/* ── HEADER ── */}
      <section className="pt-32 md:pt-44 pb-8 md:pb-12">
        <div className="w-full max-w-[1400px] mx-auto px-6 md:px-10 text-center">
          <motion.div initial="hidden" animate="visible">
            <motion.p
              variants={fadeUp}
              custom={0}
              className="text-xs font-medium uppercase tracking-[0.2em] text-[#FF3B3B]/60 mb-5"
            >
              Referral Program
            </motion.p>
            <motion.h1
              variants={fadeUp}
              custom={1}
              className="text-5xl sm:text-6xl md:text-7xl tracking-tight mb-5"
              style={{ fontFamily: "'DM Serif Display', serif" }}
            >
              Refer &amp; Earn
            </motion.h1>
            <motion.p
              variants={fadeUp}
              custom={2}
              className="text-lg md:text-xl text-white/40 max-w-lg mx-auto leading-relaxed"
            >
              Give your friends access. Get a free month for every signup.
            </motion.p>
          </motion.div>
        </div>
      </section>

      {/* ── GENERATE SECTION ── */}
      <section className="py-16 md:py-24">
        <div className="w-full max-w-[600px] mx-auto px-6 md:px-10">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-50px" }}
          >
            {!referralCode ? (
              <motion.div variants={fadeUp} custom={0} className="space-y-5">
                <div>
                  <label className="block text-xs uppercase tracking-[0.15em] text-white/30 mb-2 font-medium">
                    Your name (optional)
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. JP"
                    className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-5 py-4 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-[#FF3B3B]/40 transition-colors"
                  />
                </div>
                <button
                  onClick={handleGenerate}
                  disabled={loading}
                  className="w-full bg-[#FF3B3B] text-[#0a0a0a] py-4 rounded-full text-sm font-semibold hover:bg-[#FF5252] transition-colors duration-200 disabled:opacity-60"
                >
                  {loading ? "Generating..." : "Generate My Link"}
                </button>
              </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="space-y-6"
              >
                {/* Copyable link box */}
                <div>
                  <label className="block text-xs uppercase tracking-[0.15em] text-white/30 mb-2 font-medium">
                    Your referral link
                  </label>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-xl px-5 py-4 text-sm text-white/70 truncate font-mono">
                      {referralLink}
                    </div>
                    <button
                      onClick={handleCopy}
                      className="flex-shrink-0 bg-white/[0.06] border border-white/[0.08] rounded-xl p-4 hover:bg-white/[0.1] transition-colors"
                    >
                      {copied ? (
                        <Check className="w-4 h-4 text-[#FF3B3B]" />
                      ) : (
                        <Copy className="w-4 h-4 text-white/50" />
                      )}
                    </button>
                  </div>
                  {copied && (
                    <p className="text-xs text-[#FF3B3B]/70 mt-2">Copied to clipboard</p>
                  )}
                </div>

                {/* Share buttons */}
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleCopy}
                    className="flex-1 flex items-center justify-center gap-2 bg-white/[0.04] border border-white/[0.06] rounded-xl py-3.5 text-sm text-white/60 hover:bg-white/[0.08] hover:text-white/80 transition-all"
                  >
                    <Copy className="w-4 h-4" />
                    Copy Link
                  </button>
                  <button
                    onClick={handleShareTwitter}
                    className="flex-1 flex items-center justify-center gap-2 bg-white/[0.04] border border-white/[0.06] rounded-xl py-3.5 text-sm text-white/60 hover:bg-white/[0.08] hover:text-white/80 transition-all"
                  >
                    <Share2 className="w-4 h-4" />
                    Twitter
                  </button>
                  <button
                    onClick={handleShareIG}
                    className="flex-1 flex items-center justify-center gap-2 bg-white/[0.04] border border-white/[0.06] rounded-xl py-3.5 text-sm text-white/60 hover:bg-white/[0.08] hover:text-white/80 transition-all"
                  >
                    <Share2 className="w-4 h-4" />
                    IG Story
                  </button>
                </div>
              </motion.div>
            )}
          </motion.div>
        </div>
      </section>

      {/* ── STATS SECTION ── */}
      {stats && (
        <section className="py-12 md:py-20 border-y border-white/[0.06] bg-[#111111]">
          <div className="w-full max-w-[800px] mx-auto px-6 md:px-10">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="grid grid-cols-3 gap-6 md:gap-10"
            >
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-white/[0.04] mb-3">
                  <MousePointerClick className="w-4 h-4 text-[#FF3B3B]/60" />
                </div>
                <div
                  className="text-3xl md:text-4xl font-bold text-white mb-1"
                  style={{ fontFamily: "var(--font-geist-mono)" }}
                >
                  {stats.clicks}
                </div>
                <div className="text-xs text-white/30 uppercase tracking-widest">Clicks</div>
              </div>
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-white/[0.04] mb-3">
                  <Users className="w-4 h-4 text-[#FF3B3B]/60" />
                </div>
                <div
                  className="text-3xl md:text-4xl font-bold text-white mb-1"
                  style={{ fontFamily: "var(--font-geist-mono)" }}
                >
                  {stats.signups}
                </div>
                <div className="text-xs text-white/30 uppercase tracking-widest">Signups</div>
              </div>
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-white/[0.04] mb-3">
                  <Gift className="w-4 h-4 text-[#FF3B3B]/60" />
                </div>
                <div
                  className="text-3xl md:text-4xl font-bold text-[#FF3B3B] mb-1"
                  style={{ fontFamily: "var(--font-geist-mono)" }}
                >
                  {stats.signups}
                </div>
                <div className="text-xs text-white/30 uppercase tracking-widest">Free Months</div>
              </div>
            </motion.div>
          </div>
        </section>
      )}

      {/* ── HOW IT WORKS ── */}
      <section className="py-24 md:py-36">
        <div className="w-full max-w-[1000px] mx-auto px-6 md:px-10">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-60px" }}
          >
            <motion.h2
              variants={fadeUp}
              custom={0}
              className="text-3xl md:text-5xl tracking-tight mb-4 text-center"
              style={{ fontFamily: "'DM Serif Display', serif" }}
            >
              How It Works
            </motion.h2>
            <motion.div variants={fadeUp} custom={1} className="w-16 h-0.5 bg-[#FF3B3B] mx-auto mb-16" />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-12 md:gap-16">
              {[
                {
                  step: "01",
                  title: "Share your link",
                  desc: "Send your unique referral link to friends who bet on sports.",
                },
                {
                  step: "02",
                  title: "Friend signs up for Sharp or VIP",
                  desc: "When they subscribe to any paid plan, you both win.",
                },
                {
                  step: "03",
                  title: "You get 1 month free",
                  desc: "Every friend that subscribes earns you a free month of BayParlays.",
                },
              ].map((item, i) => (
                <motion.div
                  key={item.step}
                  variants={fadeUp}
                  custom={i + 2}
                  className="text-center"
                >
                  <span
                    className="text-5xl md:text-6xl font-bold text-[#FF3B3B]/10 block mb-4"
                    style={{ fontFamily: "var(--font-geist-mono)" }}
                  >
                    {item.step}
                  </span>
                  <h3
                    className="text-lg md:text-xl font-medium text-white mb-3"
                    style={{ fontFamily: "'DM Serif Display', serif" }}
                  >
                    {item.title}
                  </h3>
                  <p className="text-sm text-white/35 leading-relaxed max-w-xs mx-auto">
                    {item.desc}
                  </p>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="border-t border-white/[0.04] py-16 md:py-20">
        <div className="w-full max-w-[1400px] mx-auto px-6 md:px-10">
          <div className="flex flex-col md:flex-row items-start justify-between gap-10 mb-12">
            <div>
              <Logo size="sm" />
            </div>

            <div className="flex gap-10 text-sm text-white/30">
              <Link href="/parlays" className="hover:text-white/60 transition-colors">Parlays</Link>
              <Link href="/odds" className="hover:text-white/60 transition-colors">Odds</Link>
              <Link href="/builder" className="hover:text-white/60 transition-colors">Builder</Link>
              <Link href="/subscribe" className="hover:text-white/60 transition-colors">Pricing</Link>
            </div>
          </div>

          <div className="pt-8 border-t border-white/[0.04] flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-xs text-white/20">
              &copy; {new Date().getFullYear()} BayParlays. All rights reserved.
            </p>
            <p className="text-xs text-white/15 max-w-lg text-center md:text-right leading-relaxed">
              For entertainment purposes only. BayParlays does not accept or
              place bets. Please gamble responsibly. If you or someone you know
              has a gambling problem, call 1-800-GAMBLER.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
