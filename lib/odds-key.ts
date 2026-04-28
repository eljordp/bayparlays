import { supabase } from "@/lib/supabase";

// Resolves the active Odds API key.
//
// Priority order:
//   1. api_keys row where service='odds_api' AND active=true (Supabase)
//   2. process.env.ODDS_API_KEY (fallback for first-run / migration-019-not-applied)
//
// 30-second module cache so repeated calls inside a single cron run don't
// hammer Supabase. Cache is invalidated when /api/admin/rotate-key flips
// the active row, via setActiveOddsKey() below.
//
// Why this exists: JP's free-tier key burns 500/credits/mo by ~3 weeks in.
// Rotating to a fresh key used to require updating Vercel env + redeploy
// (~2 min round-trip). With this, /admin/keys → paste → click → live.

let cached: { key: string; cachedAt: number } | null = null;
const CACHE_TTL_MS = 30 * 1000;

export async function getOddsApiKey(): Promise<string | null> {
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return cached.key;
  }

  // Try Supabase first
  try {
    const { data } = await supabase
      .from("api_keys")
      .select("key_value")
      .eq("service", "odds_api")
      .eq("active", true)
      .maybeSingle();
    if (data?.key_value) {
      cached = { key: data.key_value, cachedAt: Date.now() };
      return data.key_value;
    }
  } catch {
    /* table may not exist yet — fall through to env */
  }

  // Fallback to env
  const envKey = process.env.ODDS_API_KEY ?? null;
  if (envKey) {
    cached = { key: envKey, cachedAt: Date.now() };
  }
  return envKey;
}

// Force-invalidate the cache (called after /api/admin/rotate-key).
export function invalidateOddsKeyCache(): void {
  cached = null;
}
