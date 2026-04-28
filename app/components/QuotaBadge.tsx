"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "./AuthProvider";

interface Quota {
  remaining: number;
  used: number;
  total: number;
  status: "healthy" | "warning" | "critical" | "exhausted";
  keyTail: string;
}

// Live Odds API quota indicator. Shown only to owner/admin so paying users
// don't see plumbing noise. Polls /api/admin/quota every 5 minutes —
// hitting that endpoint costs 0 credits since it probes /sports.

export function QuotaBadge() {
  const { isOwner } = useAuth();
  const [quota, setQuota] = useState<Quota | null>(null);

  const fetchQuota = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/quota", { cache: "no-store" });
      if (res.ok) setQuota(await res.json());
    } catch {
      /* silent — don't break the nav */
    }
  }, []);

  useEffect(() => {
    if (!(isOwner)) return;
    fetchQuota();
    const id = setInterval(fetchQuota, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [isOwner, fetchQuota]);

  if (!(isOwner) || !quota) return null;

  const colorByStatus: Record<Quota["status"], { bg: string; fg: string; ring: string }> = {
    healthy: { bg: "rgba(34,197,94,0.12)", fg: "#16a34a", ring: "rgba(34,197,94,0.35)" },
    warning: { bg: "rgba(234,179,8,0.15)", fg: "#ca8a04", ring: "rgba(234,179,8,0.4)" },
    critical: { bg: "rgba(255,59,59,0.15)", fg: "#FF3B3B", ring: "rgba(255,59,59,0.45)" },
    exhausted: { bg: "rgba(220,38,38,0.20)", fg: "#dc2626", ring: "rgba(220,38,38,0.55)" },
  };
  const c = colorByStatus[quota.status];
  const labelByStatus: Record<Quota["status"], string> = {
    healthy: "API",
    warning: "API LOW",
    critical: "API CRIT",
    exhausted: "API DEAD",
  };

  return (
    <button
      onClick={fetchQuota}
      title={`Odds API · ${quota.used}/${quota.total} used · key …${quota.keyTail} · click to refresh`}
      className="hidden sm:inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full transition-all"
      style={{
        background: c.bg,
        color: c.fg,
        boxShadow: `inset 0 0 0 1px ${c.ring}`,
      }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{
          background: c.fg,
          animation: quota.status === "critical" || quota.status === "exhausted" ? "pulse 1.5s ease-in-out infinite" : "none",
        }}
      />
      {labelByStatus[quota.status]} {quota.remaining}
    </button>
  );
}
