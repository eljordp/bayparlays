"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X } from "lucide-react";
import { Logo } from "@/app/components/Logo";
import { NavUser } from "@/app/components/NavUser";

// Single source of truth for primary navigation. Every page imports this
// instead of rolling its own inline nav — keeps spacing, hover states,
// mobile behavior, and link styling consistent site-wide.
//
// Sub-features like Odds / Builder / Props are accessed from within Picks
// via in-page tabs. Refer + Achievements live in Settings.

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/parlays", label: "Picks" },
  { href: "/simulator", label: "Simulator" },
  { href: "/results", label: "Results" },
  { href: "/my-stats", label: "My Stats" },
];

// Secondary routes that still exist but aren't in the primary nav.
// They count as "active" under their parent when highlighting.
const PARENT_MAP: Record<string, string> = {
  "/odds": "/parlays",
  "/builder": "/parlays",
  "/props": "/parlays",
  "/leaderboard": "/results",
  "/refer": "/settings",
  "/achievements": "/settings",
};

function isActive(linkHref: string, pathname: string | null): boolean {
  if (!pathname) return false;
  if (linkHref === "/") return pathname === "/";
  if (pathname === linkHref) return true;
  if (PARENT_MAP[pathname] === linkHref) return true;
  return false;
}

export function AppNav() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
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
            {NAV_LINKS.map((link) => {
              const active = isActive(link.href, pathname);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-sm transition-colors duration-200"
                  style={{
                    color: active ? "#FF3B3B" : "rgba(255,255,255,0.5)",
                    fontWeight: active ? 600 : 400,
                  }}
                  onMouseEnter={(e) => {
                    if (!active) e.currentTarget.style.color = "rgba(255,255,255,0.9)";
                  }}
                  onMouseLeave={(e) => {
                    if (!active) e.currentTarget.style.color = "rgba(255,255,255,0.5)";
                  }}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <NavUser />
          <button
            className="md:hidden flex items-center justify-center w-10 h-10 rounded-lg transition-colors duration-200"
            style={{ color: "rgba(255,255,255,0.7)" }}
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="md:hidden overflow-hidden"
            style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
          >
            <div className="px-6 py-4 flex flex-col gap-1">
              {NAV_LINKS.map((link) => {
                const active = isActive(link.href, pathname);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMobileOpen(false)}
                    className="py-3 px-4 rounded-lg text-sm font-medium transition-colors duration-150"
                    style={{
                      color: active ? "#FF3B3B" : "rgba(255,255,255,0.6)",
                      background: active ? "rgba(255,59,59,0.08)" : "transparent",
                    }}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
