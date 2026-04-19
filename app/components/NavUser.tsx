"use client";

import Link from "next/link";
import { useAuth } from "./AuthProvider";

export function NavUser() {
  const { user, isPro, signOut } = useAuth();

  if (user) {
    return (
      <div className="flex items-center gap-3">
        {isPro && (
          <span className="text-[10px] font-bold uppercase tracking-wider bg-[#FF3B3B]/15 text-[#FF3B3B] px-2 py-1 rounded-full">
            PRO
          </span>
        )}
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
