// One-shot cleanup: archive literal-duplicate parlays so they stop
// polluting /results stats. Across all slates in history.
//
// Definition of "literal duplicate": two parlays in the same slate with
// the exact same set of legs (gameId+pick combination, order-insensitive).
// Near-duplicates (parlays sharing 2-3 legs) are NOT touched — those are
// real but correlated picks; killing them would erase legitimate history.
//
// For each duplicate set, the canonical row to keep is chosen by:
//   1. Highest confidence (the AI's true-prob estimate)
//   2. Tiebreak: earliest created_at (the row that "won the race")
//
// All other rows get archived_at=now(). /results filters out
// archived_at IS NOT NULL so they don't count toward win rate, ROI, or
// recent parlays. The rows stay in the DB for forensics — we don't
// delete history. Status column stays untouched (won/lost/pending), so
// the original outcome is preserved alongside the archive flag.
//
// Usage:
//   npx tsx scripts/archive-duplicate-parlays.ts          # dry run (no writes)
//   npx tsx scripts/archive-duplicate-parlays.ts --execute  # actually archive

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

const EXECUTE = process.argv.includes("--execute");

interface Leg {
  game?: string;
  pick?: string;
  gameId?: string;
}

interface ParlayRow {
  id: string;
  slate_id: string | null;
  created_at: string;
  legs: Leg[];
  confidence: number | null;
  status: string;
  combined_odds: string;
}

function legSig(leg: Leg): string {
  const id = leg.gameId ?? leg.game ?? "?";
  return `${id}::${leg.pick ?? "?"}`;
}

function parlaySig(legs: Leg[]): string {
  return [...legs.map(legSig)].sort().join(" | ");
}

async function fetchAllParlays(): Promise<ParlayRow[]> {
  const all: ParlayRow[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("parlays")
      .select("id, slate_id, created_at, legs, confidence, status, combined_odds")
      .order("created_at", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...(data as ParlayRow[]));
    if (data.length < PAGE) break;
  }
  return all;
}

async function main() {
  console.log(EXECUTE ? "🔧 EXECUTE mode — will write to DB" : "👀 DRY RUN — no writes, pass --execute to commit");
  console.log();

  const all = await fetchAllParlays();
  console.log(`Total parlays in DB: ${all.length}`);

  // Group by slate_id (rows without slate_id are pre-slate; skip them)
  const bySlate = new Map<string, ParlayRow[]>();
  let noSlateCount = 0;
  for (const p of all) {
    if (!p.slate_id) {
      noSlateCount++;
      continue;
    }
    const arr = bySlate.get(p.slate_id) ?? [];
    arr.push(p);
    bySlate.set(p.slate_id, arr);
  }
  console.log(`Slates: ${bySlate.size}   |   Pre-slate rows skipped: ${noSlateCount}`);
  console.log();

  // For each slate, find duplicate sets
  const idsToArchive: string[] = [];
  let slatesWithDupes = 0;

  for (const [slateId, parlays] of bySlate.entries()) {
    const sigGroups = new Map<string, ParlayRow[]>();
    for (const p of parlays) {
      const sig = parlaySig(p.legs ?? []);
      if (!sig) continue;
      const arr = sigGroups.get(sig) ?? [];
      arr.push(p);
      sigGroups.set(sig, arr);
    }

    const dupGroups = [...sigGroups.values()].filter((g) => g.length > 1);
    if (dupGroups.length === 0) continue;
    slatesWithDupes++;

    console.log(`━━━ ${slateId} (${parlays.length} rows, ${dupGroups.length} duplicate sets)`);
    for (const group of dupGroups) {
      // Keep the canonical row: highest confidence, tiebreak earliest created_at
      const sorted = [...group].sort((a, b) => {
        const ca = a.confidence ?? 0, cb = b.confidence ?? 0;
        if (cb !== ca) return cb - ca;
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      });
      const keeper = sorted[0];
      const losers = sorted.slice(1);

      const legPreview = (keeper.legs ?? []).slice(0, 2).map((l) => l.pick).join(" / ");
      console.log(`  × ${group.length} copies — ${keeper.combined_odds}  (${legPreview}…)`);
      console.log(`     keep:    ${keeper.id.slice(0, 8)}  conf=${keeper.confidence}  status=${keeper.status}  ${keeper.created_at}`);
      for (const l of losers) {
        console.log(`     archive: ${l.id.slice(0, 8)}  conf=${l.confidence}  status=${l.status}  ${l.created_at}`);
        idsToArchive.push(l.id);
      }
    }
    console.log();
  }

  console.log("━━━ summary ━━━");
  console.log(`Slates with literal duplicates: ${slatesWithDupes}`);
  console.log(`Rows to archive:                 ${idsToArchive.length}`);

  // Sanity: how many of those are already resolved (won/lost)?
  const resolvedToArchive = all.filter(
    (p) => idsToArchive.includes(p.id) && (p.status === "won" || p.status === "lost"),
  );
  if (resolvedToArchive.length > 0) {
    console.log(`  ⓘ  ${resolvedToArchive.length} of those already resolved (won/lost). Archiving still strips them from /results stats — they were duplicates double-counting the same outcome.`);
  }

  if (!EXECUTE) {
    console.log();
    console.log("Pass --execute to apply.");
    return;
  }

  // Batch the update — Supabase has limits on .in() so chunk by 200
  console.log();
  console.log(`Archiving ${idsToArchive.length} rows...`);
  const CHUNK = 200;
  let archived = 0;
  const now = new Date().toISOString();
  for (let i = 0; i < idsToArchive.length; i += CHUNK) {
    const chunk = idsToArchive.slice(i, i + CHUNK);
    const { error, count } = await supabase
      .from("parlays")
      .update({ archived_at: now }, { count: "exact" })
      .in("id", chunk);
    if (error) {
      console.error(`  chunk ${i / CHUNK + 1} failed: ${error.message}`);
      continue;
    }
    archived += count ?? 0;
    process.stdout.write(`  ${archived}/${idsToArchive.length}\r`);
  }
  console.log();
  console.log(`✓ Archived ${archived} rows.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
