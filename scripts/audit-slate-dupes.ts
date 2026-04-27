// One-shot: scan the most recent slates for near-duplicate parlays.
// Surfaces #2/#3 type collisions JP saw on the live page.
//
// Usage: npx tsx scripts/audit-slate-dupes.ts

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

// Load .env.local manually (no dotenv dep)
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

interface Leg {
  game?: string;
  pick?: string;
  market?: string;
  sport?: string;
  gameId?: string;
}

interface ParlayRow {
  id: string;
  slate_id: string | null;
  slate_rank: number | null;
  created_at: string;
  legs: Leg[];
  combined_odds: string;
  confidence: number;
  ev_percent: number;
  category: string | null;
  status: string;
}

function legSig(leg: Leg): string {
  // Prefer gameId+pick (matches the diversity filter's keying); fall back
  // to game+pick if gameId is missing — same as the filter does.
  const id = leg.gameId ?? leg.game ?? "?";
  return `${id}::${leg.pick ?? "?"}`;
}

function parlaySig(legs: Leg[]): string {
  return [...legs.map(legSig)].sort().join(" | ");
}

async function main() {
  // Pull the 5 most recent slates. Enough to spot patterns without dumping
  // all history.
  const { data: slates } = await supabase
    .from("parlays")
    .select("slate_id")
    .not("slate_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(500);

  const slateIds = Array.from(new Set((slates ?? []).map((s) => s.slate_id)))
    .filter((s): s is string => !!s)
    .slice(0, 5);

  console.log(`Auditing ${slateIds.length} most recent slates:`);
  for (const id of slateIds) console.log(`  - ${id}`);
  console.log();

  for (const slateId of slateIds) {
    const { data: rows } = await supabase
      .from("parlays")
      .select("*")
      .eq("slate_id", slateId)
      .order("slate_rank", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });

    const parlays = (rows ?? []) as ParlayRow[];
    if (parlays.length === 0) continue;

    console.log(`━━━ ${slateId} (${parlays.length} picks) ━━━`);

    // Detect literal duplicates (same leg signatures sorted)
    const sigCounts = new Map<string, ParlayRow[]>();
    for (const p of parlays) {
      const sig = parlaySig(p.legs ?? []);
      const arr = sigCounts.get(sig) ?? [];
      arr.push(p);
      sigCounts.set(sig, arr);
    }
    const literalDupes = [...sigCounts.entries()].filter(([, arr]) => arr.length > 1);
    if (literalDupes.length > 0) {
      console.log(`  ⚠️  LITERAL DUPLICATES (same legs):`);
      for (const [, arr] of literalDupes) {
        console.log(`     × ${arr.length} copies — rank ${arr.map((p) => p.slate_rank ?? "?").join(",")}`);
        for (const leg of arr[0].legs) {
          console.log(`        · ${leg.sport ?? "?"} | ${leg.game ?? "?"} | ${leg.pick ?? "?"}`);
        }
      }
    }

    // Detect near-duplicates: parlays sharing >= 2 legs
    const nearDupes: Array<[ParlayRow, ParlayRow, string[]]> = [];
    for (let i = 0; i < parlays.length; i++) {
      for (let j = i + 1; j < parlays.length; j++) {
        const a = parlays[i], b = parlays[j];
        const aSet = new Set((a.legs ?? []).map(legSig));
        const shared = (b.legs ?? []).map(legSig).filter((s) => aSet.has(s));
        if (shared.length >= 2) {
          // Skip if it's a literal dupe (already reported)
          if (parlaySig(a.legs ?? []) === parlaySig(b.legs ?? [])) continue;
          nearDupes.push([a, b, shared]);
        }
      }
    }
    if (nearDupes.length > 0) {
      console.log(`  ⚠️  NEAR-DUPLICATES (>=2 shared legs):`);
      for (const [a, b, shared] of nearDupes) {
        console.log(`     rank ${a.slate_rank ?? "?"} <-> rank ${b.slate_rank ?? "?"} share ${shared.length} legs:`);
        for (const sig of shared) {
          console.log(`        · ${sig}`);
        }
      }
    }

    // Detect heavy single-leg reuse: same leg in 2+ parlays
    const legUsage = new Map<string, ParlayRow[]>();
    for (const p of parlays) {
      const seen = new Set<string>();
      for (const leg of p.legs ?? []) {
        const sig = legSig(leg);
        if (seen.has(sig)) continue;
        seen.add(sig);
        const arr = legUsage.get(sig) ?? [];
        arr.push(p);
        legUsage.set(sig, arr);
      }
    }
    const heavyLegs = [...legUsage.entries()].filter(([, arr]) => arr.length >= 2);
    if (heavyLegs.length > 0) {
      console.log(`  ⓘ  Single legs reused across parlays:`);
      for (const [sig, arr] of heavyLegs) {
        console.log(`     ${sig} — in ranks ${arr.map((p) => p.slate_rank ?? "?").join(", ")}`);
      }
    }

    // Detect missing gameId on legs (would defeat the diversity filter)
    let legsMissingGameId = 0, totalLegs = 0;
    for (const p of parlays) {
      for (const leg of p.legs ?? []) {
        totalLegs++;
        if (!leg.gameId) legsMissingGameId++;
      }
    }
    if (legsMissingGameId > 0) {
      console.log(`  ⓘ  Legs missing gameId: ${legsMissingGameId}/${totalLegs} — diversity filter falls back to game+pick keying for these`);
    }

    if (literalDupes.length === 0 && nearDupes.length === 0 && heavyLegs.length === 0) {
      console.log(`  ✓ no duplicates or heavy reuse`);
    }
    console.log();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
