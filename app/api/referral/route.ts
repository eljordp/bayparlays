import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

function generateCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "BP";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const name = body.name || null;
    const email = body.email || null;

    // Generate a unique code, retry if collision
    let code = generateCode();
    let attempts = 0;

    while (attempts < 5) {
      const { error } = await supabase.from("referrals").insert({
        referrer_code: code,
        referrer_name: name,
        referrer_email: email,
      });

      if (!error) {
        return NextResponse.json({
          code,
          link: `https://bayparlays.vercel.app?ref=${code}`,
        });
      }

      // If unique constraint violation, try a new code
      if (error.code === "23505") {
        code = generateCode();
        attempts++;
        continue;
      }

      // Other error
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: "Failed to generate unique code. Try again." },
      { status: 500 }
    );
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");

  if (!code) {
    return NextResponse.json(
      { error: "Missing code parameter" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("referrals")
    .select("clicks, signups, referrer_name")
    .eq("referrer_code", code)
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: "Referral code not found" },
      { status: 404 }
    );
  }

  return NextResponse.json(data);
}
