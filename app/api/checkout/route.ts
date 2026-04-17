import { NextRequest, NextResponse } from "next/server";

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://bayparlays.vercel.app";

// Map tier IDs to Stripe price IDs (set these in .env.local)
const PRICE_MAP: Record<string, string | undefined> = {
  sharp: process.env.STRIPE_PRICE_SHARP,
  vip: process.env.STRIPE_PRICE_VIP,
  whale: process.env.STRIPE_PRICE_WHALE,
};

export async function POST(request: NextRequest) {
  if (!STRIPE_SECRET_KEY) {
    return NextResponse.json(
      { error: "Stripe is not configured yet. Add STRIPE_SECRET_KEY to your environment." },
      { status: 500 }
    );
  }

  let tier = "vip"; // default
  try {
    const body = await request.json();
    if (body.tier && PRICE_MAP[body.tier]) {
      tier = body.tier;
    }
  } catch {
    // no body or invalid JSON — use default tier
  }

  const priceId = PRICE_MAP[tier];
  if (!priceId) {
    return NextResponse.json(
      { error: `Stripe price not configured for "${tier}" tier. Add STRIPE_PRICE_${tier.toUpperCase()} to your environment.` },
      { status: 500 }
    );
  }

  try {
    const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        "mode": "subscription",
        "payment_method_types[0]": "card",
        "line_items[0][price]": priceId,
        "line_items[0][quantity]": "1",
        "success_url": `${BASE_URL}/subscribe?success=true`,
        "cancel_url": `${BASE_URL}/subscribe?canceled=true`,
        // Only Sharp tier gets a 7-day free trial
        ...(tier === "sharp" ? { "subscription_data[trial_period_days]": "7" } : {}),
      }),
    });

    const session = await res.json();

    if (!res.ok) {
      return NextResponse.json(
        { error: session.error?.message || "Failed to create checkout session" },
        { status: 400 }
      );
    }

    return NextResponse.json({ url: session.url });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
