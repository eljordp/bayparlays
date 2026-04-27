"use client";

import Link from "next/link";
import { AppNav } from "@/app/components/AppNav";
import { useAuth } from "@/app/components/AuthProvider";

interface ResearchTile {
  href: string;
  title: string;
  question: string;
  status: "live" | "soon";
}

const TILES: ResearchTile[] = [
  {
    href: "/admin/research/edge-accuracy",
    title: "Edge Accuracy",
    question: "When the AI claims +8% edge, does the parlay actually win 8% more than book?",
    status: "live",
  },
  {
    href: "/admin/research/confidence-accuracy",
    title: "Confidence Accuracy",
    question: "When the AI says it's 75% confident, does it actually hit 75% of the time?",
    status: "soon",
  },
  {
    href: "/admin/research/per-book",
    title: "Per-Book Edge",
    question: "Which sportsbook does the AI find its best (and worst) edges at?",
    status: "soon",
  },
  {
    href: "/admin/research/per-market",
    title: "Per-Market Accuracy",
    question: "Is the AI better at moneylines, spreads, or totals?",
    status: "soon",
  },
  {
    href: "/admin/research/per-slate",
    title: "Per-Slate Performance",
    question: "Are morning slates sharper than evening slates? Which window hits hardest?",
    status: "soon",
  },
];

export default function ResearchHub() {
  const { isAdmin, loading } = useAuth();
  if (loading) return <div className="min-h-screen bg-[#FAFAF7]" />;
  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-[#FAFAF7]">
        <AppNav />
        <div className="pt-32 px-6 max-w-xl mx-auto text-center">
          <h1 className="text-3xl font-serif mb-4">Admin only</h1>
          <Link href="/" className="text-sm text-black/60 underline">← Home</Link>
        </div>
      </div>
    );
  }
  return (
    <div className="min-h-screen bg-[#FAFAF7]">
      <AppNav />
      <main className="pt-24 pb-16 px-4 md:px-8 max-w-[1100px] mx-auto">
        <header className="mb-10">
          <h1
            className="text-4xl md:text-5xl font-normal mb-3"
            style={{ fontFamily: "'DM Serif Display', serif" }}
          >
            Research
          </h1>
          <p className="text-base text-black/55 max-w-2xl leading-relaxed">
            Internal data dashboards. Each one asks the data a specific question
            about how the AI is actually performing — proves or disproves model
            claims using your real resolved-bet history.
          </p>
        </header>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {TILES.map((t) => {
            const isLive = t.status === "live";
            const Body = (
              <div
                className="rounded-2xl p-6 h-full transition-colors"
                style={{
                  background: "white",
                  border: "1px solid rgba(0,0,0,0.06)",
                  opacity: isLive ? 1 : 0.55,
                }}
              >
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-lg font-semibold text-[#0a0a0a]">{t.title}</h2>
                  <span
                    className="text-[10px] uppercase tracking-widest font-bold px-2 py-0.5 rounded"
                    style={{
                      color: isLive ? "#15803d" : "rgba(0,0,0,0.4)",
                      background: isLive ? "rgba(34,197,94,0.10)" : "rgba(0,0,0,0.04)",
                      border: `1px solid ${isLive ? "rgba(34,197,94,0.25)" : "rgba(0,0,0,0.08)"}`,
                    }}
                  >
                    {isLive ? "LIVE" : "SOON"}
                  </span>
                </div>
                <p className="text-sm text-black/55 leading-relaxed">{t.question}</p>
              </div>
            );
            return isLive ? (
              <Link key={t.href} href={t.href}>
                {Body}
              </Link>
            ) : (
              <div key={t.href}>{Body}</div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
