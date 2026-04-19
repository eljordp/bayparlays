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
