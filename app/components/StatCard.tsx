"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Info } from "lucide-react";

export type StatTone = "good" | "bad" | "neutral" | "muted";

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: StatTone;
  sublabel?: string;
  tooltip?: string;
  delay?: number;
}

const TONE_COLOR: Record<StatTone, string> = {
  good: "#22c55e",
  bad: "#ef4444",
  neutral: "#0a0a0a",
  muted: "rgba(0,0,0,0.45)",
};

export function StatCard({
  icon,
  label,
  value,
  tone = "neutral",
  sublabel,
  tooltip,
  delay = 0,
}: StatCardProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Close tooltip on outside click — important for the mobile tap-to-open path,
  // since hover doesn't exist on touch and we still want users to be able
  // to dismiss without a second tap on the icon.
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <motion.div
      className="relative rounded-xl p-5 md:p-6"
      style={{ background: "#FFFFFF", border: "1px solid rgba(0,0,0,0.06)" }}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.15 + delay }}
    >
      <div className="flex items-center gap-2 mb-4">
        <div style={{ color: "rgba(0,0,0,0.4)" }}>{icon}</div>
        <span
          className="text-xs uppercase tracking-wider font-medium"
          style={{ color: "rgba(0,0,0,0.45)" }}
        >
          {label}
        </span>
        {tooltip && (
          <div ref={wrapRef} className="relative ml-auto">
            <button
              type="button"
              onMouseEnter={() => setOpen(true)}
              onMouseLeave={() => setOpen(false)}
              onClick={(e) => {
                e.stopPropagation();
                setOpen((o) => !o);
              }}
              className="flex items-center justify-center w-5 h-5 rounded-full transition-colors"
              style={{
                color: "rgba(0,0,0,0.4)",
                background: open ? "rgba(0,0,0,0.06)" : "transparent",
              }}
              aria-label={`What is ${label}?`}
            >
              <Info size={12} />
            </button>
            <AnimatePresence>
              {open && (
                <motion.div
                  initial={{ opacity: 0, y: -4, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.97 }}
                  transition={{ duration: 0.14 }}
                  className="absolute right-0 top-7 z-30 w-64 rounded-lg p-3 text-xs leading-relaxed"
                  style={{
                    background: "#0a0a0a",
                    color: "rgba(255,255,255,0.92)",
                    boxShadow: "0 12px 28px rgba(0,0,0,0.18)",
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {tooltip}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
      <div
        className="text-3xl md:text-4xl font-bold tracking-tight"
        style={{ color: TONE_COLOR[tone], fontFamily: "var(--font-geist-mono)" }}
      >
        {value}
      </div>
      {sublabel && (
        <div className="text-xs mt-2" style={{ color: "rgba(0,0,0,0.45)" }}>
          {sublabel}
        </div>
      )}
    </motion.div>
  );
}

export function StatCardSkeleton() {
  return (
    <div
      className="rounded-xl p-5 md:p-6 animate-pulse"
      style={{ background: "#FFFFFF", border: "1px solid rgba(0,0,0,0.06)" }}
    >
      <div className="w-20 h-3 rounded mb-4" style={{ background: "rgba(0,0,0,0.06)" }} />
      <div className="w-24 h-9 rounded mb-2" style={{ background: "rgba(0,0,0,0.08)" }} />
      <div className="w-16 h-3 rounded" style={{ background: "rgba(0,0,0,0.04)" }} />
    </div>
  );
}
