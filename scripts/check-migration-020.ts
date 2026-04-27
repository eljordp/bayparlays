// Quick check: does the parlays table have the archived_at column?
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function main() {
  const { data, error } = await supabase
    .from("parlays")
    .select("id, archived_at")
    .limit(1);
  if (error) {
    console.log("❌ archived_at column NOT found.");
    console.log(`   Error: ${error.message}`);
    console.log();
    console.log("Paste this into Supabase SQL editor and Run:");
    console.log();
    console.log("  ALTER TABLE parlays");
    console.log("    ADD COLUMN IF NOT EXISTS archived_at timestamptz;");
    console.log();
    console.log("  CREATE INDEX IF NOT EXISTS idx_parlays_active");
    console.log("    ON parlays(created_at DESC) WHERE archived_at IS NULL;");
    process.exit(1);
  }
  console.log("✓ archived_at column exists. Migration 020 applied.");
  console.log(`  Sample row: ${JSON.stringify(data?.[0] ?? null)}`);
}

main();
