import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { invalidateOddsKeyCache } from "@/lib/odds-key";

export const dynamic = "force-dynamic";

// Owner-only key rotation endpoint.
//
// Flow when JP gets a fresh free-tier key each day:
//   1. POST { key: "new_key", email: "eljordp@gmail.com" }
//   2. Endpoint validates against the-odds-api.com /sports (free probe)
//   3. If valid AND has remaining credits: deactivates old active row,
//      inserts new row marked active.
//   4. Cache invalidated so next /api/parlays call picks up new key.
//
// Caller is required to send their email so the rotation log shows who
// did it. We trust the email since this is gated behind admin tooling
// — if it gets exposed publicly later, swap to a Supabase auth check.

const OWNER_EMAILS = ["eljordp@gmail.com"];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const newKey = (body.key ?? "").trim();
    const email = (body.email ?? "").trim().toLowerCase();

    if (!OWNER_EMAILS.includes(email)) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }
    if (!newKey || newKey.length < 16) {
      return NextResponse.json({ error: "Key looks malformed" }, { status: 400 });
    }

    // Validate against The Odds API. /sports is free (0 credit cost).
    const probe = await fetch(
      `https://api.the-odds-api.com/v4/sports?apiKey=${encodeURIComponent(newKey)}`,
      { cache: "no-store" },
    );
    const used = parseInt(probe.headers.get("x-requests-used") ?? "0", 10);
    const remaining = parseInt(probe.headers.get("x-requests-remaining") ?? "0", 10);

    if (!probe.ok) {
      return NextResponse.json(
        {
          error: "Key rejected by Odds API",
          status: probe.status,
        },
        { status: 400 },
      );
    }
    if (remaining === 0) {
      return NextResponse.json(
        {
          error: "Key has no credits remaining",
          used,
          remaining,
        },
        { status: 400 },
      );
    }

    // Deactivate the previous active row (if table exists and any exists).
    try {
      await supabase
        .from("api_keys")
        .update({ active: false })
        .eq("service", "odds_api")
        .eq("active", true);
    } catch (e) {
      console.error("rotate-key: failed deactivating old key:", e);
    }

    // Insert new active row.
    const { error: insertErr } = await supabase.from("api_keys").insert({
      service: "odds_api",
      key_value: newKey,
      active: true,
      rotated_by: email,
      notes: `remaining=${remaining}, used=${used}`,
    });
    if (insertErr) {
      return NextResponse.json(
        { error: "Failed to store key", detail: insertErr.message },
        { status: 500 },
      );
    }

    invalidateOddsKeyCache();

    // Reset the quota tracker row to reflect the NEW key's state. Without
    // this, canFetch() in lib/odds-quota.ts keeps reading the old key's
    // exhausted-remaining=0 row and blocks every fetch — even though the
    // freshly rotated key has hundreds of credits available. Caused the
    // 2026-04-28 silent-deadlock where slates kept publishing 0 candidates
    // for hours after the key rotation that should have unblocked them.
    try {
      await supabase
        .from("odds_api_quota")
        .update({
          used,
          remaining,
          last_request_at: new Date().toISOString(),
        })
        .eq("id", 1);
    } catch (e) {
      console.error("rotate-key: failed resetting odds_api_quota:", e);
    }

    return NextResponse.json({
      ok: true,
      remaining,
      used,
      keyTail: newKey.slice(-4),
      message:
        "Key activated. Next /api/parlays call will pick it up within 30s.",
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
