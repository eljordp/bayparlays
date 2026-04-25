"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Logo } from "@/app/components/Logo";
import { NavUser } from "@/app/components/NavUser";

export default function PrivacyPage() {
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
              Privacy Policy
            </h1>
            <p className="text-sm mb-12" style={{ color: "rgba(0,0,0,0.4)" }}>
              Last updated: April 2026
            </p>

            <div className="space-y-10">
              <Section title="What We Collect">
                When you create an account, we collect your email address and a hashed password.
                We also collect basic usage data such as pages visited and features used to
                improve the product.
              </Section>

              <Section title="How We Use It">
                Your data is used for account management, subscription management, and improving
                BayParlays. We analyze aggregate usage patterns to make the platform better. We
                never use your data for advertising.
              </Section>

              <Section title="Third Parties">
                We use the following services to operate BayParlays:
              </Section>

              <div className="-mt-4 ml-1 space-y-2">
                <ServiceItem name="Stripe" purpose="Payment processing for subscriptions" />
                <ServiceItem name="Supabase" purpose="Database and authentication" />
                <ServiceItem name="Vercel" purpose="Hosting and deployment" />
              </div>

              <div className="-mt-4">
                <p className="text-sm leading-relaxed" style={{ color: "rgba(0,0,0,0.5)", lineHeight: 1.8 }}>
                  We do not sell, rent, or share your personal data with any other third parties.
                </p>
              </div>

              <Section title="Cookies">
                We use essential cookies for authentication and session management. We do not use
                tracking cookies, third-party analytics cookies, or advertising cookies.
              </Section>

              <Section title="Data Deletion">
                You can request deletion of your account and all associated data at any time by
                emailing{" "}
                <a href="mailto:eljordp@gmail.com" className="underline" style={{ color: "#0a0a0a" }}>
                  eljordp@gmail.com
                </a>
                . We will process your request within 30 days.
              </Section>

              <Section title="Contact">
                For any privacy-related questions, reach us at{" "}
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
            <Link href="/terms" className="text-xs transition-colors duration-200" style={{ color: "rgba(0,0,0,0.3)" }}>
              Terms
            </Link>
            <Link href="/privacy" className="text-xs font-medium" style={{ color: "rgba(0,0,0,0.45)" }}>
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

function ServiceItem({ name, purpose }: { name: string; purpose: string }) {
  return (
    <div className="flex items-start gap-3 pl-1">
      <div className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0" style={{ background: "#0a0a0a" }} />
      <p className="text-sm" style={{ color: "rgba(0,0,0,0.5)", lineHeight: 1.8 }}>
        <span style={{ color: "rgba(0,0,0,0.7)", fontWeight: 600 }}>{name}</span> — {purpose}
      </p>
    </div>
  );
}
