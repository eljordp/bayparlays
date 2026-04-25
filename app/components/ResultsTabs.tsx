"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Sub-nav for the Results section. /results shows the AI's public track
// record. /leaderboard shows how users rank against each other. Same
// family of "how's anyone doing?" views — share a tab bar.
// Light-theme: black underline + bold weight for active state.

const RESULTS_TABS = [
  { href: "/results", label: "AI Track Record" },
  { href: "/my-stats", label: "My Stats" },
  { href: "/leaderboard", label: "Leaderboard" },
];

export function ResultsTabs() {
  const pathname = usePathname();
  return (
    <div
      className="border-b"
      style={{ borderColor: "rgba(0,0,0,0.06)", background: "#FAFAF7" }}
    >
      <div className="max-w-[1400px] mx-auto px-6">
        <div className="flex overflow-x-auto scrollbar-hide gap-1">
          {RESULTS_TABS.map((tab) => {
            const active = pathname === tab.href;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className="relative px-4 py-4 text-sm transition-colors whitespace-nowrap"
                style={{
                  color: active ? "#0a0a0a" : "rgba(0,0,0,0.45)",
                  fontWeight: active ? 700 : 500,
                }}
                onMouseEnter={(e) => {
                  if (!active) e.currentTarget.style.color = "rgba(0,0,0,0.85)";
                }}
                onMouseLeave={(e) => {
                  if (!active) e.currentTarget.style.color = "rgba(0,0,0,0.45)";
                }}
              >
                {tab.label}
                {active && (
                  <span
                    className="absolute left-0 right-0 bottom-0 h-0.5"
                    style={{ background: "#0a0a0a" }}
                  />
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
