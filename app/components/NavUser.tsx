"use client";

import Link from "next/link";
import { useAuth } from "./AuthProvider";
import { NotificationBell } from "./NotificationBell";
import { QuotaBadge } from "./QuotaBadge";

export function NavUser() {
  const { user, isPro, tier, signOut } = useAuth();

  const tierLabel: Record<string, string> = {
    owner: "OWNER",
    admin: "ADMIN",
    vip: "VIP",
    sharp: "SHARP",
    enterprise: "ENT",
  };

  if (user) {
    const truncatedEmail = user.email
      ? user.email.length > 10
        ? user.email.slice(0, 10) + "..."
        : user.email
      : "";

    return (
      <div className="flex items-center gap-3">
        <Link
          href="/settings"
          className="text-xs text-black/45 hover:text-black transition-colors hidden sm:block"
          style={{ fontFamily: "var(--font-geist-mono)" }}
        >
          {truncatedEmail}
        </Link>
        {isPro && (
          tier === "owner" ? (
            <Link
              href="/admin"
              title="Open owner controls"
              className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full bg-[#FF3B3B]/15 text-[#FF3B3B] ring-1 ring-[#FF3B3B]/30 hover:bg-[#FF3B3B]/25 transition-colors"
            >
              {tierLabel[tier] || "OWNER"}
            </Link>
          ) : (
            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full ${
              tier === "admin" ? "bg-black/[0.10] text-[#0a0a0a]" :
              tier === "vip" ? "bg-yellow-500/15 text-yellow-400" :
              "bg-black/[0.08] text-[#0a0a0a]"
            }`}>
              {tierLabel[tier] || "PRO"}
            </span>
          )
        )}
        <QuotaBadge />
        <NotificationBell />
        <button
          onClick={signOut}
          className="text-xs text-black/45 hover:text-black transition-colors"
        >
          Sign Out
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <Link
        href="/login"
        className="text-xs sm:text-sm text-black/55 hover:text-black transition-colors"
      >
        Sign In
      </Link>
      <Link
        href="/subscribe"
        className="bg-[#0a0a0a] text-[#FAFAF7] px-5 py-2 text-xs sm:text-sm font-semibold rounded-full hover:bg-[#1a1a1a] transition-colors duration-200"
      >
        Start Free Trial
      </Link>
    </div>
  );
}
