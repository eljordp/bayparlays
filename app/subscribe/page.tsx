"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Check, ChevronDown, Loader2 } from "lucide-react";
import { AppNav } from "@/app/components/AppNav";
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

const plans = [
  {
    id: "sharp",
    name: "Sharp",
    price: "$50",
    period: "/mo",
    desc: "The preview tier. See what the edge looks like.",
    features: [
      "5 AI parlays per day",
      "Odds comparison (top 3 books)",
      "Basic track record access",
      "Betting simulator ($1K bankroll)",
      "All 8 sports + markets",
      "See what VIP unlocks",
    ],
    highlight: false,
    cta: "Start Sharp",
  },
  {
    id: "vip",
    name: "VIP",
    price: "$150",
    period: "/mo",
    desc: "The real product. Full access, full edge.",
    features: [
      "Unlimited AI parlays",
      "Full parlay builder",
      "Betting simulator ($10K bankroll)",
      "Shareable Remotion video cards",
      "All achievements unlockable",
      "Leaderboard access",
      "Advanced EV analytics",
      "Priority parlay generation",
      "Private Discord channel",
    ],
    highlight: true,
    cta: "Go VIP",
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: "$500+",
    period: "/mo",
    desc: "White glove. Built around your bankroll.",
    features: [
      "Everything in VIP",
      "Custom parlays built for your bankroll",
      "1-on-1 strategy sessions",
      "API access for automation",
      "Dedicated support",
      "Custom integrations",
    ],
    highlight: false,
    cta: "Contact Us",
    isInquiry: true,
  },
];

function SubscribeContent() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const searchParams = useSearchParams();

  const success = searchParams.get("success") === "true";
  const canceled = searchParams.get("canceled") === "true";

  const handleCheckout = async (tier: string) => {
    setCheckoutLoading(tier);
    try {
      const ref = typeof window !== "undefined" ? localStorage.getItem("bp_ref") : null;
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier, ...(ref ? { ref } : {}) }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error || "Something went wrong. Try again.");
        setCheckoutLoading(null);
      }
    } catch {
      alert("Unable to start checkout. Please try again.");
      setCheckoutLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#ededed] overflow-x-hidden">
      <AppNav />

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

      {/* ── PRICING TIERS ── */}
      <section className="py-12 md:py-24">
        <div className="w-full max-w-[1200px] mx-auto px-4 md:px-10">
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-center text-sm text-white/30 mb-10"
          >
            Sharp includes a 7-day free trial. Cancel anytime before it ends — no charge.
          </motion.p>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-50px" }}
            variants={stagger}
            className="grid grid-cols-1 md:grid-cols-3 gap-5 md:gap-6"
          >
            {plans.map((plan, i) => (
              <motion.div
                key={plan.id}
                variants={fadeUp}
                custom={i + 2}
                className={`relative rounded-2xl p-7 md:p-8 ${
                  plan.highlight
                    ? "border-2 border-[#FF3B3B]/30 bg-[#FF3B3B]/[0.04]"
                    : "border border-white/[0.06] bg-white/[0.015]"
                }`}
              >
                {plan.highlight && (
                  <>
                    <div className="absolute -inset-px rounded-2xl bg-gradient-to-b from-[#FF3B3B]/[0.1] to-transparent pointer-events-none" />
                    <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                      <span className="text-[10px] font-bold uppercase tracking-wider bg-[#FF3B3B] text-[#0a0a0a] px-4 py-1.5 rounded-full">
                        Most Popular
                      </span>
                    </div>
                  </>
                )}

                <div className="relative">
                  <div className="mb-6">
                    <span className={`text-xs font-bold uppercase tracking-[0.2em] ${
                      plan.highlight ? "text-[#FF3B3B]" : "text-white/40"
                    }`}>
                      {plan.name}
                    </span>
                  </div>

                  <div className="mb-2">
                    <span
                      className="text-5xl font-black tracking-tight text-white"
                      style={{ fontFamily: "var(--font-geist-mono)" }}
                    >
                      {plan.price}
                    </span>
                    <span className="text-sm text-white/30 ml-1">{plan.period}</span>
                  </div>
                  <p className="text-sm text-white/35 mb-8">{plan.desc}</p>

                  <div className="space-y-3 mb-8">
                    {plan.features.map((item) => (
                      <div key={item} className="flex items-start gap-3">
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                          plan.highlight ? "bg-[#FF3B3B]/15" : "bg-white/[0.06]"
                        }`}>
                          <Check className={`w-3 h-3 ${
                            plan.highlight ? "text-[#FF3B3B]" : "text-white/40"
                          }`} />
                        </div>
                        <span className="text-sm text-white/60 leading-relaxed">{item}</span>
                      </div>
                    ))}
                  </div>

                  {"isInquiry" in plan && plan.isInquiry ? (
                    <a
                      href="mailto:eljordp@gmail.com?subject=BayParlays Enterprise Inquiry"
                      className="w-full py-3.5 rounded-full text-sm font-semibold bg-white/[0.06] text-white/80 hover:bg-white/[0.1] border border-white/[0.08] transition-colors duration-200 flex items-center justify-center gap-2"
                    >
                      {plan.cta}
                    </a>
                  ) : (
                    <button
                      onClick={() => handleCheckout(plan.id)}
                      disabled={checkoutLoading === plan.id}
                      className={`w-full py-3.5 rounded-full text-sm font-semibold transition-colors duration-200 flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed ${
                        plan.highlight
                          ? "bg-[#FF3B3B] text-[#0a0a0a] hover:bg-[#FF5252]"
                          : "bg-white/[0.06] text-white/80 hover:bg-white/[0.1] border border-white/[0.08]"
                      }`}
                    >
                      {checkoutLoading === plan.id ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Loading...
                        </>
                      ) : (
                        plan.cta
                      )}
                    </button>
                  )}

                  <p className="text-xs text-white/20 text-center mt-4">
                    {plan.id === "sharp" ? "7-day free trial. Cancel anytime." : "Cancel anytime."}
                  </p>
                </div>
              </motion.div>
            ))}
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
