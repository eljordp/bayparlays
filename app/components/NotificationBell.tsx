"use client";

import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/app/components/AuthProvider";
import Link from "next/link";

interface Notification {
  id: string;
  type: "potd" | "result" | "achievement" | "system";
  title: string;
  message: string;
  link?: string;
  read: boolean;
  created_at: string;
}

export function NotificationBell() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Generate notifications from current data (no database needed)
  useEffect(() => {
    if (!user) return;

    async function loadNotifications() {
      const notifs: Notification[] = [];

      // Check POTD
      try {
        const res = await fetch("/api/potd");
        if (res.ok) {
          const data = await res.json();
          if (data.potd) {
            notifs.push({
              id: "potd-today",
              type: "potd",
              title: "Parlay of the Day is live",
              message: `${data.potd.legs?.length || 3}-leg parlay at ${data.potd.combinedOdds || data.potd.combined_odds || "??"} odds`,
              link: "/parlays",
              read: false,
              created_at: new Date().toISOString(),
            });
          }
        }
      } catch {
        // silently fail
      }

      // Check track record for recent wins
      try {
        const res = await fetch("/api/track/results");
        if (res.ok) {
          const data = await res.json();
          const recentWins = data.recentParlays?.filter(
            (p: { status: string; created_at: string }) =>
              p.status === "won" &&
              Date.now() - new Date(p.created_at).getTime() < 86400000
          );
          if (recentWins?.length > 0) {
            notifs.push({
              id: "recent-win",
              type: "result",
              title: `${recentWins.length} parlay${recentWins.length > 1 ? "s" : ""} hit today`,
              message: "Check the track record for details",
              link: "/results",
              read: false,
              created_at: new Date().toISOString(),
            });
          }
        }
      } catch {
        // silently fail
      }

      // System notification
      notifs.push({
        id: "welcome",
        type: "system",
        title: "Welcome to BayParlays",
        message: "Check out today's AI picks and try the simulator",
        link: "/parlays",
        read: true,
        created_at: new Date().toISOString(),
      });

      setNotifications(notifs);
    }

    loadNotifications();
  }, [user]);

  if (!user) return null;

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => {
          setOpen(!open);
          // Mark all as read on open
          if (!open) setNotifications(prev => prev.map(n => ({ ...n, read: true })));
        }}
        className="relative p-2 text-white/40 hover:text-white transition-colors"
      >
        {/* Bell SVG */}
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {/* Red dot */}
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 w-2 h-2 bg-[#FF3B3B] rounded-full" />
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-[#111] border border-white/[0.08] rounded-xl shadow-2xl overflow-hidden z-50">
          <div className="px-4 py-3 border-b border-white/[0.06]">
            <span className="text-sm font-semibold text-white/80">Notifications</span>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-white/30 text-sm">No notifications</div>
            ) : (
              notifications.map(n => (
                <div key={n.id}>
                  {n.link ? (
                    <Link
                      href={n.link}
                      onClick={() => setOpen(false)}
                      className="block px-4 py-3 hover:bg-white/[0.03] transition-colors border-b border-white/[0.04]"
                    >
                      <div className="flex items-start gap-3">
                        <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                          n.type === "potd" ? "bg-[#FF3B3B]" :
                          n.type === "result" ? "bg-[#22C55E]" :
                          n.type === "achievement" ? "bg-yellow-400" :
                          "bg-white/20"
                        }`} />
                        <div>
                          <p className="text-sm font-medium text-white/80">{n.title}</p>
                          <p className="text-xs text-white/35 mt-0.5">{n.message}</p>
                        </div>
                      </div>
                    </Link>
                  ) : (
                    <div className="px-4 py-3 border-b border-white/[0.04]">
                      <div className="flex items-start gap-3">
                        <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0 bg-white/20" />
                        <div>
                          <p className="text-sm font-medium text-white/80">{n.title}</p>
                          <p className="text-xs text-white/35 mt-0.5">{n.message}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
