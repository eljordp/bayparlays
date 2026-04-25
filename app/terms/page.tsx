"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Logo } from "@/app/components/Logo";
import { NavUser } from "@/app/components/NavUser";

export default function TermsPage() {
  return (
    <div className="min-h-screen" style={{ background: "#FAFAF7" }}>
      {/* ─── Nav ─── */}
      <nav
        className="fixed top-0 left-0 right-0 z-50"
        style={{
          background: "rgba(250,250,247,0.85)",
          backdropFilter: "blur(20px)",
          borderBottom: "1px solid rgba(0,0,0,0.06)",
        }}
      >
        <div className="max-w-[1400px] mx-auto px-6 h-20 flex items-center justify-between">
          <Link href="/" className="flex items-center">
            <Logo />
          </Link>
          <NavUser />
        </div>
      </nav>

      {/* ─── Content ─── */}
      <main className="pt-32 pb-20 px-6 md:pt-40 md:pb-32">
        <div className="max-w-[720px] mx-auto">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <h1
              className="text-4xl md:text-5xl font-normal mb-4"
              style={{ fontFamily: "'DM Serif Display', serif", color: "#0a0a0a" }}
            >
              Terms of Service
            </h1>
            <p className="text-sm mb-12" style={{ color: "rgba(0,0,0,0.4)" }}>
              Last updated: April 2026
            </p>

            <div className="space-y-10">
              <Section title="What BayParlays Is">
                BayParlays is a sports analytics and odds comparison platform. We provide
                AI-powered parlay analysis, simulated betting tools, and odds data aggregation.
                We do not accept, facilitate, or place real-money bets on behalf of any user.
              </Section>

              <Section title="Subscriptions">
                BayParlays offers free and paid subscription tiers. Paid subscriptions are billed
                monthly via Stripe. You can cancel anytime from your account settings. The Sharp
                tier includes a 7-day free trial with no credit card required.
              </Section>

              <Section title="No Guarantees">
                Past performance does not guarantee future results. All analysis, predictions, and
                sim results are for informational and entertainment purposes only. BayParlays is
                not financial advice. Never bet more than you can afford to lose.
              </Section>

              <Section title="Age Requirement">
                You must be 21 years of age or older and located in a jurisdiction where sports
                betting is legal to use BayParlays. By using this platform, you confirm that you
                meet these requirements.
              </Section>

              <Section title="Responsible Gambling">
                If you or someone you know has a gambling problem, please call{" "}
                <span style={{ color: "#0a0a0a", fontWeight: 600 }}>1-800-GAMBLER</span> or visit{" "}
                <a
                  href="https://www.ncpgambling.org"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                  style={{ color: "#0a0a0a" }}
                >
                  ncpgambling.org
                </a>
                .
              </Section>

              <Section title="Changes to These Terms">
                We may update these terms from time to time. Continued use of BayParlays after
                changes are posted constitutes acceptance of the updated terms.
              </Section>

              <Section title="Contact">
                Questions? Reach us at{" "}
                <a href="mailto:eljordp@gmail.com" className="underline" style={{ color: "#0a0a0a" }}>
                  eljordp@gmail.com
                </a>
                .
              </Section>
            </div>
          </motion.div>
        </div>
      </main>

      {/* ─── Footer ─── */}
      <footer className="px-6 py-12" style={{ borderTop: "1px solid rgba(0,0,0,0.06)" }}>
        <div className="max-w-[1400px] mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm" style={{ color: "rgba(0,0,0,0.4)" }}>
            BayParlays. AI-powered parlay optimization.
          </p>
          <div className="flex items-center gap-6">
            <Link href="/terms" className="text-xs font-medium" style={{ color: "rgba(0,0,0,0.45)" }}>
              Terms
            </Link>
            <Link href="/privacy" className="text-xs transition-colors duration-200" style={{ color: "rgba(0,0,0,0.3)" }}>
              Privacy
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2
        className="text-lg md:text-xl mb-3"
        style={{ fontFamily: "'DM Serif Display', serif", color: "#0a0a0a" }}
      >
        {title}
      </h2>
      <p className="text-sm leading-relaxed" style={{ color: "rgba(0,0,0,0.5)", lineHeight: 1.8 }}>
        {children}
      </p>
    </div>
  );
}
