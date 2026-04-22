import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
// Reject events older than 5 minutes to block replay attacks
const TOLERANCE_SECONDS = 300;

// Verify Stripe-Signature header against the raw body.
// Signature format: t=<unix_ts>,v1=<hmac_sha256_hex>[,v1=<alt>...]
// Docs: https://stripe.com/docs/webhooks/signatures
function verifyStripeSignature(
  rawBody: string,
  sigHeader: string | null,
  secret: string,
): boolean {
  if (!sigHeader) return false;

  let timestamp = "";
  const signatures: string[] = [];
  for (const part of sigHeader.split(",")) {
    const [k, v] = part.split("=");
    if (k === "t") timestamp = v;
    else if (k === "v1" && v) signatures.push(v);
  }
  if (!timestamp || signatures.length === 0) return false;

  const age = Math.floor(Date.now() / 1000) - Number(timestamp);
  if (!Number.isFinite(age) || age > TOLERANCE_SECONDS || age < -TOLERANCE_SECONDS) {
    return false;
  }

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`, "utf8")
    .digest("hex");

  const expectedBuf = Buffer.from(expected, "hex");
  return signatures.some((sig) => {
    const sigBuf = Buffer.from(sig, "hex");
    return (
      sigBuf.length === expectedBuf.length &&
      crypto.timingSafeEqual(sigBuf, expectedBuf)
    );
  });
}

export async function POST(request: NextRequest) {
  if (!WEBHOOK_SECRET) {
    console.error("STRIPE_WEBHOOK_SECRET not configured");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!verifyStripeSignature(rawBody, signature, WEBHOOK_SECRET)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  let event: { type: string; data: { object: Record<string, unknown> } };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as {
        customer_email?: string;
        customer_details?: { email?: string };
        customer?: string;
        subscription?: string;
        amount_total?: number;
        metadata?: { referral_code?: string };
      };
      const email = session.customer_email || session.customer_details?.email;
      const customerId = session.customer;
      const referralCode = session.metadata?.referral_code;

      if (email) {
        const tier = (session.amount_total || 0) >= 15000 ? "vip" : "sharp";

        await supabase
          .from("users")
          .update({
            subscription_status: session.subscription ? "active" : "none",
            subscription_tier: tier,
            stripe_customer_id: customerId,
            referred_by: referralCode || null,
            updated_at: new Date().toISOString(),
          })
          .eq("email", email);
      }
      break;
    }

    case "customer.subscription.updated": {
      const subscription = event.data.object as {
        customer?: string;
        status?: string;
      };
      const customerId = subscription.customer;
      const status = subscription.status;

      await supabase
        .from("users")
        .update({
          subscription_status:
            status === "active" || status === "trialing" ? status : "canceled",
          updated_at: new Date().toISOString(),
        })
        .eq("stripe_customer_id", customerId);
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as { customer?: string };
      const customerId = subscription.customer;

      await supabase
        .from("users")
        .update({
          subscription_status: "canceled",
          subscription_tier: "free",
          updated_at: new Date().toISOString(),
        })
        .eq("stripe_customer_id", customerId);
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as { customer?: string };
      const customerId = invoice.customer;

      await supabase
        .from("users")
        .update({
          subscription_status: "past_due",
          updated_at: new Date().toISOString(),
        })
        .eq("stripe_customer_id", customerId);
      break;
    }
  }

  return NextResponse.json({ received: true });
}
