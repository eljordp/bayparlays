"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";

interface AuthContext {
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  isPro: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContext>({
  user: null,
  loading: true,
  isAdmin: false,
  isPro: false,
  signOut: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

// Admin emails — these get full access always
const ADMIN_EMAILS = ["eljordp@gmail.com"];

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPro, setIsPro] = useState(false);

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
    // Check if admin
    if (ADMIN_EMAILS.includes(email)) {
      setIsPro(true);
      return;
    }
    // Check users table for subscription status
    const { data } = await supabase
      .from("users")
      .select("subscription_status, subscription_tier")
      .eq("email", email)
      .single();

    setIsPro(
      data?.subscription_status === "active" ||
        data?.subscription_status === "trialing"
    );
  }

  const isAdmin = ADMIN_EMAILS.includes(user?.email ?? "");

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setIsPro(false);
  };

  return (
    <AuthContext.Provider value={{ user, loading, isAdmin, isPro, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
