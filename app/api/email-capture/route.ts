import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  const { email } = await request.json();

  if (!email) {
    return NextResponse.json({ error: "Email required" }, { status: 400 });
  }

  // Store in a simple email_captures table
  await supabase.from("email_captures").insert({ email }).single();

  return NextResponse.json({ success: true });
}
