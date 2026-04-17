"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Check, ChevronDown, Menu, X, Loader2 } from "lucide-react";
import { Logo } from "@/app/components/Logo";

/* ─── animation helpers ─── */
const fadeUp = {
  hidden: { opacity: 0, y: 32 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.6, ease: [0.22, 1, 0.36, 1] as const },
  }),
};

const stagger = {
  visible: { transition: { staggerChildren: 0.12 } },
};

/* ─── FAQ data ─── */
const faqs = [
  {
    q: "What sports are covered?",
    a: "NBA, NFL, MLB, NHL, UFC, NCAAF, NCAAB, and Soccer. We add new sports and markets regularly.",
  },
  {
    q: "How are parlays generated?",
    a: "Our algorithm scans odds across 12+ sportsbooks, calculates expected value, and builds parlays with a mathematical edge. Every pick is backed by data, not hunches.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. Cancel with one click from your account settings. No contracts, no cancellation fees.",
  },
  {
    q: "What payment methods are accepted?",
    a: "All major credit and debit cards via Stripe. Your payment info is never stored on our servers.",
  },
];

/* ─── page ─── */
export default function SubscribePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-white/20" />
      </div>
    }>
      <SubscribeContent />
    </Suspense>
  );
}

function SubscribeContent() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const searchParams = useSearchParams();

  const success = searchParams.get("success") === "true";
  const canceled = searchParams.get("canceled") === "true";

  const handleCheckout = async () => {
    setCheckoutLoading(true);
    try {
      const res = await fetch("/api/checkout", { method: "POST" });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error || "Something went wrong. Try again.");
        setCheckoutLoading(false);
      }
    } catch {
      alert("Unable to start checkout. Please try again.");
      setCheckoutLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#ededed] overflow-x-hidden">
      {/* ── NAV ── */}
      <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-xl bg-[#0a0a0a]/80 border-b border-white/[0.06]">
        <div className="w-full max-w-[1400px] mx-auto flex items-center justify-between px-6 md:px-10 h-16">
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
            <Link
              href="/subscribe"
              className="bg-[#FF3B3B] text-[#0a0a0a] px-5 py-2 text-xs sm:text-sm font-semibold rounded-full hover:bg-[#FF5252] transition-colors duration-200"
            >
              Go Pro
            </Link>
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
            </div>
          </div>
        )}
      </nav>

      {/* ── SUCCESS / CANCELED BANNERS ── */}
      <AnimatePresence>
        {success && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-16 left-0 right-0 z-40 bg-[#FF3B3B]/10 border-b border-[#FF3B3B]/20"
          >
            <div className="max-w-[1400px] mx-auto px-6 md:px-10 py-4 flex items-center gap-3">
              <div className="w-6 h-6 rounded-full bg-[#FF3B3B]/20 flex items-center justify-center flex-shrink-0">
                <Check className="w-3.5 h-3.5 text-[#FF3B3B]" />
              </div>
              <p className="text-sm text-[#FF3B3B]">
                You&apos;re in. Pro access is now active. Start building unlimited parlays.
              </p>
            </div>
          </motion.div>
        )}
        {canceled && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-16 left-0 right-0 z-40 bg-white/[0.03] border-b border-white/[0.06]"
          >
            <div className="max-w-[1400px] mx-auto px-6 md:px-10 py-4">
              <p className="text-sm text-white/50">
                Checkout canceled. No charge was made. You can start again whenever you&apos;re ready.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── HEADER ── */}
      <section className="pt-32 md:pt-44 pb-8 md:pb-12 relative">
        {/* Background grain */}
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='1'/%3E%3C/svg%3E")`,
          backgroundSize: "128px 128px",
        }} />

        <div className="relative w-full max-w-[1400px] mx-auto px-6 md:px-10 text-center">
          <motion.div initial="hidden" animate="visible" variants={stagger}>
            <motion.h1
              variants={fadeUp}
              custom={0}
              className="text-5xl sm:text-6xl md:text-7xl tracking-tight mb-5"
              style={{ fontFamily: "'DM Serif Display', serif" }}
            >
              Go Pro
            </motion.h1>
            <motion.p
              variants={fadeUp}
              custom={1}
              className="text-lg md:text-xl text-white/40 max-w-lg mx-auto leading-relaxed"
            >
              Unlimited parlays, full builder access, every edge calculated.
            </motion.p>
          </motion.div>
        </div>
      </section>

      {/* ── PRICING COMPARISON ── */}
      <section className="py-12 md:py-24">
        <div className="w-full max-w-[1000px] mx-auto px-6 md:px-10">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-50px" }}
            variants={stagger}
            className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8"
          >
            {/* ── FREE COLUMN ── */}
            <motion.div
              variants={fadeUp}
              custom={2}
              className="border border-white/[0.06] rounded-2xl p-8 md:p-10 bg-white/[0.015]"
            >
              <div className="mb-8">
                <span className="text-xs font-medium uppercase tracking-[0.2em] text-white/30">
                  Free
                </span>
              </div>

              <div className="mb-8">
                <span
                  className="text-5xl font-bold tracking-tight text-white/60"
                  style={{ fontFamily: "var(--font-geist-mono)" }}
                >
                  $0
                </span>
                <span className="text-sm text-white/20 ml-2">/mo</span>
              </div>

              <div className="space-y-4 mb-10">
                {[
                  "2 AI parlays per day",
                  "Live odds comparison",
                  "Basic stats",
                ].map((item) => (
                  <div key={item} className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full bg-white/[0.06] flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Check className="w-3 h-3 text-white/30" />
                    </div>
                    <span className="text-sm text-white/40 leading-relaxed">{item}</span>
                  </div>
                ))}
              </div>

              <button
                disabled
                className="w-full py-3.5 rounded-full text-sm font-semibold bg-white/[0.04] text-white/20 border border-white/[0.06] cursor-not-allowed"
              >
                Current Plan
              </button>
            </motion.div>

            {/* ── PRO COLUMN ── */}
            <motion.div
              variants={fadeUp}
              custom={3}
              className="relative border border-[#FF3B3B]/20 rounded-2xl p-8 md:p-10 bg-[#FF3B3B]/[0.03]"
            >
              {/* Glow */}
              <div className="absolute -inset-px rounded-2xl bg-gradient-to-b from-[#FF3B3B]/[0.08] to-transparent pointer-events-none" />

              <div className="relative">
                <div className="mb-8 flex items-center gap-3">
                  <span className="text-xs font-medium uppercase tracking-[0.2em] text-[#FF3B3B]">
                    Pro
                  </span>
                  <span className="text-[10px] font-semibold uppercase tracking-wider bg-[#FF3B3B]/10 text-[#FF3B3B] px-2.5 py-1 rounded-full border border-[#FF3B3B]/20">
                    Recommended
                  </span>
                </div>

                <div className="mb-8">
                  <span
                    className="text-5xl font-bold tracking-tight text-white"
                    style={{ fontFamily: "var(--font-geist-mono)" }}
                  >
                    $14.99
                  </span>
                  <span className="text-sm text-white/30 ml-2">/mo</span>
                </div>

                <div className="space-y-4 mb-10">
                  {[
                    "Unlimited AI parlays",
                    "Full parlay builder",
                    "All sports + markets",
                    "Priority odds updates",
                    "Shareable parlay cards",
                  ].map((item) => (
                    <div key={item} className="flex items-start gap-3">
                      <div className="w-5 h-5 rounded-full bg-[#FF3B3B]/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Check className="w-3 h-3 text-[#FF3B3B]" />
                      </div>
                      <span className="text-sm text-white/70 leading-relaxed">{item}</span>
                    </div>
                  ))}
                </div>

                <button
                  onClick={handleCheckout}
                  disabled={checkoutLoading}
                  className="w-full py-3.5 rounded-full text-sm font-semibold bg-[#FF3B3B] text-[#0a0a0a] hover:bg-[#FF5252] transition-colors duration-200 flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {checkoutLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    "Start Pro"
                  )}
                </button>

                <p className="text-xs text-white/25 text-center mt-4 leading-relaxed">
                  Cancel anytime. 7-day free trial.
                </p>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="py-16 md:py-32 border-t border-white/[0.04]">
        <div className="w-full max-w-[720px] mx-auto px-6 md:px-10">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-50px" }}
            variants={stagger}
          >
            <motion.p
              variants={fadeUp}
              custom={0}
              className="text-xs font-medium uppercase tracking-[0.2em] text-[#FF3B3B]/60 mb-4"
            >
              FAQ
            </motion.p>
            <motion.h2
              variants={fadeUp}
              custom={1}
              className="text-3xl md:text-4xl tracking-tight mb-14"
              style={{ fontFamily: "'DM Serif Display', serif" }}
            >
              Common questions
            </motion.h2>

            <div className="space-y-2">
              {faqs.map((faq, i) => (
                <motion.div
                  key={i}
                  variants={fadeUp}
                  custom={i + 2}
                  className="border border-white/[0.06] rounded-xl overflow-hidden"
                >
                  <button
                    onClick={() => setOpenFaq(openFaq === i ? null : i)}
                    className="w-full flex items-center justify-between px-6 py-5 text-left hover:bg-white/[0.02] transition-colors duration-200"
                  >
                    <span className="text-sm font-medium text-white/80 pr-4">{faq.q}</span>
                    <ChevronDown
                      className={`w-4 h-4 text-white/30 flex-shrink-0 transition-transform duration-300 ${
                        openFaq === i ? "rotate-180" : ""
                      }`}
                    />
                  </button>
                  <AnimatePresence>
                    {openFaq === i && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                        className="overflow-hidden"
                      >
                        <div className="px-6 pb-5">
                          <p className="text-sm text-white/35 leading-relaxed">{faq.a}</p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

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
