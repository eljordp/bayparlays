import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .order("created_at", { ascending: false });

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ users: data });
}

export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const { userId, subscription_status, subscription_tier } = body;

  if (!userId) {
    return NextResponse.json({ error: "userId required" }, { status: 400 });
  }

  // Owner is set once via SQL migration and never via API. This stops
  // anyone — including an admin — from promoting themselves to owner.
  if (subscription_tier === "owner") {
    return NextResponse.json(
      { error: "Owner tier can only be set via direct DB access" },
      { status: 403 },
    );
  }

  // And the owner can't be demoted via this endpoint either.
  const { data: existing } = await supabase
    .from("users")
    .select("subscription_tier")
    .eq("id", userId)
    .single();
  if (existing?.subscription_tier === "owner") {
    return NextResponse.json(
      { error: "Cannot modify owner via API" },
      { status: 403 },
    );
  }

  const updates: Record<string, string> = {};
  if (subscription_status) updates.subscription_status = subscription_status;
  if (subscription_tier) updates.subscription_tier = subscription_tier;
  updates.updated_at = new Date().toISOString();

  const { error } = await supabase
    .from("users")
    .update(updates)
    .eq("id", userId);

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
