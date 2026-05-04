import { createClient } from "@supabase/supabase-js";

// Service-role Supabase client. Bypasses RLS, so it MUST only be used in
// server-only code (API routes, cron handlers, server components). Never
// import from client components or pass to the browser.
//
// We keep this separate from lib/supabase.ts so the anon-key client can
// stay unchanged for everything that should respect RLS.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const supabaseAdmin =
  url && serviceKey
    ? createClient(url, serviceKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      })
    : null;

// True when service role is configured. Routes can degrade gracefully
// (e.g. fall back to anon client) if this is false in dev environments.
export const hasServiceRole = !!supabaseAdmin;
