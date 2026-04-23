// ─── Odds API Quota Tracker ───────────────────────────────────────────────
// The Odds API returns two response headers on every call:
//   x-requests-used     — credits consumed this month
//   x-requests-remaining — credits left this month
//
// We persist the latest reading to Supabase so the admin UI and cron jobs
// can gracefully throttle when we're near the 500/month free cap.
//
// Credit cost = (number of regions) x (number of markets) per request.
// Example: regions=us, markets=h2h,spreads,totals = 3 credits per fetch.

import { createClient } from "@supabase/supabase-js";

export interface QuotaSnapshot {
  used: number;
  remaining: number;
  lastRequestAt: string;
}

export function readQuotaHeaders(headers: Headers): QuotaSnapshot | null {
  const used = headers.get("x-requests-used");
  const remaining = headers.get("x-requests-remaining");
  if (used === null && remaining === null) return null;
  return {
    used: used ? parseInt(used, 10) : 0,
    remaining: remaining ? parseInt(remaining, 10) : 0,
    lastRequestAt: new Date().toISOString(),
  };
}

export async function persistQuota(snap: QuotaSnapshot): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return;
  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    await supabase
      .from("odds_api_quota")
      .update({
        used: snap.used,
        remaining: snap.remaining,
        last_request_at: snap.lastRequestAt,
      })
      .eq("id", 1);
  } catch {
    // Non-fatal — quota is a nice-to-have
  }
}

/**
 * Gate around Odds API fetches — if we're under the threshold, bail.
 * Pass a threshold (default 10) to reserve buffer for critical calls.
 *
 * Returns true = safe to fetch; false = skip.
 */
export async function canFetch(threshold = 10): Promise<boolean> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return true; // Can't check → allow
  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data } = await supabase
      .from("odds_api_quota")
      .select("remaining")
      .eq("id", 1)
      .maybeSingle();
    if (!data) return true;
    return data.remaining > threshold;
  } catch {
    return true;
  }
}
