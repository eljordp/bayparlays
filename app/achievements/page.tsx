"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Logo } from "@/app/components/Logo";
import { NavUser } from "@/app/components/NavUser";
import { useAuth } from "@/app/components/AuthProvider";
import { Menu, X, Lock } from "lucide-react";
import type { Badge } from "@/lib/badges";

/* ─── Types ─── */

interface BadgeWithStatus extends Badge {
  unlocked: boolean;
  unlocked_at: string | null;
}

interface AchievementsResponse {
  badges: BadgeWithStatus[];
  totalUnlocked: number;
  totalAvailable: number;
}

interface CheckResponse {
  newBadges: string[];
  totalChecked: number;
}

/* ─── Nav Links ─── */

const NAV_LINKS = [
  { href: "/parlays", label: "Parlays" },
  { href: "/odds", label: "Odds" },
  { href: "/builder", label: "Builder" },
  { href: "/results", label: "Results" },
  { href: "/simulator", label: "Simulator" },
  { href: "/achievements", label: "Achievements" },
];

/* ─── Categories ─── */

const CATEGORIES: { key: string; label: string; description: string }[] = [
  { key: "milestone", label: "Milestones", description: "Betting volume achievements" },
  { key: "streak", label: "Streaks", description: "Consecutive win records" },
  { key: "skill", label: "Skills", description: "Performance-based badges" },
  { key: "social", label: "Social", description: "Community and referral rewards" },
];

/* ─── Helpers ─── */

function formatUnlockedDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function tierLabel(tier: string): string {
  if (tier === "vip") return "Requires VIP";
  if (tier === "sharp") return "Requires Sharp";
  return "";
}

function tierColor(tier: string): { text: string; bg: string; border: string } {
  if (tier === "vip") return { text: "#eab308", bg: "rgba(234,179,8,0.08)", border: "rgba(234,179,8,0.2)" };
  if (tier === "sharp") return { text: "#FF3B3B", bg: "rgba(255,59,59,0.06)", border: "rgba(255,59,59,0.15)" };
  return { text: "rgba(255,255,255,0.4)", bg: "transparent", border: "transparent" };
}

/* ─── Component ─── */

export default function AchievementsPage() {
  const { user, loading: authLoading, tier } = useAuth();
  const [badges, setBadges] = useState<BadgeWithStatus[]>([]);
  const [totalUnlocked, setTotalUnlocked] = useState(0);
  const [totalAvailable, setTotalAvailable] = useState(17);
  const [loading, setLoading] = useState(true);
  const [newlyEarned, setNewlyEarned] = useState<string[]>([]);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (!user) return;

    async function fetchAchievements() {
      try {
        // Check for new achievements first
        const checkRes = await fetch("/api/achievements", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: user!.id }),
        });
        const checkData: CheckResponse = await checkRes.json();
        if (checkData.newBadges?.length > 0) {
          setNewlyEarned(checkData.newBadges);
        }

        // Then fetch all badges
        const res = await fetch(`/api/achievements?user_id=${user!.id}`);
        const data: AchievementsResponse = await res.json();
        setBadges(data.badges);
        setTotalUnlocked(data.totalUnlocked);
        setTotalAvailable(data.totalAvailable);
      } catch {
        // Silent fail — badges are non-critical
      } finally {
        setLoading(false);
      }
    }

    fetchAchievements();
  }, [user]);

  // Can user earn this badge based on their tier?
  function canEarnAtTier(badgeTier: string): boolean {
    const tierRank: Record<string, number> = { free: 0, sharp: 1, vip: 2, admin: 3 };
    return (tierRank[tier] ?? 0) >= (tierRank[badgeTier] ?? 0);
  }

  const progressPercent = totalAvailable > 0 ? (totalUnlocked / totalAvailable) * 100 : 0;

  // Auth gate
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#0a0a0a" }}>
        <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: "rgba(255,255,255,0.15)", borderTopColor: "transparent" }} />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6" style={{ background: "#0a0a0a" }}>
        <div
          className="w-20 h-20 rounded-2xl flex items-center justify-center mb-6"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          <Lock size={32} style={{ color: "rgba(255,255,255,0.2)" }} />
        </div>
        <h2
          className="text-3xl mb-3"
          style={{ fontFamily: "'DM Serif Display', serif", color: "#ededed" }}
        >
          Sign in to view achievements
        </h2>
        <p className="text-sm mb-8" style={{ color: "rgba(255,255,255,0.4)" }}>
          Track your progress, earn badges, and unlock rewards.
        </p>
        <Link
          href="/login"
          className="px-8 py-3 text-sm font-semibold rounded-full transition-colors duration-200"
          style={{ background: "#FF3B3B", color: "#0a0a0a" }}
        >
          Sign In
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: "#0a0a0a" }}>
      {/* ─── Nav ─── */}
      <nav
        className="fixed top-0 left-0 right-0 z-50"
        style={{
          background: "rgba(10,10,10,0.85)",
          backdropFilter: "blur(20px)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <div className="max-w-[1400px] mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-10">
            <Link href="/" className="flex items-center">
              <Logo />
            </Link>
            <div className="hidden md:flex items-center gap-8">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-sm transition-colors duration-200"
                  style={{
                    color: link.href === "/achievements" ? "#FF3B3B" : "rgba(255,255,255,0.5)",
                    fontWeight: link.href === "/achievements" ? 600 : 400,
                  }}
                  onMouseEnter={(e) => {
                    if (link.href !== "/achievements") e.currentTarget.style.color = "rgba(255,255,255,0.9)";
                  }}
                  onMouseLeave={(e) => {
                    if (link.href !== "/achievements") e.currentTarget.style.color = "rgba(255,255,255,0.5)";
                  }}
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <NavUser />
            <button
              className="md:hidden flex items-center justify-center w-10 h-10 rounded-lg transition-colors duration-200"
              style={{ color: "rgba(255,255,255,0.7)" }}
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>

        {/* Mobile dropdown */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="md:hidden overflow-hidden"
              style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
            >
              <div className="px-6 py-4 flex flex-col gap-1">
                {NAV_LINKS.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className="py-3 px-4 rounded-lg text-sm font-medium transition-colors duration-150"
                    style={{
                      color: link.href === "/achievements" ? "#FF3B3B" : "rgba(255,255,255,0.6)",
                      background: link.href === "/achievements" ? "rgba(255,59,59,0.08)" : "transparent",
                    }}
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>

      {/* ─── New Badge Notification ─── */}
      <AnimatePresence>
        {newlyEarned.length > 0 && (
          <motion.div
            className="fixed top-24 left-1/2 z-[60]"
            initial={{ opacity: 0, y: -20, x: "-50%" }}
            animate={{ opacity: 1, y: 0, x: "-50%" }}
            exit={{ opacity: 0, y: -20, x: "-50%" }}
            transition={{ duration: 0.5 }}
          >
            <div
              className="px-6 py-4 rounded-2xl flex items-center gap-4"
              style={{
                background: "rgba(255,59,59,0.12)",
                border: "1px solid rgba(255,59,59,0.3)",
                backdropFilter: "blur(20px)",
                boxShadow: "0 8px 32px rgba(255,59,59,0.15)",
              }}
            >
              <span className="text-2xl">
                {badges.find((b) => b.id === newlyEarned[0])?.icon || "\uD83C\uDFC6"}
              </span>
              <div>
                <p className="text-sm font-semibold" style={{ color: "#ededed" }}>
                  {newlyEarned.length === 1
                    ? `Badge Unlocked: ${badges.find((b) => b.id === newlyEarned[0])?.name || "New Badge"}`
                    : `${newlyEarned.length} New Badges Unlocked!`}
                </p>
                <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.5)" }}>
                  Check your trophy case below
                </p>
              </div>
              <button
                onClick={() => setNewlyEarned([])}
                className="ml-2 p-1 rounded-lg transition-colors"
                style={{ color: "rgba(255,255,255,0.4)" }}
              >
                <X size={16} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Header ─── */}
      <header className="pt-28 pb-8 px-4 md:pt-36 md:pb-14 md:px-6">
        <div className="max-w-[1400px] mx-auto">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <h1
              className="text-5xl md:text-7xl font-normal leading-[1.05] mb-5"
              style={{ fontFamily: "'DM Serif Display', serif", color: "#ededed" }}
            >
              Achievements
            </h1>
            <p
              className="text-lg md:text-xl max-w-2xl"
              style={{ color: "rgba(255,255,255,0.45)", lineHeight: 1.6 }}
            >
              {totalUnlocked} / {totalAvailable} unlocked
            </p>

            {/* Progress bar */}
            <div className="mt-6 max-w-md">
              <div
                className="h-2 rounded-full overflow-hidden"
                style={{ background: "rgba(255,255,255,0.06)" }}
              >
                <motion.div
                  className="h-full rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${progressPercent}%` }}
                  transition={{ duration: 1, delay: 0.3, ease: "easeOut" }}
                  style={{
                    background: "linear-gradient(90deg, #FF3B3B, #FF5252)",
                    minWidth: totalUnlocked > 0 ? "8px" : "0px",
                  }}
                />
              </div>
              <p
                className="text-xs mt-2"
                style={{
                  color: "rgba(255,255,255,0.25)",
                  fontFamily: "var(--font-geist-mono)",
                }}
              >
                {progressPercent.toFixed(0)}% complete
              </p>
            </div>
          </motion.div>
        </div>
      </header>

      {/* ─── Main Content ─── */}
      <main className="px-4 pb-20 md:px-6 md:pb-32">
        <div className="max-w-[1400px] mx-auto">
          {loading ? (
            <BadgeSkeletons />
          ) : (
            <div className="space-y-16 md:space-y-24">
              {CATEGORIES.map((cat, catIdx) => {
                const categoryBadges = badges.filter((b) => b.category === cat.key);
                if (categoryBadges.length === 0) return null;

                return (
                  <motion.section
                    key={cat.key}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.2 + catIdx * 0.1 }}
                  >
                    <div className="mb-8">
                      <h2
                        className="text-2xl md:text-3xl mb-2"
                        style={{ fontFamily: "'DM Serif Display', serif", color: "#ededed" }}
                      >
                        {cat.label}
                      </h2>
                      <p className="text-sm" style={{ color: "rgba(255,255,255,0.3)" }}>
                        {cat.description}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
                      {categoryBadges.map((badge, idx) => {
                        const isUnlocked = badge.unlocked;
                        const canEarn = canEarnAtTier(badge.tier);
                        const isNewlyEarned = newlyEarned.includes(badge.id);

                        // Determine opacity and style
                        let opacity = 1;
                        let borderStyle = "1px solid rgba(255,255,255,0.06)";
                        let bgStyle = "rgba(255,255,255,0.025)";

                        if (isUnlocked) {
                          borderStyle = "1px solid rgba(255,59,59,0.2)";
                          bgStyle = "rgba(255,59,59,0.04)";
                        } else if (!canEarn) {
                          opacity = 0.2;
                        } else {
                          opacity = 0.5;
                        }

                        if (isNewlyEarned) {
                          borderStyle = "1px solid rgba(255,59,59,0.4)";
                          bgStyle = "rgba(255,59,59,0.08)";
                        }

                        return (
                          <motion.div
                            key={badge.id}
                            className="rounded-xl p-5 md:p-6 relative overflow-hidden transition-all duration-300"
                            style={{
                              background: bgStyle,
                              border: borderStyle,
                              opacity,
                            }}
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity, y: 0 }}
                            transition={{ duration: 0.4, delay: 0.3 + catIdx * 0.1 + idx * 0.05 }}
                            whileHover={isUnlocked ? {
                              borderColor: "rgba(255,59,59,0.35)",
                              transition: { duration: 0.2 },
                            } : undefined}
                          >
                            {/* Glow for unlocked */}
                            {isUnlocked && (
                              <div
                                className="absolute -top-10 -right-10 w-32 h-32 rounded-full"
                                style={{
                                  background: "radial-gradient(circle, rgba(255,59,59,0.08) 0%, transparent 70%)",
                                  pointerEvents: "none",
                                }}
                              />
                            )}

                            {/* Icon */}
                            <div
                              className="text-[40px] leading-none mb-4"
                              style={{
                                filter: isUnlocked ? "none" : "grayscale(100%)",
                              }}
                            >
                              {badge.icon}
                            </div>

                            {/* Name */}
                            <h3
                              className="text-sm md:text-base font-bold mb-1"
                              style={{ color: isUnlocked ? "#ededed" : "rgba(255,255,255,0.5)" }}
                            >
                              {badge.name}
                            </h3>

                            {/* Description */}
                            <p
                              className="text-xs leading-relaxed mb-3"
                              style={{ color: isUnlocked ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.25)" }}
                            >
                              {badge.description}
                            </p>

                            {/* Status */}
                            {isUnlocked ? (
                              <div className="flex items-center gap-1.5">
                                <div
                                  className="w-1.5 h-1.5 rounded-full"
                                  style={{ background: "#22c55e" }}
                                />
                                <span
                                  className="text-[10px] uppercase tracking-wider font-medium"
                                  style={{ color: "#22c55e" }}
                                >
                                  Unlocked
                                </span>
                                {badge.unlocked_at && (
                                  <span
                                    className="text-[10px] ml-1"
                                    style={{ color: "rgba(255,255,255,0.2)" }}
                                  >
                                    {formatUnlockedDate(badge.unlocked_at)}
                                  </span>
                                )}
                              </div>
                            ) : canEarn ? (
                              <span
                                className="text-[10px] uppercase tracking-wider font-medium"
                                style={{ color: "rgba(255,255,255,0.25)" }}
                              >
                                Keep going
                              </span>
                            ) : (
                              <span
                                className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full"
                                style={{
                                  color: tierColor(badge.tier).text,
                                  background: tierColor(badge.tier).bg,
                                  border: `1px solid ${tierColor(badge.tier).border}`,
                                }}
                              >
                                <Lock size={9} />
                                {tierLabel(badge.tier)}
                              </span>
                            )}
                          </motion.div>
                        );
                      })}
                    </div>
                  </motion.section>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {/* ─── Upgrade CTA for free users ─── */}
      {tier === "free" && (
        <section
          className="px-4 md:px-6 pb-20"
        >
          <div className="max-w-[1400px] mx-auto">
            <motion.div
              className="rounded-2xl p-8 md:p-12 text-center"
              style={{
                background: "linear-gradient(135deg, rgba(255,59,59,0.06) 0%, rgba(234,179,8,0.04) 100%)",
                border: "1px solid rgba(255,59,59,0.12)",
              }}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.8 }}
            >
              <p className="text-3xl mb-2" style={{ fontFamily: "'DM Serif Display', serif", color: "#ededed" }}>
                Unlock all badges
              </p>
              <p className="text-sm mb-6" style={{ color: "rgba(255,255,255,0.4)" }}>
                Upgrade to Sharp or VIP to access every achievement tier.
              </p>
              <Link
                href="/subscribe"
                className="inline-block px-8 py-3 text-sm font-semibold rounded-full transition-colors duration-200"
                style={{ background: "#FF3B3B", color: "#0a0a0a" }}
              >
                View Plans
              </Link>
            </motion.div>
          </div>
        </section>
      )}

      {/* ─── Footer ─── */}
      <footer className="px-6 py-12" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="max-w-[1400px] mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm" style={{ color: "rgba(255,255,255,0.25)" }}>
            BayParlays. AI-powered parlay optimization.
          </p>
          <p className="text-xs" style={{ color: "rgba(255,255,255,0.15)" }}>
            Not financial advice. Gamble responsibly.
          </p>
        </div>
      </footer>
    </div>
  );
}

/* ─── Skeletons ─── */

function BadgeSkeletons() {
  return (
    <div className="space-y-16">
      {[1, 2, 3, 4].map((section) => (
        <div key={section}>
          <div className="w-32 h-7 rounded mb-8 animate-pulse" style={{ background: "rgba(255,255,255,0.06)" }} />
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="rounded-xl p-5 md:p-6 animate-pulse"
                style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)" }}
              >
                <div className="w-10 h-10 rounded-lg mb-4" style={{ background: "rgba(255,255,255,0.06)" }} />
                <div className="w-20 h-4 rounded mb-2" style={{ background: "rgba(255,255,255,0.06)" }} />
                <div className="w-32 h-3 rounded mb-3" style={{ background: "rgba(255,255,255,0.04)" }} />
                <div className="w-16 h-3 rounded" style={{ background: "rgba(255,255,255,0.03)" }} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
