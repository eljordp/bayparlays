"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { AppNav } from "@/app/components/AppNav";

type Mode = "signin" | "signup";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}

function LoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialMode: Mode = searchParams?.get("mode") === "signup" ? "signup" : "signin";
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showForgot, setShowForgot] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (mode === "signup" && password !== confirmPassword) {
      setError("Passwords do not match.");
      setLoading(false);
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      setLoading(false);
      return;
    }

    try {
      if (mode === "signin") {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) {
          setError(signInError.message);
          setLoading(false);
          return;
        }
      } else {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
        });
        if (signUpError) {
          setError(signUpError.message);
          setLoading(false);
          return;
        }
      }

      router.push("/parlays");
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#FAFAF7] text-[#0a0a0a]">
      <AppNav />

      {/* Login Form */}
      <div className="flex items-center justify-center min-h-screen px-6 pt-20">
        <div className="w-full max-w-[440px]">
          <h1
            className="text-3xl md:text-4xl tracking-tight mb-10 text-center"
            style={{ fontFamily: "'DM Serif Display', serif" }}
          >
            {mode === "signin" ? "Welcome back" : "Start your free trial"}
          </h1>
          {mode === "signup" && (
            <p className="text-center text-black/45 text-sm -mt-6 mb-6">
              7 days of Sharp access. No card required.
            </p>
          )}

          {/* Tab Toggle */}
          <div className="flex mb-8 bg-black/[0.04] rounded-full p-1">
            <button
              onClick={() => {
                setMode("signin");
                setError("");
              }}
              className={`flex-1 text-sm font-medium py-2.5 rounded-full transition-all duration-200 ${
                mode === "signin"
                  ? "bg-black/[0.08] text-black"
                  : "text-black/45 hover:text-black/60"
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => {
                setMode("signup");
                setError("");
              }}
              className={`flex-1 text-sm font-medium py-2.5 rounded-full transition-all duration-200 ${
                mode === "signup"
                  ? "bg-black/[0.08] text-black"
                  : "text-black/45 hover:text-black/60"
              }`}
            >
              Sign Up
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="email"
                className="block text-xs text-black/40 uppercase tracking-wider mb-2"
                style={{ fontFamily: "var(--font-geist-mono)" }}
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full bg-black/[0.04] border border-black/[0.08] rounded-xl px-4 py-3 text-sm text-black placeholder:text-black/30 focus:outline-none focus:border-[#0a0a0a]/40 focus:ring-1 focus:ring-[#0a0a0a]/20 transition-all"
                placeholder="you@email.com"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-xs text-black/40 uppercase tracking-wider mb-2"
                style={{ fontFamily: "var(--font-geist-mono)" }}
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete={
                  mode === "signin" ? "current-password" : "new-password"
                }
                className="w-full bg-black/[0.04] border border-black/[0.08] rounded-xl px-4 py-3 text-sm text-black placeholder:text-black/30 focus:outline-none focus:border-[#0a0a0a]/40 focus:ring-1 focus:ring-[#0a0a0a]/20 transition-all"
                placeholder="Min. 6 characters"
              />
            </div>

            {mode === "signup" && (
              <div>
                <label
                  htmlFor="confirmPassword"
                  className="block text-xs text-black/40 uppercase tracking-wider mb-2"
                  style={{ fontFamily: "var(--font-geist-mono)" }}
                >
                  Confirm Password
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  className="w-full bg-black/[0.04] border border-black/[0.08] rounded-xl px-4 py-3 text-sm text-black placeholder:text-black/30 focus:outline-none focus:border-[#0a0a0a]/40 focus:ring-1 focus:ring-[#0a0a0a]/20 transition-all"
                  placeholder="Repeat password"
                />
              </div>
            )}

            {error && (
              <div className="bg-[#0a0a0a]/10 border border-[#0a0a0a]/20 rounded-xl px-4 py-3 text-sm text-white">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#0a0a0a] text-white font-semibold py-3.5 rounded-full hover:bg-[#222] transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            >
              {loading
                ? "Loading..."
                : mode === "signin"
                  ? "Sign In"
                  : "Create Account"}
            </button>
          </form>

          {mode === "signin" && (
            <div className="mt-6 text-center">
              <button
                onClick={() => setShowForgot(!showForgot)}
                className="text-xs text-black/40 hover:text-black/55 transition-colors"
              >
                Forgot password?
              </button>
              {showForgot && (
                <p className="mt-3 text-xs text-black/40 bg-black/[0.04] border border-black/[0.06] rounded-xl px-4 py-3">
                  Email us at support@bayparlays.com and we will reset your
                  password.
                </p>
              )}
            </div>
          )}

          <p className="mt-8 text-center text-xs text-black/25">
            By signing up, you agree to our terms of service.
          </p>
        </div>
      </div>
    </div>
  );
}
