"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/components/AuthProvider";
import { AppNav } from "@/app/components/AppNav";
import { Copy, Check } from "lucide-react";

interface Verdict {
  parlayId: string;
  verdict: "keep" | "soft" | "skip";
  confidence?: number;
  reason?: string;
}

interface SlateData {
  slateId: string | null;
  parlays: Array<{
    id: string;
    slate_rank: number | null;
    combined_odds: string;
    confidence: number;
    ev_percent: number;
    llm_verdict: string | null;
    llm_reason: string | null;
  }>;
  prompt: string;
  count: number;
}

export default function VerifySlatePage() {
  const { user, isOwner, loading: authLoading } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<SlateData | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [verdictsJson, setVerdictsJson] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !isOwner) router.push("/");
  }, [authLoading, isOwner, router]);

  useEffect(() => {
    if (!isOwner || !user?.email) return;
    fetch(`/api/admin/verify-slate?email=${encodeURIComponent(user.email)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .finally(() => setLoading(false));
  }, [isOwner, user?.email]);

  if (authLoading || !isOwner) {
    return (
      <div className="min-h-screen" style={{ background: "#FAFAF7" }}>
        <AppNav />
      </div>
    );
  }

  async function copyPrompt() {
    if (!data?.prompt) return;
    await navigator.clipboard.writeText(data.prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function submit() {
    if (!user?.email) return;
    setSubmitting(true);
    setResult(null);
    try {
      const verdicts: Verdict[] = JSON.parse(verdictsJson);
      const res = await fetch("/api/admin/verify-slate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email, verdicts }),
      });
      const j = await res.json();
      if (res.ok) {
        setResult(`✓ Updated ${j.updated} · Archived ${j.archived}${j.errors?.length ? ` · Errors ${j.errors.length}` : ""}`);
        setVerdictsJson("");
        // Re-fetch
        setTimeout(() => location.reload(), 1500);
      } else {
        setResult(`✗ ${j.error ?? "Submit failed"}`);
      }
    } catch (e) {
      setResult(`✗ Parse error: ${String(e)}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen" style={{ background: "#FAFAF7" }}>
      <AppNav />
      <div className="pt-24 px-4 max-w-[900px] mx-auto pb-20">
        <h1
          className="text-4xl md:text-5xl font-normal leading-[1.05] mb-3"
          style={{ fontFamily: "'DM Serif Display', serif", color: "#0a0a0a" }}
        >
          Verify Slate (Manual)
        </h1>
        <p className="text-base mb-6" style={{ color: "rgba(0,0,0,0.55)" }}>
          Step 1: copy the prompt below. Step 2: paste into a Claude chat, get JSON
          verdicts back. Step 3: paste those verdicts in the bottom box and Apply.
          Picks marked &quot;skip&quot; get archived from the active slate.
        </p>

        {loading ? (
          <div className="rounded-xl p-6 text-center" style={{ background: "rgba(0,0,0,0.03)", color: "rgba(0,0,0,0.45)" }}>
            Loading slate…
          </div>
        ) : !data?.slateId ? (
          <div className="rounded-xl p-6 text-center" style={{ background: "rgba(0,0,0,0.03)", color: "rgba(0,0,0,0.45)" }}>
            No active slate found.
          </div>
        ) : (
          <>
            <div className="mb-4 text-sm" style={{ color: "rgba(0,0,0,0.7)" }}>
              <span style={{ fontWeight: 600 }}>{data.slateId}</span>
              <span className="ml-2" style={{ color: "rgba(0,0,0,0.45)" }}>· {data.count} picks</span>
            </div>

            {/* Prompt to copy */}
            <div className="rounded-xl border mb-8 overflow-hidden" style={{ borderColor: "rgba(0,0,0,0.1)", background: "#fff" }}>
              <div className="flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: "rgba(0,0,0,0.06)" }}>
                <span className="text-xs uppercase tracking-widest font-bold" style={{ color: "rgba(0,0,0,0.55)" }}>
                  Step 1 — Copy this prompt
                </span>
                <button
                  onClick={copyPrompt}
                  className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full"
                  style={{ background: "#0a0a0a", color: "#fff" }}
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  {copied ? "Copied" : "Copy prompt"}
                </button>
              </div>
              <pre
                className="p-4 text-xs whitespace-pre-wrap font-mono overflow-x-auto"
                style={{ background: "rgba(0,0,0,0.02)", color: "rgba(0,0,0,0.75)", maxHeight: 400 }}
              >
                {data.prompt}
              </pre>
            </div>

            {/* Verdict input */}
            <div className="rounded-xl border overflow-hidden mb-4" style={{ borderColor: "rgba(0,0,0,0.1)", background: "#fff" }}>
              <div className="px-5 py-3 border-b" style={{ borderColor: "rgba(0,0,0,0.06)" }}>
                <span className="text-xs uppercase tracking-widest font-bold" style={{ color: "rgba(0,0,0,0.55)" }}>
                  Step 2 — Paste Claude&apos;s JSON verdicts here
                </span>
              </div>
              <textarea
                value={verdictsJson}
                onChange={(e) => setVerdictsJson(e.target.value)}
                placeholder='[{"parlayId": "abc-123", "verdict": "keep", "confidence": 35, "reason": "..."}, ...]'
                className="w-full p-4 text-xs font-mono"
                rows={10}
                style={{ background: "rgba(0,0,0,0.02)", color: "#0a0a0a", border: "none", outline: "none" }}
                spellCheck={false}
              />
            </div>

            <div className="flex items-center justify-between gap-4 flex-wrap">
              <button
                onClick={submit}
                disabled={submitting || !verdictsJson.trim()}
                className="px-6 py-3 rounded-full text-sm font-bold uppercase tracking-wider disabled:opacity-40"
                style={{ background: "#FF3B3B", color: "#fff" }}
              >
                {submitting ? "Applying…" : "Apply Verdicts"}
              </button>
              {result && (
                <span className="text-sm" style={{ color: result.startsWith("✓") ? "#16a34a" : "#dc2626" }}>
                  {result}
                </span>
              )}
            </div>

            {/* Current verdicts table */}
            <div className="mt-10">
              <h2 className="text-lg font-semibold mb-3" style={{ color: "#0a0a0a" }}>
                Current State
              </h2>
              <div className="rounded-xl border overflow-hidden" style={{ borderColor: "rgba(0,0,0,0.08)", background: "#fff" }}>
                {data.parlays.map((p, i) => (
                  <div
                    key={p.id}
                    className="px-5 py-3 flex items-center justify-between"
                    style={{ borderBottom: i < data.parlays.length - 1 ? "1px solid rgba(0,0,0,0.05)" : "none" }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-mono">
                        #{p.slate_rank ?? "—"} · {p.combined_odds} · conf {p.confidence}%
                      </div>
                      {p.llm_reason && (
                        <div className="text-xs mt-1" style={{ color: "rgba(0,0,0,0.5)" }}>
                          {p.llm_reason}
                        </div>
                      )}
                    </div>
                    <div className="ml-3 text-right">
                      {p.llm_verdict ? (
                        <span
                          className="text-[10px] uppercase tracking-widest font-bold px-2 py-0.5 rounded-full"
                          style={{
                            background:
                              p.llm_verdict === "keep" ? "rgba(34,197,94,0.15)" :
                              p.llm_verdict === "skip" ? "rgba(255,59,59,0.15)" :
                              "rgba(0,0,0,0.08)",
                            color:
                              p.llm_verdict === "keep" ? "#16a34a" :
                              p.llm_verdict === "skip" ? "#FF3B3B" :
                              "rgba(0,0,0,0.55)",
                          }}
                        >
                          {p.llm_verdict}
                        </span>
                      ) : (
                        <span className="text-xs" style={{ color: "rgba(0,0,0,0.4)" }}>
                          unverified
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div className="text-xs font-mono mt-2" style={{ color: "rgba(0,0,0,0.4)" }}>
                Tip: paste each parlay&apos;s {"`id`"} (visible in the prompt) into your verdict JSON.
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
