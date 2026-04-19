import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const event = body;

  // Handle different Stripe events
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const email =
        session.customer_email || session.customer_details?.email;
      const customerId = session.customer;
      const referralCode = session.metadata?.referral_code;

      if (email) {
        // Determine tier from the price
        const tier = session.amount_total >= 15000 ? "vip" : "sharp";

        await supabase
          .from("users")
          .update({
            subscription_status: session.subscription
              ? "active"
              : "none",
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
      const subscription = event.data.object;
      const customerId = subscription.customer;

      const status = subscription.status; // active, trialing, canceled, past_due

      await supabase
        .from("users")
        .update({
          subscription_status:
            status === "active" || status === "trialing"
              ? status
              : "canceled",
          updated_at: new Date().toISOString(),
        })
        .eq("stripe_customer_id", customerId);
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object;
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
  }

  return NextResponse.json({ received: true });
}
