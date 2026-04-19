import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { code, event } = body;

    if (!code || !event) {
      return NextResponse.json(
        { error: "Missing code or event" },
        { status: 400 }
      );
    }

    if (!["click", "signup", "subscription"].includes(event)) {
      return NextResponse.json(
        { error: "Invalid event type" },
        { status: 400 }
      );
    }

    // Check if referral code exists
    const { data: referral } = await supabase
      .from("referrals")
      .select("referrer_code")
      .eq("referrer_code", code)
      .single();

    if (!referral) {
      return NextResponse.json(
        { error: "Referral code not found" },
        { status: 404 }
      );
    }

    // Insert event
    await supabase.from("referral_events").insert({
      referrer_code: code,
      event_type: event,
    });

    // Increment counter on referrals table
    if (event === "click") {
      const { data } = await supabase
        .from("referrals")
        .select("clicks")
        .eq("referrer_code", code)
        .single();
      if (data) {
        await supabase
          .from("referrals")
          .update({ clicks: (data.clicks || 0) + 1 })
          .eq("referrer_code", code);
      }
    } else if (event === "signup") {
      const { data } = await supabase
        .from("referrals")
        .select("signups")
        .eq("referrer_code", code)
        .single();
      if (data) {
        await supabase
          .from("referrals")
          .update({ signups: (data.signups || 0) + 1 })
          .eq("referrer_code", code);
      }
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
