"use client";

import Link from "next/link";
import { useAuth } from "./AuthProvider";
import { NotificationBell } from "./NotificationBell";

export function NavUser() {
  const { user, isPro, tier, signOut } = useAuth();

  const tierLabel: Record<string, string> = {
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
          className="text-xs text-white/40 hover:text-white transition-colors hidden sm:block"
          style={{ fontFamily: "var(--font-geist-mono)" }}
        >
          {truncatedEmail}
        </Link>
        {isPro && (
          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full ${
            tier === "admin" ? "bg-[#FF3B3B]/25 text-[#FF3B3B]" :
            tier === "vip" ? "bg-yellow-500/15 text-yellow-400" :
            "bg-[#FF3B3B]/15 text-[#FF3B3B]"
          }`}>
            {tierLabel[tier] || "PRO"}
          </span>
        )}
        <NotificationBell />
        <button
          onClick={signOut}
          className="text-xs text-white/40 hover:text-white transition-colors"
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
        className="text-xs sm:text-sm text-white/50 hover:text-white transition-colors"
      >
        Sign In
      </Link>
      <Link
        href="/subscribe"
        className="bg-[#FF3B3B] text-[#0a0a0a] px-5 py-2 text-xs sm:text-sm font-semibold rounded-full hover:bg-[#FF5252] transition-colors duration-200"
      >
        Start Free Trial
      </Link>
    </div>
  );
}
