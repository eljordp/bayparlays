import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Browser-callable proxy for the train-model cron. Same shape and
// reasoning as /api/admin/recompute-calibration — see that file's
// header comment for the full rationale.

function getOrigin(req: Request): string {
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host =
    req.headers.get("x-forwarded-host") ??
    req.headers.get("host") ??
    process.env.VERCEL_URL ??
    "localhost:3000";
  return `${proto}://${host}`;
}

export async function GET(req: Request) {
  const url = `${getOrigin(req)}/api/cron/train-model`;
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
