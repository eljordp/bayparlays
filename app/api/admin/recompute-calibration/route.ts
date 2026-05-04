import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Browser-callable proxy for the calibrate cron. The cron itself
// requires CRON_SECRET when set, which a browser fetch from the admin
// page can't supply. This route runs server-side, reads CRON_SECRET
// from env, and forwards the call with the bearer header attached.
//
// Effect for the admin /admin/calibration "Recompute Now" button:
// works the same whether CRON_SECRET is set or not — no future "why
// doesn't this button do anything" rabbit hole the day we wire up
// proper cron auth via GitHub Actions / Vercel Cron secrets.
//
// Note: this endpoint is page-gated by isAdmin in the calling page,
// matching the existing /api/admin/* convention. It's not directly
// auth-protected itself; if/when we add real server-side admin auth
// we should layer it in here too.

function getOrigin(req: Request): string {
  // Construct the absolute URL of this deployment so we can fetch our
  // own /api/cron/calibrate. Vercel sets x-forwarded-* headers on every
  // request; locally we fall back to the Host header.
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host =
    req.headers.get("x-forwarded-host") ??
    req.headers.get("host") ??
    process.env.VERCEL_URL ??
    "localhost:3000";
  return `${proto}://${host}`;
}

export async function GET(req: Request) {
  const url = `${getOrigin(req)}/api/cron/calibrate`;
  const headers: Record<string, string> = {};
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    headers.Authorization = `Bearer ${cronSecret}`;
  }
  try {
    const res = await fetch(url, { headers, cache: "no-store" });
    const text = await res.text();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      json = { error: text || "Empty response from cron endpoint" };
    }
    return NextResponse.json(json, { status: res.status });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "fetch failed" },
      { status: 502 },
    );
  }
}
