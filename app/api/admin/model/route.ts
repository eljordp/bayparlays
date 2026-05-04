import { NextResponse } from "next/server";
import { supabase as anonSupabase } from "@/lib/supabase";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

// Server-side only — gated by isAdmin in the calling page. Service-role
// client bypasses RLS so anon-grant gaps don't silently hide rows.
const supabase = supabaseAdmin ?? anonSupabase;

// Returns the latest model_weights row + a recent history slice for the
// admin /admin/model page. Falls back gracefully if the table doesn't
// exist yet (migration 025 not applied).

interface WeightsRow {
  id: string;
  trained_at: string;
  model_version: number;
  training_size: number;
  train_loss: number;
  val_loss: number;
  weights: {
    intercept: number;
    weights: Record<string, number>;
    feature_means: Record<string, number>;
    feature_stds: Record<string, number>;
    feature_order: string[];
  };
  notes: string | null;
}

export async function GET() {
  const { data, error } = await supabase
    .from("model_weights")
    .select("id, trained_at, model_version, training_size, train_loss, val_loss, weights, notes")
    .order("trained_at", { ascending: false })
    .limit(20);

  if (error) {
    if (/relation .*model_weights/i.test(error.message || "")) {
      return NextResponse.json({
        latest: null,
        history: [],
        message:
          "model_weights table missing. Apply migration 025 then run /api/cron/train-model.",
      });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as WeightsRow[];
  if (rows.length === 0) {
    return NextResponse.json({
      latest: null,
      history: [],
      message: "No trained model yet. Run /api/cron/train-model.",
    });
  }

  const latest = rows[0];
  const history = rows.map((r) => ({
    id: r.id,
    trained_at: r.trained_at,
    model_version: r.model_version,
    training_size: r.training_size,
    train_loss: r.train_loss,
    val_loss: r.val_loss,
    notes: r.notes,
  }));

  // Surface top features by magnitude — quickest way to see what the model
  // thinks matters this round.
  const ranked = Object.entries(latest.weights.weights ?? {})
    .filter(([, w]) => Number.isFinite(w))
    .sort(([, a], [, b]) => Math.abs(b) - Math.abs(a))
    .map(([name, weight]) => ({ name, weight }));

  return NextResponse.json({
    latest: {
      id: latest.id,
      trained_at: latest.trained_at,
      model_version: latest.model_version,
      training_size: latest.training_size,
      train_loss: latest.train_loss,
      val_loss: latest.val_loss,
      intercept: latest.weights.intercept,
      feature_count: latest.weights.feature_order?.length ?? 0,
      ranked_weights: ranked,
      notes: latest.notes,
    },
    history,
  });
}
