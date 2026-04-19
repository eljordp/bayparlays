"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Logo } from "@/app/components/Logo";

type Mode = "signin" | "signup";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
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
    <div className="min-h-screen bg-[#0a0a0a] text-[#ededed]">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-xl bg-[#0a0a0a]/80 border-b border-white/[0.06]">
        <div className="w-full max-w-[1400px] mx-auto flex items-center justify-between px-6 md:px-10 h-20">
          <Link href="/" className="flex items-center gap-2 -mb-2">
            <Logo />
          </Link>
        </div>
      </nav>

      {/* Login Form */}
      <div className="flex items-center justify-center min-h-screen px-6 pt-20">
        <div className="w-full max-w-[440px]">
          <h1
            className="text-3xl md:text-4xl tracking-tight mb-10 text-center"
            style={{ fontFamily: "'DM Serif Display', serif" }}
          >
            {mode === "signin" ? "Welcome back" : "Create account"}
          </h1>

          {/* Tab Toggle */}
          <div className="flex mb-8 bg-white/[0.04] rounded-full p-1">
            <button
              onClick={() => {
                setMode("signin");
                setError("");
              }}
              className={`flex-1 text-sm font-medium py-2.5 rounded-full transition-all duration-200 ${
                mode === "signin"
                  ? "bg-white/[0.08] text-white"
                  : "text-white/40 hover:text-white/60"
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
                  ? "bg-white/[0.08] text-white"
                  : "text-white/40 hover:text-white/60"
              }`}
            >
              Sign Up
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="email"
                className="block text-xs text-white/30 uppercase tracking-wider mb-2"
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
                className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-[#FF3B3B]/40 focus:ring-1 focus:ring-[#FF3B3B]/20 transition-all"
                placeholder="you@email.com"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-xs text-white/30 uppercase tracking-wider mb-2"
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
                className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-[#FF3B3B]/40 focus:ring-1 focus:ring-[#FF3B3B]/20 transition-all"
                placeholder="Min. 6 characters"
              />
            </div>

            {mode === "signup" && (
              <div>
                <label
                  htmlFor="confirmPassword"
                  className="block text-xs text-white/30 uppercase tracking-wider mb-2"
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
                  className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-[#FF3B3B]/40 focus:ring-1 focus:ring-[#FF3B3B]/20 transition-all"
                  placeholder="Repeat password"
                />
              </div>
            )}

            {error && (
              <div className="bg-[#FF3B3B]/10 border border-[#FF3B3B]/20 rounded-xl px-4 py-3 text-sm text-[#FF3B3B]">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#FF3B3B] text-[#0a0a0a] font-semibold py-3.5 rounded-full hover:bg-[#FF5252] transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
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
                className="text-xs text-white/25 hover:text-white/50 transition-colors"
              >
                Forgot password?
              </button>
              {showForgot && (
                <p className="mt-3 text-xs text-white/30 bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-3">
                  Email us at support@bayparlays.com and we will reset your
                  password.
                </p>
              )}
            </div>
          )}

          <p className="mt-8 text-center text-xs text-white/15">
            By signing up, you agree to our terms of service.
          </p>
        </div>
      </div>
    </div>
  );
}
