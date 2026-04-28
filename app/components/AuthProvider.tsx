"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";

interface AuthContext {
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  isOwner: boolean;
  isPro: boolean;
  tier: string;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContext>({
  user: null,
  loading: true,
  isAdmin: false,
  isOwner: false,
  isPro: false,
  tier: "free",
  signOut: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPro, setIsPro] = useState(false);
  const [tier, setTier] = useState("free");

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) checkProStatus(session.user.email);
      setLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) checkProStatus(session.user.email);
      else setIsPro(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function checkProStatus(email: string | undefined) {
    if (!email) return;
    const { data } = await supabase
      .from("users")
      .select("subscription_status, subscription_tier, trial_ends_at")
      .eq("email", email)
      .single();

    let status = data?.subscription_status;
    let currentTier = data?.subscription_tier || "free";

    // Check if trial has expired
    if (status === "trialing" && data?.trial_ends_at) {
      const trialEnd = new Date(data.trial_ends_at);
      if (trialEnd < new Date()) {
        // Trial expired — downgrade
        status = "none";
        currentTier = "free";
        // Update in DB
        supabase.from("users").update({
          subscription_status: "none",
          subscription_tier: "free",
        }).eq("email", email).then(() => {});
      }
    }

    setTier(currentTier);
    // Owner and admin always have pro access regardless of subscription_status.
    const privileged = currentTier === "owner" || currentTier === "admin";
    setIsPro(privileged || status === "active" || status === "trialing");
  }

  const isOwner = tier === "owner";
  const isAdmin = tier === "admin" || tier === "owner";

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setIsPro(false);
  };

  return (
    <AuthContext.Provider value={{ user, loading, isAdmin, isOwner, isPro, tier, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
