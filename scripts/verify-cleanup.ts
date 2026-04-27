// Quick verification: how does the data look from /results' perspective?
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
  const slates = ["2026-04-27-evening", "2026-04-27-late", "2026-04-27-evening-test"];
  for (const slate_id of slates) {
    const { count: total } = await supabase
      .from("parlays")
      .select("id", { count: "exact", head: true })
      .eq("slate_id", slate_id);
    const { count: archived } = await supabase
      .from("parlays")
      .select("id", { count: "exact", head: true })
      .eq("slate_id", slate_id)
      .not("archived_at", "is", null);
    const { count: visible } = await supabase
      .from("parlays")
      .select("id", { count: "exact", head: true })
      .eq("slate_id", slate_id)
      .is("archived_at", null);
    console.log(`${slate_id}:`);
    console.log(`  total:    ${total}`);
    console.log(`  archived: ${archived}`);
    console.log(`  visible:  ${visible}  (what /results counts)`);
    console.log();
  }
}

main();
