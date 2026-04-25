"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Menu, X } from "lucide-react";
import { Logo } from "@/app/components/Logo";
import { NavUser } from "@/app/components/NavUser";

const NAV_LINKS = [
  { href: "/parlays", label: "Parlays" },
  { href: "/odds", label: "Odds" },
  { href: "/builder", label: "Builder" },
  { href: "/results", label: "Results" },
  { href: "/simulator", label: "Simulator" },
];

export default function ContactPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#FAFAF7] text-[#0a0a0a] overflow-x-hidden">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-xl bg-[#FAFAF7]/80 border-b border-black/[0.06]">
        <div className="w-full max-w-[1400px] mx-auto flex items-center justify-between px-6 md:px-10 h-20">
          <Link href="/" className="flex items-center gap-2">
            <Logo />
          </Link>

          <div className="hidden md:flex items-center gap-8 text-sm text-white/50">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="hover:text-white transition-colors duration-200"
              >
                {link.label}
              </Link>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <NavUser />
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden text-black/60 hover:text-black transition-colors"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden border-t border-black/[0.06] bg-[#FAFAF7]/95 backdrop-blur-xl">
            <div className="px-6 py-4 flex flex-col gap-4">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-sm text-black/50 hover:text-black transition-colors duration-200"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
        )}
      </nav>

      {/* Content */}
      <main className="pt-32 pb-24 px-6 md:px-10">
        <div className="w-full max-w-[720px] mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <h1
              className="text-4xl md:text-5xl tracking-tight mb-10"
              style={{ fontFamily: "'DM Serif Display', serif" }}
            >
              Contact
            </h1>

            <div className="space-y-6">
              {[
                { label: "General inquiries", email: "eljordp@gmail.com" },
                { label: "Enterprise pricing", email: "eljordp@gmail.com" },
                { label: "Support", email: "eljordp@gmail.com" },
              ].map((item) => (
                <div key={item.label}>
                  <p className="text-xs uppercase tracking-[0.15em] text-black/40 mb-1.5 font-medium">
                    {item.label}
                  </p>
                  <a
                    href={`mailto:${item.email}`}
                    className="text-base text-black/60 hover:text-black transition-colors"
                    style={{ fontFamily: "var(--font-geist-mono)" }}
                  >
                    {item.email}
                  </a>
                </div>
              ))}

              <div className="pt-4">
                <p className="text-sm text-black/40">
                  Response time: within 24 hours.
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-black/[0.04] py-16 md:py-20">
        <div className="w-full max-w-[1400px] mx-auto px-6 md:px-10">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 md:gap-8 mb-16">
            <div className="md:col-span-2">
              <Logo size="sm" />
              <p className="text-sm text-black/40 mt-3 max-w-sm leading-relaxed">
                AI-powered parlay optimization. We find the best odds across
                every sportsbook so you can bet with a mathematical edge.
              </p>
            </div>

            <div>
              <h4 className="text-xs uppercase tracking-[0.15em] text-black/30 mb-4 font-medium">
                Product
              </h4>
              <div className="space-y-3">
                {["Parlays", "Odds", "Builder", "Subscribe"].map((link) => (
                  <Link
                    key={link}
                    href={`/${link.toLowerCase()}`}
                    className="block text-sm text-black/45 hover:text-black/70 transition-colors"
                  >
                    {link}
                  </Link>
                ))}
              </div>
            </div>

            <div>
              <h4 className="text-xs uppercase tracking-[0.15em] text-black/30 mb-4 font-medium">
                Company
              </h4>
              <div className="space-y-3">
                {["About", "Terms", "Privacy", "Contact"].map((link) => (
                  <Link
                    key={link}
                    href={`/${link.toLowerCase()}`}
                    className="block text-sm text-black/45 hover:text-black/70 transition-colors"
                  >
                    {link}
                  </Link>
                ))}
              </div>
            </div>
          </div>

          <div className="pt-8 border-t border-black/[0.04] flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-xs text-black/30">
              &copy; {new Date().getFullYear()} BayParlays. All rights reserved.
            </p>
            <p className="text-xs text-black/25 max-w-lg text-center md:text-right leading-relaxed">
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
