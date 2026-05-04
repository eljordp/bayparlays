"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/app/components/AuthProvider";
import { Logo } from "@/app/components/Logo";
import { supabase } from "@/lib/supabase";
import {
  Users,
  Share2,
  DollarSign,
  BarChart3,
  Shield,
  ArrowLeft,
  Mail,
} from "lucide-react";

/* ─── Types ─── */

interface UserRow {
  id: string;
  email: string;
  subscription_status: string | null;
  subscription_tier: string | null;
  stripe_customer_id: string | null;
  created_at: string;
  referred_by: string | null;
}

interface ReferralRow {
  id: string;
  referrer_name: string;
  code: string;
  clicks: number;
  signups: number;
  created_at: string;
}

interface EmailCaptureRow {
  id: string;
  email: string;
  created_at: string;
}

interface ParlayStats {
  totalParlays: number;
  winRate: number;
  profit: number;
  roi: number;
}

/* ─── Admin Page ─── */

export default function AdminPage() {
  const { user, isAdmin, isOwner, loading: authLoading } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [referrals, setReferrals] = useState<ReferralRow[]>([]);
  const [emailCaptures, setEmailCaptures] = useState<EmailCaptureRow[]>([]);
  const [parlayStats, setParlayStats] = useState<ParlayStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    fetchData();
  }, [isAdmin]);

  async function fetchData() {
    setLoading(true);

    const [usersRes, referralsRes, statsRes, emailRes] = await Promise.allSettled([
      supabase
        .from("users")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase
        .from("referrals")
        .select("*")
        .order("signups", { ascending: false }),
      fetch("/api/track/results").then((r) =>
        r.ok ? r.json() : null
      ),
      supabase
        .from("email_captures")
        .select("*")
        .order("created_at", { ascending: false }),
    ]);

    if (usersRes.status === "fulfilled" && usersRes.value.data) {
      setUsers(usersRes.value.data);
    }
    if (referralsRes.status === "fulfilled" && referralsRes.value.data) {
      setReferrals(referralsRes.value.data);
    }
    if (statsRes.status === "fulfilled" && statsRes.value) {
      // The /api/track/results endpoint nests under `stats` —
      // admin page used to read it flat which is why win rate / profit / ROI
      // had been showing "undefined".
      const payload = statsRes.value.stats ?? statsRes.value;
      setParlayStats(payload);
    }
    if (emailRes.status === "fulfilled" && emailRes.value.data) {
      setEmailCaptures(emailRes.value.data);
    }

    setLoading(false);
  }

  async function updateUser(
    userId: string,
    updates: { subscription_tier: string; subscription_status: string }
  ) {
    setActionLoading(userId);
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, ...updates }),
    });

    if (res.ok) {
      setUsers((prev) =>
        prev.map((u) =>
          u.id === userId
            ? { ...u, subscription_tier: updates.subscription_tier, subscription_status: updates.subscription_status }
            : u
        )
      );
    }
    setActionLoading(null);
  }

  // Auth loading
  if (authLoading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "#0a0a0a" }}
      >
        <div
          className="w-8 h-8 rounded-full border-2 animate-spin"
          style={{
            borderColor: "rgba(255,59,59,0.2)",
            borderTopColor: "#FF3B3B",
          }}
        />
      </div>
    );
  }

  // Access denied
  if (!isAdmin) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center gap-6"
        style={{ background: "#0a0a0a" }}
      >
        <div
          className="w-20 h-20 rounded-2xl flex items-center justify-center"
          style={{
            background: "rgba(255,59,59,0.08)",
            border: "1px solid rgba(255,59,59,0.15)",
          }}
        >
          <Shield size={32} style={{ color: "#FF3B3B" }} />
        </div>
        <h1
          className="text-2xl font-semibold"
          style={{ color: "#ededed" }}
        >
          Access Denied
        </h1>
        <p style={{ color: "rgba(255,255,255,0.4)" }}>
          You don&apos;t have permission to view this page.
        </p>
        <Link
          href="/login"
          className="mt-2 px-6 py-3 rounded-full text-sm font-semibold transition-all duration-200"
          style={{
            background: "#FF3B3B",
            color: "#0a0a0a",
          }}
        >
          Sign In
        </Link>
      </div>
    );
  }

  // Stats
  const activeSharp = users.filter(
    (u) => u.subscription_tier === "sharp" && u.subscription_status === "active"
  ).length;
  const activeVip = users.filter(
    (u) => u.subscription_tier === "vip" && u.subscription_status === "active"
  ).length;
  const totalReferralClicks = referrals.reduce((sum, r) => sum + (r.clicks || 0), 0);
  const totalReferralSignups = referrals.reduce((sum, r) => sum + (r.signups || 0), 0);

  return (
    <div className="min-h-screen" style={{ background: "#0a0a0a" }}>
      {/* ─── Nav ─── */}
      <nav
        className="fixed top-0 left-0 right-0 z-50"
        style={{
          background: "rgba(10,10,10,0.9)",
          backdropFilter: "blur(20px)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <div className="max-w-[1400px] mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center">
              <Logo />
            </Link>
            <div
              className="h-5 w-px"
              style={{ background: "rgba(255,255,255,0.1)" }}
            />
            <span
              className="text-xs font-semibold uppercase tracking-widest"
              style={{ color: "#FF3B3B" }}
            >
              Admin
            </span>
          </div>
          <Link
            href="/"
            className="flex items-center gap-2 text-sm transition-colors duration-200"
            style={{ color: "rgba(255,255,255,0.4)" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "rgba(255,255,255,0.8)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "rgba(255,255,255,0.4)";
            }}
          >
            <ArrowLeft size={14} />
            Back to site
          </Link>
        </div>
      </nav>

      {/* ─── Content ─── */}
      <main className="pt-28 pb-20 px-4 md:px-6">
        <div className="max-w-[1400px] mx-auto">
          <h1
            className="text-4xl md:text-5xl mb-3"
            style={{
              fontFamily: "'DM Serif Display', serif",
              color: "#ededed",
            }}
          >
            Admin Panel
          </h1>
          <p className="text-sm mb-14" style={{ color: "rgba(255,255,255,0.35)" }}>
            Signed in as {user?.email}
          </p>

          {loading ? (
            <div className="flex items-center justify-center py-32">
              <div
                className="w-8 h-8 rounded-full border-2 animate-spin"
                style={{
                  borderColor: "rgba(255,59,59,0.2)",
                  borderTopColor: "#FF3B3B",
                }}
              />
            </div>
          ) : (
            <div className="space-y-16">
              {/* ─── Owner-only Tools (hidden from admin mods) ─── */}
              {isOwner && (
                <section>
                  <div className="flex items-center gap-3 mb-6">
                    <Shield size={18} style={{ color: "#FF3B3B" }} />
                    <h2
                      className="text-xl font-semibold"
                      style={{ color: "#ededed" }}
                    >
                      Owner Tools
                    </h2>
                    <span
                      className="text-[10px] uppercase tracking-widest font-bold px-2 py-1 rounded-full"
                      style={{
                        background: "rgba(255,59,59,0.15)",
                        color: "#FF3B3B",
                        boxShadow: "inset 0 0 0 1px rgba(255,59,59,0.35)",
                      }}
                    >
                      Owner Only
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Link
                      href="/admin/keys"
                      className="block p-5 rounded-xl transition-all"
                      style={{
                        background: "rgba(255,255,255,0.03)",
                        border: "1px solid rgba(255,255,255,0.08)",
                      }}
                    >
                      <div className="text-base font-semibold mb-1" style={{ color: "#ededed" }}>
                        Rotate Odds API Key →
                      </div>
                      <p className="text-xs" style={{ color: "rgba(255,255,255,0.45)" }}>
                        Paste a fresh key when the daily quota burns. Validates + activates without a redeploy. Use this every morning when you grab a new key.
                      </p>
                    </Link>
                    <a
                      href="/api/admin/quota"
                      target="_blank"
                      rel="noreferrer"
                      className="block p-5 rounded-xl transition-all"
                      style={{
                        background: "rgba(255,255,255,0.03)",
                        border: "1px solid rgba(255,255,255,0.08)",
                      }}
                    >
                      <div className="text-base font-semibold mb-1" style={{ color: "#ededed" }}>
                        Quota Status (raw) →
                      </div>
                      <p className="text-xs" style={{ color: "rgba(255,255,255,0.45)" }}>
                        Live JSON of Odds API quota. Same data as the nav badge.
                      </p>
                    </a>
                    <Link
                      href="/postmortem"
                      className="block p-5 rounded-xl transition-all"
                      style={{
                        background: "rgba(255,255,255,0.03)",
                        border: "1px solid rgba(255,255,255,0.08)",
                      }}
                    >
                      <div className="text-base font-semibold mb-1" style={{ color: "#ededed" }}>
                        Postmortem →
                      </div>
                      <p className="text-xs" style={{ color: "rgba(255,255,255,0.45)" }}>
                        What hit, what didn&apos;t. Per-team, per-sport, per-market breakdowns. Auto-generated tweak recommendations.
                      </p>
                    </Link>
                    <Link
                      href="/admin/verify-slate"
                      className="block p-5 rounded-xl transition-all"
                      style={{
                        background: "rgba(255,255,255,0.03)",
                        border: "1px solid rgba(255,255,255,0.08)",
                      }}
                    >
                      <div className="text-base font-semibold mb-1" style={{ color: "#ededed" }}>
                        Verify Slate (Manual) →
                      </div>
                      <p className="text-xs" style={{ color: "rgba(255,255,255,0.45)" }}>
                        Copy the active slate as a Claude prompt, get verdicts back, apply them. Picks marked &quot;skip&quot; archive instantly.
                      </p>
                    </Link>
                    <Link
                      href="/admin/calibration"
                      className="block p-5 rounded-xl transition-all"
                      style={{
                        background: "rgba(255,255,255,0.03)",
                        border: "1px solid rgba(255,255,255,0.08)",
                      }}
                    >
                      <div className="text-base font-semibold mb-1" style={{ color: "#ededed" }}>
                        Model Calibration →
                      </div>
                      <p className="text-xs" style={{ color: "rgba(255,255,255,0.45)" }}>
                        What the AI has learned per (sport × market × odds bucket). Boosts and penalties applied to live picks. Recompute on demand.
                      </p>
                    </Link>
                  </div>
                </section>
              )}

              {/* ─── Revenue Summary ─── */}
              <section>
                <div className="flex items-center gap-3 mb-8">
                  <DollarSign size={18} style={{ color: "#FF3B3B" }} />
                  <h2
                    className="text-xl font-semibold"
                    style={{ color: "#ededed" }}
                  >
                    Revenue Summary
                  </h2>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { label: "Total Users", value: users.length },
                    { label: "Sharp Subs", value: activeSharp },
                    { label: "VIP Subs", value: activeVip },
                    {
                      label: "Referral Clicks",
                      value: totalReferralClicks,
                    },
                  ].map((stat) => (
                    <div
                      key={stat.label}
                      className="rounded-xl p-5"
                      style={{
                        background: "rgba(255,255,255,0.025)",
                        border: "1px solid rgba(255,255,255,0.06)",
                      }}
                    >
                      <div
                        className="text-xs uppercase tracking-wider mb-2"
                        style={{ color: "rgba(255,255,255,0.35)" }}
                      >
                        {stat.label}
                      </div>
                      <div
                        className="text-3xl font-bold"
                        style={{
                          color: "#ededed",
                          fontFamily: "'Geist Mono', monospace",
                        }}
                      >
                        {stat.value}
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* ─── Parlay Stats ─── */}
              {parlayStats && (
                <section>
                  <div className="flex items-center gap-3 mb-8">
                    <BarChart3 size={18} style={{ color: "#FF3B3B" }} />
                    <h2
                      className="text-xl font-semibold"
                      style={{ color: "#ededed" }}
                    >
                      Parlay Performance
                    </h2>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                      {
                        label: "Total Parlays",
                        value: parlayStats.totalParlays,
                      },
                      {
                        label: "Win Rate",
                        value: `${parlayStats.winRate}%`,
                      },
                      {
                        label: "Profit",
                        value: `$${parlayStats.profit}`,
                      },
                      { label: "ROI", value: `${parlayStats.roi}%` },
                    ].map((stat) => (
                      <div
                        key={stat.label}
                        className="rounded-xl p-5"
                        style={{
                          background: "rgba(255,255,255,0.025)",
                          border: "1px solid rgba(255,255,255,0.06)",
                        }}
                      >
                        <div
                          className="text-xs uppercase tracking-wider mb-2"
                          style={{ color: "rgba(255,255,255,0.35)" }}
                        >
                          {stat.label}
                        </div>
                        <div
                          className="text-3xl font-bold"
                          style={{
                            color: "#FF3B3B",
                            fontFamily: "'Geist Mono', monospace",
                          }}
                        >
                          {stat.value}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* ─── Users ─── */}
              <section>
                <div className="flex items-center gap-3 mb-8">
                  <Users size={18} style={{ color: "#FF3B3B" }} />
                  <h2
                    className="text-xl font-semibold"
                    style={{ color: "#ededed" }}
                  >
                    Users
                  </h2>
                  <span
                    className="text-xs px-2 py-1 rounded-full"
                    style={{
                      background: "rgba(255,59,59,0.1)",
                      color: "#FF3B3B",
                    }}
                  >
                    {users.length}
                  </span>
                </div>

                <div
                  className="rounded-xl overflow-hidden"
                  style={{
                    border: "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[800px]">
                      <thead>
                        <tr
                          style={{
                            borderBottom:
                              "1px solid rgba(255,255,255,0.06)",
                          }}
                        >
                          {[
                            "Email",
                            "Status",
                            "Tier",
                            "Stripe ID",
                            "Joined",
                            "Actions",
                          ].map((h) => (
                            <th
                              key={h}
                              className="text-left px-5 py-4 text-xs font-semibold uppercase tracking-wider"
                              style={{
                                color: "rgba(255,255,255,0.35)",
                                background: "rgba(255,255,255,0.02)",
                              }}
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {users.map((u) => (
                          <tr
                            key={u.id}
                            className="transition-colors duration-150"
                            style={{
                              borderBottom:
                                "1px solid rgba(255,255,255,0.04)",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background =
                                "rgba(255,255,255,0.02)";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background =
                                "transparent";
                            }}
                          >
                            <td
                              className="px-5 py-4 text-sm"
                              style={{
                                color: "#ededed",
                                fontFamily:
                                  "'Geist Mono', monospace",
                                fontSize: "13px",
                              }}
                            >
                              {u.email}
                            </td>
                            <td className="px-5 py-4">
                              <StatusBadge
                                status={
                                  u.subscription_status || "none"
                                }
                              />
                            </td>
                            <td className="px-5 py-4">
                              <TierBadge
                                tier={
                                  u.subscription_tier || "free"
                                }
                              />
                            </td>
                            <td
                              className="px-5 py-4 text-xs"
                              style={{
                                color: "rgba(255,255,255,0.3)",
                                fontFamily:
                                  "'Geist Mono', monospace",
                              }}
                            >
                              {u.stripe_customer_id || "---"}
                            </td>
                            <td
                              className="px-5 py-4 text-xs"
                              style={{
                                color: "rgba(255,255,255,0.35)",
                                fontFamily:
                                  "'Geist Mono', monospace",
                              }}
                            >
                              {new Date(
                                u.created_at
                              ).toLocaleDateString()}
                            </td>
                            <td className="px-5 py-4">
                              {u.subscription_tier === "owner" ? (
                                <span
                                  className="text-[11px] uppercase tracking-wider"
                                  style={{ color: "rgba(234,179,8,0.7)" }}
                                >
                                  Locked — owner
                                </span>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <ActionButton
                                    label="Admin"
                                    loading={actionLoading === u.id}
                                    active={u.subscription_tier === "admin"}
                                    onClick={() =>
                                      updateUser(u.id, {
                                        subscription_tier: "admin",
                                        subscription_status: "active",
                                      })
                                    }
                                  />
                                  <ActionButton
                                    label="Sharp"
                                    loading={actionLoading === u.id}
                                    active={u.subscription_tier === "sharp"}
                                    onClick={() =>
                                      updateUser(u.id, {
                                        subscription_tier: "sharp",
                                        subscription_status: "active",
                                      })
                                    }
                                  />
                                  <ActionButton
                                    label="VIP"
                                    loading={actionLoading === u.id}
                                    active={u.subscription_tier === "vip"}
                                    onClick={() =>
                                      updateUser(u.id, {
                                        subscription_tier: "vip",
                                        subscription_status: "active",
                                      })
                                    }
                                  />
                                  <ActionButton
                                    label="Revoke"
                                    loading={actionLoading === u.id}
                                    destructive
                                    onClick={() =>
                                      updateUser(u.id, {
                                        subscription_tier: "free",
                                        subscription_status: "none",
                                      })
                                    }
                                  />
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                        {users.length === 0 && (
                          <tr>
                            <td
                              colSpan={6}
                              className="px-5 py-12 text-center text-sm"
                              style={{
                                color: "rgba(255,255,255,0.3)",
                              }}
                            >
                              No users yet.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>

              {/* ─── Referrals ─── */}
              <section>
                <div className="flex items-center gap-3 mb-8">
                  <Share2 size={18} style={{ color: "#FF3B3B" }} />
                  <h2
                    className="text-xl font-semibold"
                    style={{ color: "#ededed" }}
                  >
                    Referrals
                  </h2>
                  <span
                    className="text-xs px-2 py-1 rounded-full"
                    style={{
                      background: "rgba(255,59,59,0.1)",
                      color: "#FF3B3B",
                    }}
                  >
                    {referrals.length}
                  </span>
                </div>

                <div
                  className="rounded-xl overflow-hidden"
                  style={{
                    border: "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[600px]">
                      <thead>
                        <tr
                          style={{
                            borderBottom:
                              "1px solid rgba(255,255,255,0.06)",
                          }}
                        >
                          {[
                            "Referrer",
                            "Code",
                            "Clicks",
                            "Signups",
                            "Created",
                          ].map((h) => (
                            <th
                              key={h}
                              className="text-left px-5 py-4 text-xs font-semibold uppercase tracking-wider"
                              style={{
                                color: "rgba(255,255,255,0.35)",
                                background:
                                  "rgba(255,255,255,0.02)",
                              }}
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {referrals.map((r, idx) => (
                          <tr
                            key={r.id}
                            className="transition-colors duration-150"
                            style={{
                              borderBottom:
                                "1px solid rgba(255,255,255,0.04)",
                              background:
                                idx === 0 && r.signups > 0
                                  ? "rgba(255,59,59,0.03)"
                                  : "transparent",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background =
                                "rgba(255,255,255,0.02)";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background =
                                idx === 0 && r.signups > 0
                                  ? "rgba(255,59,59,0.03)"
                                  : "transparent";
                            }}
                          >
                            <td
                              className="px-5 py-4 text-sm font-medium"
                              style={{ color: "#ededed" }}
                            >
                              {r.referrer_name}
                              {idx === 0 && r.signups > 0 && (
                                <span
                                  className="ml-2 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                                  style={{
                                    background:
                                      "rgba(255,59,59,0.15)",
                                    color: "#FF3B3B",
                                  }}
                                >
                                  Top
                                </span>
                              )}
                            </td>
                            <td
                              className="px-5 py-4 text-sm"
                              style={{
                                color: "rgba(255,255,255,0.5)",
                                fontFamily:
                                  "'Geist Mono', monospace",
                              }}
                            >
                              {r.code}
                            </td>
                            <td
                              className="px-5 py-4 text-sm font-semibold"
                              style={{
                                color: "#ededed",
                                fontFamily:
                                  "'Geist Mono', monospace",
                              }}
                            >
                              {r.clicks}
                            </td>
                            <td
                              className="px-5 py-4 text-sm font-semibold"
                              style={{
                                color: r.signups > 0 ? "#FF3B3B" : "rgba(255,255,255,0.4)",
                                fontFamily:
                                  "'Geist Mono', monospace",
                              }}
                            >
                              {r.signups}
                            </td>
                            <td
                              className="px-5 py-4 text-xs"
                              style={{
                                color: "rgba(255,255,255,0.35)",
                                fontFamily:
                                  "'Geist Mono', monospace",
                              }}
                            >
                              {new Date(
                                r.created_at
                              ).toLocaleDateString()}
                            </td>
                          </tr>
                        ))}
                        {referrals.length === 0 && (
                          <tr>
                            <td
                              colSpan={5}
                              className="px-5 py-12 text-center text-sm"
                              style={{
                                color: "rgba(255,255,255,0.3)",
                              }}
                            >
                              No referrals yet.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Referral totals */}
                <div className="flex items-center gap-8 mt-4 px-2">
                  <span
                    className="text-xs"
                    style={{ color: "rgba(255,255,255,0.3)" }}
                  >
                    Total clicks:{" "}
                    <span
                      style={{
                        color: "#ededed",
                        fontFamily: "'Geist Mono', monospace",
                      }}
                    >
                      {totalReferralClicks}
                    </span>
                  </span>
                  <span
                    className="text-xs"
                    style={{ color: "rgba(255,255,255,0.3)" }}
                  >
                    Total signups:{" "}
                    <span
                      style={{
                        color: "#FF3B3B",
                        fontFamily: "'Geist Mono', monospace",
                      }}
                    >
                      {totalReferralSignups}
                    </span>
                  </span>
                </div>
              </section>

              {/* ─── Email Captures ─── */}
              <section>
                <div className="flex items-center gap-3 mb-8">
                  <Mail size={18} style={{ color: "#FF3B3B" }} />
                  <h2
                    className="text-xl font-semibold"
                    style={{ color: "#ededed" }}
                  >
                    Email Captures
                  </h2>
                  <span
                    className="text-xs px-2 py-1 rounded-full"
                    style={{
                      background: "rgba(255,59,59,0.1)",
                      color: "#FF3B3B",
                    }}
                  >
                    {emailCaptures.length}
                  </span>
                </div>

                <div
                  className="rounded-xl overflow-hidden"
                  style={{
                    border: "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[400px]">
                      <thead>
                        <tr
                          style={{
                            borderBottom:
                              "1px solid rgba(255,255,255,0.06)",
                          }}
                        >
                          {["Email", "Captured"].map((h) => (
                            <th
                              key={h}
                              className="text-left px-5 py-4 text-xs font-semibold uppercase tracking-wider"
                              style={{
                                color: "rgba(255,255,255,0.35)",
                                background:
                                  "rgba(255,255,255,0.02)",
                              }}
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {emailCaptures.map((ec) => (
                          <tr
                            key={ec.id}
                            className="transition-colors duration-150"
                            style={{
                              borderBottom:
                                "1px solid rgba(255,255,255,0.04)",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background =
                                "rgba(255,255,255,0.02)";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background =
                                "transparent";
                            }}
                          >
                            <td
                              className="px-5 py-4 text-sm"
                              style={{
                                color: "#ededed",
                                fontFamily:
                                  "'Geist Mono', monospace",
                                fontSize: "13px",
                              }}
                            >
                              {ec.email}
                            </td>
                            <td
                              className="px-5 py-4 text-xs"
                              style={{
                                color: "rgba(255,255,255,0.35)",
                                fontFamily:
                                  "'Geist Mono', monospace",
                              }}
                            >
                              {new Date(
                                ec.created_at
                              ).toLocaleDateString()}
                            </td>
                          </tr>
                        ))}
                        {emailCaptures.length === 0 && (
                          <tr>
                            <td
                              colSpan={2}
                              className="px-5 py-12 text-center text-sm"
                              style={{
                                color: "rgba(255,255,255,0.3)",
                              }}
                            >
                              No email captures yet.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

/* ─── Sub-components ─── */

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, { bg: string; color: string }> = {
    active: { bg: "rgba(34,197,94,0.12)", color: "#22c55e" },
    trialing: { bg: "rgba(59,130,246,0.12)", color: "#3b82f6" },
    canceled: { bg: "rgba(239,68,68,0.12)", color: "#ef4444" },
    past_due: { bg: "rgba(245,158,11,0.12)", color: "#f59e0b" },
    none: { bg: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.3)" },
  };

  const c = colors[status] || colors.none;

  return (
    <span
      className="text-[11px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full"
      style={{ background: c.bg, color: c.color }}
    >
      {status}
    </span>
  );
}

function TierBadge({ tier }: { tier: string }) {
  const colors: Record<string, { bg: string; color: string }> = {
    owner: { bg: "rgba(234,179,8,0.18)", color: "#eab308" },
    admin: { bg: "rgba(255,59,59,0.15)", color: "#FF3B3B" },
    vip: { bg: "rgba(168,85,247,0.12)", color: "#a855f7" },
    sharp: { bg: "rgba(59,130,246,0.12)", color: "#3b82f6" },
    free: { bg: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.3)" },
  };

  const c = colors[tier] || colors.free;

  return (
    <span
      className="text-[11px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full"
      style={{ background: c.bg, color: c.color }}
    >
      {tier}
    </span>
  );
}

function ActionButton({
  label,
  loading,
  active,
  destructive,
  onClick,
}: {
  label: string;
  loading: boolean;
  active?: boolean;
  destructive?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="text-[11px] font-semibold px-3 py-1.5 rounded-lg transition-all duration-150 disabled:opacity-40"
      style={{
        background: active
          ? "rgba(255,59,59,0.15)"
          : destructive
            ? "rgba(239,68,68,0.08)"
            : "rgba(255,255,255,0.04)",
        color: active
          ? "#FF3B3B"
          : destructive
            ? "#ef4444"
            : "rgba(255,255,255,0.5)",
        border: active
          ? "1px solid rgba(255,59,59,0.3)"
          : destructive
            ? "1px solid rgba(239,68,68,0.15)"
            : "1px solid rgba(255,255,255,0.06)",
      }}
    >
      {label}
    </button>
  );
}
