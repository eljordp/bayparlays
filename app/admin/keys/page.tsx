"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/components/AuthProvider";
import { AppNav } from "@/app/components/AppNav";

interface RotateResp {
  ok?: boolean;
  remaining?: number;
  used?: number;
  keyTail?: string;
  message?: string;
  error?: string;
  detail?: string;
}

export default function ApiKeysAdminPage() {
  const { user, isOwner, loading } = useAuth();
  const router = useRouter();
  const [keyInput, setKeyInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<RotateResp | null>(null);

  useEffect(() => {
    if (!loading && !isOwner) router.push("/");
  }, [loading, isOwner, router]);

  if (loading || !isOwner) {
    return (
      <div className="min-h-screen" style={{ background: "#FAFAF7" }}>
        <AppNav />
      </div>
    );
  }

  async function rotate() {
    if (!keyInput.trim()) return;
    setSubmitting(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/rotate-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: keyInput.trim(),
          email: user?.email,
        }),
      });
      const data = (await res.json()) as RotateResp;
      setResult(data);
      if (data.ok) setKeyInput("");
    } catch (e) {
      setResult({ error: String(e) });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen" style={{ background: "#FAFAF7" }}>
      <AppNav />
      <div className="pt-32 px-4 max-w-[700px] mx-auto">
        <h1
          className="text-4xl md:text-5xl font-normal leading-[1.05] mb-3"
          style={{ fontFamily: "'DM Serif Display', serif", color: "#0a0a0a" }}
        >
          Rotate Odds API Key
        </h1>
        <p className="text-base mb-8" style={{ color: "rgba(0,0,0,0.5)" }}>
          Paste a fresh key. We probe it against the Odds API (free, 0
          credits), then activate it for /api/parlays. No redeploy needed.
        </p>

        <div
          className="rounded-2xl p-6 border mb-6"
          style={{ background: "#fff", borderColor: "rgba(0,0,0,0.08)" }}
        >
          <label
            className="text-[10px] uppercase tracking-widest font-bold mb-2 block"
            style={{ color: "rgba(0,0,0,0.5)" }}
          >
            New Odds API Key
          </label>
          <input
            type="text"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            placeholder="paste 32-char key here"
            spellCheck={false}
            autoComplete="off"
            className="w-full px-4 py-3 rounded-lg font-mono text-sm"
            style={{
              background: "rgba(0,0,0,0.04)",
              border: "1px solid rgba(0,0,0,0.1)",
              color: "#0a0a0a",
            }}
          />
          <button
            onClick={rotate}
            disabled={submitting || keyInput.trim().length < 16}
            className="mt-4 w-full py-3 rounded-lg text-sm font-bold uppercase tracking-wider transition-all disabled:opacity-40"
            style={{ background: "#FF3B3B", color: "#fff" }}
          >
            {submitting ? "Validating + activating…" : "Activate Key"}
          </button>
        </div>

        {result && (
          <div
            className="rounded-2xl p-5 border"
            style={{
              background: result.ok ? "rgba(34,197,94,0.05)" : "rgba(255,59,59,0.05)",
              borderColor: result.ok ? "rgba(34,197,94,0.4)" : "rgba(255,59,59,0.4)",
            }}
          >
            {result.ok ? (
              <>
                <div
                  className="text-[10px] uppercase tracking-widest font-bold mb-2"
                  style={{ color: "#16a34a" }}
                >
                  ✓ Activated
                </div>
                <div className="text-sm mb-1">
                  Key …{result.keyTail} now active.
                </div>
                <div className="text-xs" style={{ color: "rgba(0,0,0,0.55)" }}>
                  {result.remaining}/{(result.remaining ?? 0) + (result.used ?? 0)} credits available · {result.message}
                </div>
              </>
            ) : (
              <>
                <div
                  className="text-[10px] uppercase tracking-widest font-bold mb-2"
                  style={{ color: "#dc2626" }}
                >
                  ✗ Rejected
                </div>
                <div className="text-sm">{result.error}</div>
                {result.detail && (
                  <div className="text-xs mt-1" style={{ color: "rgba(0,0,0,0.55)" }}>
                    {result.detail}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        <div className="mt-10 text-xs" style={{ color: "rgba(0,0,0,0.4)", lineHeight: 1.7 }}>
          <p className="mb-2"><strong>How this works:</strong></p>
          <p className="mb-2">
            Keys are stored in the <span className="font-mono">api_keys</span> Supabase table.
            <span className="font-mono"> /api/parlays</span> and friends read the active key
            from there with a 30-second cache. Switching keys takes effect on
            the next cron run.
          </p>
          <p className="mb-2">
            <strong>Fallback:</strong> if the table is empty or unreachable,
            the system falls back to the <span className="font-mono">ODDS_API_KEY</span> env var
            on Vercel. So you&apos;re never bricked.
          </p>
        </div>
      </div>
    </div>
  );
}
