import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const row = {
      legs: body.legs,
      combined_odds: body.combined_odds,
      combined_decimal: body.combined_decimal,
      ev: body.ev,
      ev_percent: body.ev_percent,
      confidence: body.confidence,
      payout: body.payout,
      stake: body.stake ?? 100,
      legs_total: body.legs_total ?? body.legs?.length ?? 0,
      sports: body.sports ?? [],
      status: "pending",
    };

    const { data, error } = await supabase
      .from("parlays")
      .insert(row)
      .select()
      .single();

    if (error) {
      console.error("Supabase insert error:", error);
      return NextResponse.json(
        { error: "Failed to track parlay", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, parlay: data });
  } catch (error) {
    console.error("Track parlay error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
