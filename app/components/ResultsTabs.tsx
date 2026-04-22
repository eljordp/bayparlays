"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Sub-nav for the Results section. /results shows the AI's public track
// record. /leaderboard shows how users rank against each other. Same
// family of "how's anyone doing?" views — should share a tab bar.

const RESULTS_TABS = [
  { href: "/results", label: "AI Track Record" },
  { href: "/leaderboard", label: "Leaderboard" },
];

export function ResultsTabs() {
  const pathname = usePathname();
  return (
    <div
      className="border-b"
      style={{ borderColor: "rgba(255,255,255,0.06)" }}
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
                {tab.label}
                {active && (
                  <span
                    className="absolute left-0 right-0 bottom-0 h-0.5"
                    style={{ background: "#FF3B3B" }}
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
