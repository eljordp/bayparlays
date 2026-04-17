import { NextRequest, NextResponse } from "next/server";

// These will be set in .env.local
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_PRICE_ID = process.env.STRIPE_PRICE_ID;
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://bayparlays.vercel.app";

export async function POST(request: NextRequest) {
  // Suppress unused variable warning — request is required by the Next.js API route signature
  void request;

  if (!STRIPE_SECRET_KEY || !STRIPE_PRICE_ID) {
    return NextResponse.json(
      { error: "Stripe is not configured yet. Add STRIPE_SECRET_KEY and STRIPE_PRICE_ID to your environment." },
      { status: 500 }
    );
  }

  try {
    // Use Stripe API directly (no SDK needed for basic checkout)
    const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        "mode": "subscription",
        "payment_method_types[0]": "card",
        "line_items[0][price]": STRIPE_PRICE_ID,
        "line_items[0][quantity]": "1",
        "success_url": `${BASE_URL}/subscribe?success=true`,
        "cancel_url": `${BASE_URL}/subscribe?canceled=true`,
        "subscription_data[trial_period_days]": "7",
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
