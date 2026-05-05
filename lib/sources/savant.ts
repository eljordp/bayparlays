// Baseball Savant Statcast leaderboard fetcher.
//
// Savant publishes season-to-date expected stats (xWOBA, xBA, xSLG, xERA)
// as CSV from their public leaderboard endpoint. These are the canonical
// Statcast metrics — paid services like Stathead / Baseball Savant Pro
// expose the same data with better UI but the underlying numbers are free.
//
// Two leaderboards we use:
//   1. expected_statistics — xBA / xSLG / xWOBA / xERA + diffs to actual
//   2. statcast (exit_velocity_barrels) — exit velocity, barrels, hard-hit %
//
// Player IDs are MLB AM IDs, the same ones used by the MLB Stats API
// `probablePitcher.id` field — so cross-referencing the existing
// pitcher-note pipeline at /api/parlays is trivial.

export interface StatcastPitcher {
  player_id: number;
  player_name: string;
  season: number;
  pa: number | null;
  bip: number | null;
  ba: number | null;
  est_ba: number | null;
  est_ba_diff: number | null;
  slg: number | null;
  est_slg: number | null;
  est_slg_diff: number | null;
  woba: number | null;
  est_woba: number | null;
  est_woba_diff: number | null;
  era: number | null;
  xera: number | null;
  era_xera_diff: number | null;
}

export interface StatcastBatter {
  player_id: number;
  player_name: string;
  season: number;
  pa: number | null;
  bip: number | null;
  ba: number | null;
  est_ba: number | null;
  est_ba_diff: number | null;
  slg: number | null;
  est_slg: number | null;
  est_slg_diff: number | null;
  woba: number | null;
  est_woba: number | null;
  est_woba_diff: number | null;
  avg_hit_speed: number | null;
  max_hit_speed: number | null;
  barrels: number | null;
  barrel_pct: number | null;
  hard_hit_pct: number | null;
}

const SAVANT_BASE = "https://baseballsavant.mlb.com/leaderboard";

// CSV parser — Savant's CSV is RFC-4180-ish: comma-separated, quoted
// fields, embedded commas inside quotes. The expected_statistics export
// returns "Last, First" with an internal comma so we can't naively split.
function parseCSV(text: string): string[][] {
  // Strip BOM if present (Savant adds one to expected_statistics).
  const clean = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let current: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (inQuotes) {
      if (c === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === ",") {
        current.push(field);
        field = "";
      } else if (c === "\n") {
        current.push(field);
        rows.push(current);
        current = [];
        field = "";
      } else if (c === "\r") {
        // skip
      } else {
        field += c;
      }
    }
  }
  if (field.length > 0 || current.length > 0) {
    current.push(field);
    rows.push(current);
  }
  return rows;
}

function parseNum(s: string): number | null {
  if (s === "" || s === undefined) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function parseInt0(s: string): number | null {
  const n = parseNum(s);
  return n === null ? null : Math.round(n);
}

async function fetchSavantCsv(url: string): Promise<string[][]> {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      Accept: "text/csv,*/*",
    },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Savant ${url} HTTP ${res.status}`);
  }
  const text = await res.text();
  return parseCSV(text);
}

// Build column-name → index lookup from the header row so we don't depend
// on positional ordering (Savant occasionally reorders columns).
function indexHeader(header: string[]): Record<string, number> {
  const idx: Record<string, number> = {};
  header.forEach((name, i) => {
    idx[name.trim().toLowerCase().replace(/\s+/g, "_")] = i;
  });
  return idx;
}

export async function fetchPitcherExpectedStats(
  season: number = new Date().getFullYear(),
): Promise<StatcastPitcher[]> {
  const url =
    `${SAVANT_BASE}/expected_statistics?type=pitcher&year=${season}` +
    `&position=&team=&filterType=bip&min=q&csv=true`;
  const rows = await fetchSavantCsv(url);
  if (rows.length < 2) return [];
  const header = indexHeader(rows[0]);
  const out: StatcastPitcher[] = [];
  for (const row of rows.slice(1)) {
    const id = parseInt0(row[header["player_id"] ?? -1]);
    if (id === null) continue;
    out.push({
      player_id: id,
      player_name: row[header["last_name,_first_name"] ?? -1] ?? "",
      season,
      pa: parseInt0(row[header["pa"] ?? -1]),
      bip: parseInt0(row[header["bip"] ?? -1]),
      ba: parseNum(row[header["ba"] ?? -1]),
      est_ba: parseNum(row[header["est_ba"] ?? -1]),
      est_ba_diff: parseNum(row[header["est_ba_minus_ba_diff"] ?? -1]),
      slg: parseNum(row[header["slg"] ?? -1]),
      est_slg: parseNum(row[header["est_slg"] ?? -1]),
      est_slg_diff: parseNum(row[header["est_slg_minus_slg_diff"] ?? -1]),
      woba: parseNum(row[header["woba"] ?? -1]),
      est_woba: parseNum(row[header["est_woba"] ?? -1]),
      est_woba_diff: parseNum(row[header["est_woba_minus_woba_diff"] ?? -1]),
      era: parseNum(row[header["era"] ?? -1]),
      xera: parseNum(row[header["xera"] ?? -1]),
      era_xera_diff: parseNum(row[header["era_minus_xera_diff"] ?? -1]),
    });
  }
  return out;
}

export async function fetchBatterExpectedStats(
  season: number = new Date().getFullYear(),
): Promise<Array<Omit<StatcastBatter, "avg_hit_speed" | "max_hit_speed" | "barrels" | "barrel_pct" | "hard_hit_pct">>> {
  const url =
    `${SAVANT_BASE}/expected_statistics?type=batter&year=${season}` +
    `&position=&team=&filterType=bip&min=q&csv=true`;
  const rows = await fetchSavantCsv(url);
  if (rows.length < 2) return [];
  const header = indexHeader(rows[0]);
  const out: Array<Omit<StatcastBatter, "avg_hit_speed" | "max_hit_speed" | "barrels" | "barrel_pct" | "hard_hit_pct">> = [];
  for (const row of rows.slice(1)) {
    const id = parseInt0(row[header["player_id"] ?? -1]);
    if (id === null) continue;
    out.push({
      player_id: id,
      player_name: row[header["last_name,_first_name"] ?? -1] ?? "",
      season,
      pa: parseInt0(row[header["pa"] ?? -1]),
      bip: parseInt0(row[header["bip"] ?? -1]),
      ba: parseNum(row[header["ba"] ?? -1]),
      est_ba: parseNum(row[header["est_ba"] ?? -1]),
      est_ba_diff: parseNum(row[header["est_ba_minus_ba_diff"] ?? -1]),
      slg: parseNum(row[header["slg"] ?? -1]),
      est_slg: parseNum(row[header["est_slg"] ?? -1]),
      est_slg_diff: parseNum(row[header["est_slg_minus_slg_diff"] ?? -1]),
      woba: parseNum(row[header["woba"] ?? -1]),
      est_woba: parseNum(row[header["est_woba"] ?? -1]),
      est_woba_diff: parseNum(row[header["est_woba_minus_woba_diff"] ?? -1]),
    });
  }
  return out;
}

export async function fetchBatterExitVelocity(
  season: number = new Date().getFullYear(),
): Promise<Map<number, { avg_hit_speed: number | null; max_hit_speed: number | null; barrels: number | null; barrel_pct: number | null; hard_hit_pct: number | null }>> {
  const url =
    `${SAVANT_BASE}/statcast?type=batter&year=${season}` +
    `&position=&team=&min=q&csv=true`;
  const rows = await fetchSavantCsv(url);
  const out = new Map<number, ReturnType<typeof parseRow>>();
  if (rows.length < 2) return out;
  const header = indexHeader(rows[0]);
  function parseRow(row: string[]) {
    return {
      avg_hit_speed: parseNum(row[header["avg_hit_speed"] ?? -1]),
      max_hit_speed: parseNum(row[header["max_hit_speed"] ?? -1]),
      barrels: parseInt0(row[header["barrels"] ?? -1]),
      barrel_pct: parseNum(row[header["brl_percent"] ?? -1]),
      hard_hit_pct: parseNum(row[header["ev95percent"] ?? -1]),
    };
  }
  for (const row of rows.slice(1)) {
    const id = parseInt0(row[header["player_id"] ?? -1]);
    if (id === null) continue;
    out.set(id, parseRow(row));
  }
  return out;
}

// Convenience: fetches both batter leaderboards and merges into the full
// StatcastBatter shape.
export async function fetchBatterFull(
  season: number = new Date().getFullYear(),
): Promise<StatcastBatter[]> {
  const [expected, ev] = await Promise.all([
    fetchBatterExpectedStats(season),
    fetchBatterExitVelocity(season),
  ]);
  return expected.map((b) => {
    const evRow = ev.get(b.player_id);
    return {
      ...b,
      avg_hit_speed: evRow?.avg_hit_speed ?? null,
      max_hit_speed: evRow?.max_hit_speed ?? null,
      barrels: evRow?.barrels ?? null,
      barrel_pct: evRow?.barrel_pct ?? null,
      hard_hit_pct: evRow?.hard_hit_pct ?? null,
    };
  });
}
