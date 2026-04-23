import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { sendEmail } from "@/lib/email";
import {
  generateEdgeEmail,
  type EdgeLeg,
} from "@/lib/edge-email-template";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Cap per run to stay under Resend's 100/day free tier while we're bootstrapping.
const MAX_RECIPIENTS_PER_RUN = 100;

// Same sport combo the /edges page uses so the email mirrors the site.
const EDGES_SPORTS = "nba,nfl,mlb,nhl,ncaab,ncaaf";

export async function GET(req: NextRequest) {
  // Same cron auth pattern as /api/daily.
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_BASE_URL ||
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000");

  // 1. Fetch today's edges (top 5 will be rendered).
  let legs: EdgeLeg[] = [];
  try {
    const res = await fetch(
      `${baseUrl}/api/parlays?sports=${EDGES_SPORTS}&format=legs&count=30&tier=admin`,
      { cache: "no-store" },
    );
    if (res.ok) {
      const json = (await res.json()) as { legs?: EdgeLeg[] };
      legs = json.legs ?? [];
    }
  } catch (e) {
    console.error("[daily-edges] fetch edges failed", e);
  }

  // 2. Pull all subscribers. Cap per run for free-tier safety.
  const { data: rows, error: dbErr } = await supabase
    .from("email_captures")
    .select("email")
    .order("created_at", { ascending: true })
    .limit(MAX_RECIPIENTS_PER_RUN);

  if (dbErr) {
    return NextResponse.json(
      { error: `DB error: ${dbErr.message}` },
      { status: 500 },
    );
  }

  // Dedupe + normalize.
  const recipients = Array.from(
    new Set(
      (rows ?? [])
        .map((r) => (r.email || "").trim().toLowerCase())
        .filter((e) => e.length > 0),
    ),
  );

  // 3. If no Resend key, short-circuit with a visible no-op.
  if (!process.env.RESEND_API_KEY) {
    console.warn(
      "[daily-edges] RESEND_API_KEY not set — no emails sent",
    );
    return NextResponse.json({
      sent: 0,
      skipped: recipients.length,
      errors: [],
      note: "RESEND_API_KEY not configured",
      edgeCount: legs.length,
    });
  }

  // 4. Send. Simple sequential loop — fine at v1 free-tier scale (<=100/day).
  //    Each recipient gets a personalized unsubscribe link.
  const results = {
    sent: 0,
    skipped: 0,
    errors: [] as { email: string; error: string }[],
    edgeCount: legs.length,
  };

  for (const email of recipients) {
    try {
      const { subject, html, text } = generateEdgeEmail(legs, email);
      const r = await sendEmail({ to: email, subject, html, text });
      if (r.ok && !r.skipped) results.sent += 1;
      else if (r.skipped) results.skipped += 1;
      else results.errors.push({ email, error: r.error || "unknown" });
    } catch (e) {
      results.errors.push({
        email,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return NextResponse.json(results);
}
