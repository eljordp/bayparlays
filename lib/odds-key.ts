import { createClient } from "@supabase/supabase-js";

// Resolves the active Odds API key.
//
// Priority order:
//   1. api_keys row where service='odds_api' AND active=true (Supabase)
//   2. process.env.ODDS_API_KEY (fallback for first-run / migration-not-applied)
//
// Uses a service-role client because api_keys is RLS-protected — anon
// reads are blocked (key vault). All callers of getOddsApiKey() are
// server-side anyway (cron routes, /api/parlays), so service role is
// safe.
//
// 30-second module cache so repeated calls inside a single cron run don't
// hammer Supabase. Cache is invalidated when /api/admin/rotate-key flips
// the active row, via invalidateOddsKeyCache() below.

let cached: { key: string; cachedAt: number } | null = null;
const CACHE_TTL_MS = 30 * 1000;

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function getOddsApiKey(): Promise<string | null> {
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return cached.key;
  }

  // Try Supabase first (service role to bypass RLS)
  try {
    const sb = adminClient();
    if (sb) {
      const { data } = await sb
        .from("api_keys")
        .select("key_value")
        .eq("service", "odds_api")
        .eq("active", true)
        .maybeSingle();
      if (data?.key_value) {
        cached = { key: data.key_value, cachedAt: Date.now() };
        return data.key_value;
      }
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
