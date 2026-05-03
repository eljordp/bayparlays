"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { AppNav } from "@/app/components/AppNav";
import { PicksTabs } from "@/app/components/PicksTabs";
import { useAuth } from "@/app/components/AuthProvider";

// ─── Types (mirrors /api/props response) ─────────────────────────────────────

interface PropRow {
  player: string;
  team: string;
  stat: string;
  average: number;
  typicalLine: number;
  edge: number;
  games: number;
  source?: "underdog" | "heuristic";
  overOdds?: number | null;
  underOdds?: number | null;
}

type Sport = "nba" | "wnba" | "mlb" | "nhl" | "nfl" | "mls" | "epl";

interface PropCategory {
  label: string;
  rows: PropRow[];
}

interface PropsResponse {
  sport: Sport;
  // NEW shape: categories is a dict of { label, rows }
  categories?: Record<string, PropCategory | PropRow[]>;
  updated: string;
  error?: string;
  // LEGACY top-level keys (NBA backwards-compat fallback)
  points?: PropRow[];
  rebounds?: PropRow[];
  assists?: PropRow[];
}

// Per-category display config. Drives unit labels, games-column label,
// average-column label, and the "how this works" blurb.
interface CategoryDisplay {
  unit: string;
  gamesLabel: string;
  averageLabel: string;
}

const CATEGORY_DISPLAY: Record<string, CategoryDisplay> = {
  // NBA
  points: { unit: "pts", gamesLabel: "GP", averageLabel: "Per game" },
  rebounds: { unit: "reb", gamesLabel: "GP", averageLabel: "Per game" },
  assists: { unit: "A", gamesLabel: "GP", averageLabel: "Per game" },
  threes: { unit: "3PM", gamesLabel: "GP", averageLabel: "Per game" },
  steals: { unit: "stl", gamesLabel: "GP", averageLabel: "Per game" },
  blocks: { unit: "blk", gamesLabel: "GP", averageLabel: "Per game" },
  // MLB
  pitcher_strikeouts: { unit: "K/9", gamesLabel: "GS", averageLabel: "K per 9" },
  batter_hits: { unit: "H", gamesLabel: "GP", averageLabel: "Per game" },
  batter_rbis: { unit: "RBI", gamesLabel: "GP", averageLabel: "Per game" },
  batter_home_runs: { unit: "HR", gamesLabel: "GP", averageLabel: "Per game" },
  batter_total_bases: { unit: "TB", gamesLabel: "GP", averageLabel: "Per game" },
  batter_stolen_bases: { unit: "SB", gamesLabel: "GP", averageLabel: "Per game" },
  batter_runs: { unit: "R", gamesLabel: "GP", averageLabel: "Per game" },
  season_wins: { unit: "W", gamesLabel: "GS", averageLabel: "Season total" },
  // NHL
  skater_goals: { unit: "G", gamesLabel: "GP", averageLabel: "Per game" },
  skater_points: { unit: "PTS", gamesLabel: "GP", averageLabel: "Per game" },
  skater_shots: { unit: "SOG", gamesLabel: "GP", averageLabel: "Per game" },
  skater_pim: { unit: "PIM", gamesLabel: "GP", averageLabel: "Per game" },
  skater_plus_minus: { unit: "+/-", gamesLabel: "GP", averageLabel: "Season total" },
  // NFL
  qb_passing_yards: { unit: "YDS", gamesLabel: "GP", averageLabel: "Per game" },
  qb_passing_tds: { unit: "TD", gamesLabel: "GP", averageLabel: "Per game" },
  rb_rushing_yards: { unit: "YDS", gamesLabel: "GP", averageLabel: "Per game" },
  wr_receiving_yards: { unit: "YDS", gamesLabel: "GP", averageLabel: "Per game" },
  wr_receptions: { unit: "REC", gamesLabel: "GP", averageLabel: "Per game" },
  wr_anytime_td: { unit: "TD", gamesLabel: "GP", averageLabel: "Per game" },
  // Soccer (MLS + EPL share keys)
  goals: { unit: "G", gamesLabel: "GP", averageLabel: "Per game" },
  shots_on_target: { unit: "SOT", gamesLabel: "GP", averageLabel: "Per game" },
  total_shots: { unit: "SH", gamesLabel: "GP", averageLabel: "Per game" },
};

const SPORT_LABELS: Record<Sport, string> = {
  nba: "NBA",
  wnba: "WNBA",
  mlb: "MLB",
  nhl: "NHL",
  nfl: "NFL",
  mls: "MLS",
  epl: "EPL",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Relative confidence from spec:
//   edge / typicalLine >= 0.15 → LOCK
//   edge / typicalLine >= 0.08 → STRONG
//   edge / typicalLine >= 0.04 → LEAN
//   else PASS
function confidenceFromRelativeEdge(
  edge: number,
  line: number,
): { label: string; className: string } {
  if (line <= 0 || !Number.isFinite(edge)) {
    return {
      label: "PASS",
      className: "bg-black/5 text-black/45 border border-black/10",
    };
  }
  const ratio = edge / line;
  if (ratio >= 0.15) {
    return {
      label: "LOCK",
      className: "bg-[#0a0a0a] text-white",
    };
  }
  if (ratio >= 0.08) {
    return {
      label: "STRONG",
      className: "bg-[#0a0a0a]/20 text-white border border-[#0a0a0a]/40",
    };
  }
  if (ratio >= 0.04) {
    return {
      label: "LEAN",
      className: "bg-yellow-500/15 text-yellow-400 border border-yellow-500/30",
    };
  }
  return {
    label: "PASS",
    className: "bg-black/5 text-black/45 border border-black/10",
  };
}

// Format numbers — fewer decimals for large, more for small
function formatAvg(v: number): string {
  if (v >= 10) return v.toFixed(1);
  if (v >= 1) return v.toFixed(2);
  return v.toFixed(3);
}

// Normalize legacy response (old NBA shape had top-level points/rebounds/assists
// arrays and no categories) into the new { label, rows } form.
function normalizeCategories(
  data: PropsResponse,
): Record<string, PropCategory> {
  const out: Record<string, PropCategory> = {};

  const raw = data.categories;
  if (raw) {
    for (const [key, value] of Object.entries(raw)) {
      if (Array.isArray(value)) {
        // Old shape: bare array per key
        out[key] = {
          label: CATEGORY_DISPLAY[key]?.unit
            ? prettyLabelFromKey(key)
            : prettyLabelFromKey(key),
          rows: value,
        };
      } else if (value && typeof value === "object" && "rows" in value) {
        out[key] = {
          label: value.label || prettyLabelFromKey(key),
          rows: value.rows || [],
        };
      }
    }
  }

  // Fallback: legacy top-level NBA keys
  if (Object.keys(out).length === 0) {
    if (data.points) out.points = { label: "Points", rows: data.points };
    if (data.rebounds)
      out.rebounds = { label: "Rebounds", rows: data.rebounds };
    if (data.assists) out.assists = { label: "Assists", rows: data.assists };
  }

  return out;
}

function prettyLabelFromKey(key: string): string {
  const map: Record<string, string> = {
    points: "Points",
    rebounds: "Rebounds",
    assists: "Assists",
    threes: "Threes",
    steals: "Steals",
    blocks: "Blocks",
    pitcher_strikeouts: "Pitcher Strikeouts",
    batter_hits: "Batter Hits",
    batter_rbis: "Batter RBIs",
    batter_home_runs: "Batter Home Runs",
    batter_total_bases: "Batter Total Bases",
    batter_stolen_bases: "Batter Stolen Bases",
    batter_runs: "Batter Runs",
    season_wins: "Pitcher Season Wins",
    skater_goals: "Skater Goals",
    skater_points: "Skater Points",
    skater_shots: "Shots on Goal",
    skater_pim: "Penalty Minutes",
    skater_plus_minus: "Plus / Minus",
    qb_passing_yards: "QB Passing Yards",
    qb_passing_tds: "QB Passing TDs",
    rb_rushing_yards: "RB Rushing Yards",
    wr_receiving_yards: "WR Receiving Yards",
    wr_receptions: "WR Receptions",
    wr_anytime_td: "WR Anytime TD",
    goals: "Goals",
    shots_on_target: "Shots on Target",
    total_shots: "Total Shots",
  };
  return map[key] || key.replace(/_/g, " ");
}

function defaultCategoryFor(sport: Sport): string {
  if (sport === "mlb") return "pitcher_strikeouts";
  if (sport === "nhl") return "skater_goals";
  if (sport === "nfl") return "qb_passing_yards";
  if (sport === "mls" || sport === "epl") return "goals";
  // NBA + WNBA both lead with points.
  return "points";
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function PropsPage() {
  const { isPro, tier, isAdmin } = useAuth();
  const [sport, setSport] = useState<Sport>("nba");
  const [data, setData] = useState<PropsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<string>("points");
  const [copied, setCopied] = useState<string | null>(null);

  // VIP+ gate — VIP, admin, owner, or explicit admin bypass
  const hasVipAccess = isAdmin || tier === "vip" || tier === "admin" || tier === "owner";

  const categories = useMemo<Record<string, PropCategory>>(
    () => (data ? normalizeCategories(data) : {}),
    [data],
  );

  const categoryKeys = useMemo<string[]>(
    () => Object.keys(categories),
    [categories],
  );

  const fetchProps = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/props?sport=${sport}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: PropsResponse = await res.json();
      if (json.error) throw new Error(json.error);
      setData(json);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load props");
    } finally {
      setLoading(false);
    }
  }, [sport]);

  useEffect(() => {
    fetchProps();
  }, [fetchProps]);

  // When sport changes OR data first loads for a sport, reset tab to the
  // first available category for that sport.
  useEffect(() => {
    const preferred = defaultCategoryFor(sport);
    if (categoryKeys.length === 0) return;
    if (categoryKeys.includes(tab)) return;
    setTab(
      categoryKeys.includes(preferred) ? preferred : categoryKeys[0],
    );
  }, [sport, categoryKeys, tab]);

  const currentCategory = categories[tab];
  const currentDisplay = CATEGORY_DISPLAY[tab] || {
    unit: "",
    gamesLabel: "GP",
    averageLabel: "Per game",
  };

  const rows: PropRow[] = currentCategory?.rows || [];
  const visibleRows = hasVipAccess ? rows : rows.slice(0, 3);
  const lockedRows = hasVipAccess ? [] : rows.slice(3);

  async function copyPick(row: PropRow) {
    const unit = currentDisplay.unit;
    const gamesLbl = currentDisplay.gamesLabel;
    const text = `${row.player} OVER ${row.typicalLine} ${unit} (${row.team}) — avg ${formatAvg(row.average)} over ${row.games} ${gamesLbl}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(`${tab}-${row.player}`);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // ignore
    }
  }

  const howItWorks = (() => {
    if (sport === "nba" || sport === "wnba") {
      const leagueBits =
        sport === "nba" ? (
          <>
            Example: if LeBron averages{" "}
            <span className="text-[#0a0a0a] font-medium">27 PPG</span>, his{" "}
            <span className="text-[#0a0a0a] font-medium">
              over 24.5 points
            </span>{" "}
            prop has an 80%+ hit rate historically.
          </>
        ) : (
          <>
            Example: if A&apos;ja Wilson averages{" "}
            <span className="text-[#0a0a0a] font-medium">23 PPG</span>, her{" "}
            <span className="text-[#0a0a0a] font-medium">
              over 20.5 points
            </span>{" "}
            prop has a strong historical hit rate.
          </>
        );
      return (
        <>
          These are players whose season averages significantly exceed typical
          prop lines. {leagueBits} We flag the biggest gaps across the league.
        </>
      );
    }
    if (sport === "mls" || sport === "epl") {
      return (
        <>
          Soccer props from season totals — per-game goals and assists for{" "}
          <span className="text-[#0a0a0a] font-medium">
            anytime goalscorer / anytime assist
          </span>{" "}
          bets, plus shots and shots-on-target for volume shooters. Lines stay
          at 0.5 for goals/assists (the standard book shape); shot lines step
          with the per-game average.
        </>
      );
    }
    if (sport === "mlb") {
      return (
        <>
          MLB props from season totals — pitcher K/9 vs typical strikeout
          lines, per-game hits/RBIs, and per-game HR rate for{" "}
          <span className="text-[#0a0a0a] font-medium">anytime HR</span> bets.
          Small samples (early April) get sample-size adjusted edge.
        </>
      );
    }
    if (sport === "nhl") {
      return (
        <>
          NHL props from season totals — per-game goals, points, and shots on
          goal. Great for{" "}
          <span className="text-[#0a0a0a] font-medium">anytime goal</span> bets
          and over-shot picks on high-volume shooters.
        </>
      );
    }
    return (
      <>
        NFL props from the last full regular season — QB passing yards + TDs,
        RB rushing yards, WR receiving yards, receptions, and{" "}
        <span className="text-[#0a0a0a] font-medium">anytime TD</span> bets on
        high-volume targets. Sportsbook-style lines rounded to 5-yard steps.
      </>
    );
  })();

  return (
    <div className="min-h-screen bg-[#FAFAF7] text-[#0a0a0a]">
      <AppNav />
      <div className="pt-20">
        <PicksTabs />
      </div>

      <main className="mx-auto max-w-[1400px] px-4 py-10 md:px-5 md:py-16">
        {/* ─── Header ─────────────────────────────────────────────────── */}
        <div className="mb-10 md:mb-14">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#0a0a0a]">
              Prop Analyzer
            </span>
            <span className="h-px flex-1 bg-black/10 max-w-[120px]" />
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full bg-yellow-500/15 text-yellow-400">
              VIP
            </span>
          </div>
          <h1
            className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl leading-[1.05]"
            style={{ fontFamily: "'DM Serif Display', serif" }}
          >
            Player Props
          </h1>
          <p className="mt-4 max-w-2xl text-base text-black/55 leading-relaxed">
            Top statistical picks based on season averages. Combine these with
            moneyline parlays for high-probability locks.
            {data?.updated && (
              <span className="block mt-1 text-xs text-black/45">
                Updated{" "}
                {new Date(data.updated).toLocaleTimeString("en-US", {
                  hour: "numeric",
                  minute: "2-digit",
                  hour12: true,
                })}
              </span>
            )}
          </p>
        </div>

        {/* ─── Sport Toggle ───────────────────────────────────────────── */}
        <div className="mb-6 inline-flex flex-wrap rounded-lg border border-black/[0.08] bg-white p-1">
          {(
            ["nba", "wnba", "mlb", "nhl", "nfl", "mls", "epl"] as Sport[]
          ).map((s) => {
            const active = sport === s;
            return (
              <button
                key={s}
                onClick={() => setSport(s)}
                className={`rounded-md px-5 py-2 text-xs font-bold uppercase tracking-[0.15em] transition ${
                  active
                    ? "bg-[#0a0a0a] text-white"
                    : "text-black/55 hover:text-black"
                }`}
              >
                {SPORT_LABELS[s]}
              </button>
            );
          })}
        </div>

        {/* ─── How This Works Card ────────────────────────────────────── */}
        <div className="mb-10 rounded-xl border border-black/[0.06] bg-gradient-to-br from-[#0a0a0a]/[0.04] to-transparent px-5 py-5 md:px-7 md:py-6">
          <div className="flex items-start gap-4">
            <div className="mt-1 h-10 w-10 rounded-lg bg-[#0a0a0a]/15 flex items-center justify-center shrink-0">
              <span className="text-[#0a0a0a] text-lg font-bold">?</span>
            </div>
            <div>
              <h3
                className="text-lg font-semibold text-[#0a0a0a]"
                style={{ fontFamily: "'DM Serif Display', serif" }}
              >
                How this works
              </h3>
              <p className="mt-1.5 text-sm text-black/60 leading-relaxed">
                {howItWorks}
              </p>
            </div>
          </div>
        </div>

        {/* ─── Stat Tabs ──────────────────────────────────────────────── */}
        {categoryKeys.length > 0 && (
          <div className="mb-8 flex gap-2 overflow-x-auto scrollbar-hide">
            {categoryKeys.map((k) => {
              const cat = categories[k];
              const active = tab === k;
              return (
                <button
                  key={k}
                  onClick={() => setTab(k)}
                  className={`rounded-lg px-5 py-3 text-sm font-semibold transition whitespace-nowrap ${
                    active
                      ? "bg-[#0a0a0a] text-white"
                      : "bg-black/[0.04] text-black/60 hover:bg-black/[0.08] hover:text-black"
                  }`}
                >
                  <div>{cat.label}</div>
                  <div
                    className={`text-[10px] font-normal ${
                      active ? "text-[#0a0a0a]/60" : "text-black/45"
                    }`}
                  >
                    Top {cat.rows.length || 10}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* ─── Loading State ──────────────────────────────────────────── */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-32">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-black/10 border-t-[#0a0a0a]" />
            <p className="mt-4 text-sm text-black/45">
              Pulling {SPORT_LABELS[sport]} season stats from ESPN...
            </p>
          </div>
        )}

        {/* ─── Error State ────────────────────────────────────────────── */}
        {!loading && error && (
          <div className="flex flex-col items-center justify-center py-32">
            <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-6 py-4 text-center">
              <p className="text-sm text-red-400">{error}</p>
              <button
                onClick={fetchProps}
                className="mt-3 text-xs text-black/50 underline hover:text-black"
              >
                Try again
              </button>
            </div>
          </div>
        )}

        {/* ─── Empty State ────────────────────────────────────────────── */}
        {!loading && !error && rows.length === 0 && (
          <div className="flex flex-col items-center justify-center py-32">
            <p className="text-lg text-black/35">
              No {(currentCategory?.label || "").toLowerCase()} data available
              right now.
            </p>
            <p className="mt-2 text-sm text-black/25">
              {sport === "nba"
                ? "Check back after tonight's games."
                : "Check back after today's games."}
            </p>
          </div>
        )}

        {/* ─── Prop Cards ─────────────────────────────────────────────── */}
        {!loading && !error && rows.length > 0 && (
          <div className="grid gap-3 md:gap-4">
            {visibleRows.map((row, i) => {
              const conf = confidenceFromRelativeEdge(
                row.edge,
                row.typicalLine,
              );
              const isCopied = copied === `${tab}-${row.player}`;
              return (
                <div
                  key={`${row.player}-${i}`}
                  className="group grid grid-cols-12 gap-3 md:gap-6 items-center rounded-xl border border-black/[0.06] bg-gradient-to-r from-black/[0.02] to-transparent px-4 py-5 md:px-7 md:py-6 hover:border-black/[0.16] transition-colors"
                >
                  {/* Rank */}
                  <div className="col-span-1 text-black/35 font-mono text-sm md:text-base">
                    {String(i + 1).padStart(2, "0")}
                  </div>

                  {/* Player + team */}
                  <div className="col-span-6 md:col-span-4">
                    <div
                      className="text-base md:text-xl font-bold text-[#0a0a0a] leading-tight"
                      style={{ fontFamily: "'DM Serif Display', serif" }}
                    >
                      {row.player}
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-black/[0.06] text-black/60">
                        {row.team || "—"}
                      </span>
                      <span className="text-[11px] text-black/45">
                        {row.games} {currentDisplay.gamesLabel}
                      </span>
                    </div>
                  </div>

                  {/* Average */}
                  <div className="col-span-5 md:col-span-3 text-right md:text-left">
                    <div className="text-[10px] uppercase tracking-wider text-black/45 mb-1">
                      {currentDisplay.averageLabel}
                    </div>
                    <div
                      className="text-3xl md:text-4xl font-bold text-[#0a0a0a] leading-none font-mono"
                      style={{ fontFamily: "'Geist Mono', monospace" }}
                    >
                      {formatAvg(row.average)}
                    </div>
                  </div>

                  {/* Line */}
                  <div className="hidden md:block md:col-span-2">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-[10px] uppercase tracking-wider text-black/45">
                        {row.source === "underdog" ? "Underdog line" : "Typical line"}
                      </span>
                      {row.source === "underdog" && (
                        <span
                          className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                          style={{
                            background: "rgba(34,197,94,0.12)",
                            color: "#22c55e",
                            border: "1px solid rgba(34,197,94,0.25)",
                          }}
                          title="Real market line from Underdog Fantasy"
                        >
                          LIVE
                        </span>
                      )}
                    </div>
                    <div
                      className="text-lg font-semibold text-black/80"
                      style={{ fontFamily: "'Geist Mono', monospace" }}
                    >
                      O {row.typicalLine}
                    </div>
                    <div className="text-[11px] text-black/50 mt-0.5">
                      {currentDisplay.unit}
                      {row.source === "underdog" && row.overOdds !== null && row.overOdds !== undefined && (
                        <> · O {row.overOdds > 0 ? "+" : ""}{row.overOdds}</>
                      )}
                    </div>
                  </div>

                  {/* Confidence + copy */}
                  <div className="col-span-12 md:col-span-2 flex md:flex-col items-center md:items-end gap-2 md:gap-2.5 pt-3 md:pt-0 border-t md:border-t-0 border-black/[0.04]">
                    <span
                      className={`text-[10px] font-bold uppercase tracking-[0.15em] px-2.5 py-1 rounded-full ${conf.className}`}
                    >
                      {conf.label}
                    </span>
                    <button
                      onClick={() => copyPick(row)}
                      className="text-[11px] text-black/50 hover:text-black transition-colors underline-offset-2 hover:underline md:hidden"
                    >
                      {isCopied ? "Copied" : "Copy pick"}
                    </button>
                    <button
                      onClick={() => copyPick(row)}
                      className="hidden md:inline text-[11px] text-black/50 hover:text-[#0a0a0a] transition-colors"
                    >
                      {isCopied ? "Copied" : "Copy pick"}
                    </button>
                    {row.source === "underdog" && (
                      <a
                        href="https://underdogfantasy.com/pick-em/higher-lower"
                        target="_blank"
                        rel="noopener noreferrer sponsored"
                        className="hidden md:inline text-[11px] text-[#22c55e]/70 hover:text-[#22c55e] transition-colors"
                        title="Place this pick at Underdog Fantasy"
                      >
                        Bet on Underdog →
                      </a>
                    )}

                    {/* Mobile line row */}
                    <div className="md:hidden ml-auto text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <span className="text-[10px] uppercase tracking-wider text-black/45">
                          {row.source === "underdog" ? "Underdog" : "Line"}
                        </span>
                        {row.source === "underdog" && (
                          <span
                            className="text-[8px] font-bold uppercase tracking-wider px-1 py-px rounded"
                            style={{
                              background: "rgba(34,197,94,0.12)",
                              color: "#22c55e",
                              border: "1px solid rgba(34,197,94,0.25)",
                            }}
                          >
                            LIVE
                          </span>
                        )}
                      </div>
                      <div
                        className="text-sm font-semibold text-black/80"
                        style={{ fontFamily: "'Geist Mono', monospace" }}
                      >
                        O {row.typicalLine}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* ─── Locked rows (non-VIP preview) ─────────────────────── */}
            {lockedRows.length > 0 && (
              <div className="relative mt-6 rounded-xl border border-black/[0.06] bg-[#0a0a0a] overflow-hidden">
                {/* Blurred preview underneath */}
                <div className="pointer-events-none select-none blur-sm opacity-40">
                  {lockedRows.map((row, i) => (
                    <div
                      key={`locked-${row.player}-${i}`}
                      className="grid grid-cols-12 gap-3 md:gap-6 items-center px-4 py-5 md:px-7 md:py-6 border-b border-black/[0.04] last:border-b-0"
                    >
                      <div className="col-span-1 text-black/35 font-mono text-sm">
                        {String(i + 4).padStart(2, "0")}
                      </div>
                      <div className="col-span-6 md:col-span-4">
                        <div className="text-base md:text-xl font-bold">
                          {row.player}
                        </div>
                        <div className="text-[11px] text-black/45 mt-1">
                          {row.team} · {row.games} {currentDisplay.gamesLabel}
                        </div>
                      </div>
                      <div className="col-span-5 md:col-span-3 text-right md:text-left">
                        <div className="text-3xl md:text-4xl font-bold text-[#0a0a0a]">
                          {formatAvg(row.average)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Upgrade overlay */}
                <div className="absolute inset-0 flex flex-col items-center justify-center px-6 py-10 text-center bg-gradient-to-b from-[#0a0a0a]/60 via-[#0a0a0a]/90 to-[#0a0a0a]">
                  <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-yellow-400 mb-3">
                    VIP Exclusive
                  </div>
                  <h3
                    className="text-2xl md:text-3xl font-bold text-[#0a0a0a]"
                    style={{ fontFamily: "'DM Serif Display', serif" }}
                  >
                    {lockedRows.length} more locks waiting
                  </h3>
                  <p className="mt-2 text-sm text-black/55 max-w-md">
                    Full prop analyzer — all 10 picks per category, updated every
                    6 hours. Stack with parlays for compounding edge.
                  </p>
                  <Link
                    href="/subscribe"
                    className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#0a0a0a] px-6 py-3 text-sm font-semibold text-white hover:bg-[#FF5252] transition-colors"
                  >
                    Upgrade to VIP
                    <span aria-hidden>→</span>
                  </Link>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ─── Footer Disclaimer ──────────────────────────────────────── */}
        <div className="mt-16 md:mt-24 border-t border-black/[0.06] pt-8 pb-4">
          <p className="text-xs text-black/45 leading-relaxed max-w-3xl">
            <span className="text-black/55 font-semibold">Disclaimer —</span>{" "}
            Season averages. Actual prop lines and odds vary by sportsbook.
            Combine with moneyline parlays for stacked probability. Past
            performance does not guarantee future results. Bet responsibly.
          </p>
          <p className="mt-2 text-[11px] text-black/35">
            Data: ESPN public API. Cached 6 hours.
            {!hasVipAccess && !loading && isPro && (
              <span className="ml-2">
                Sharp tier shows top 3 per category.{" "}
                <Link
                  href="/subscribe"
                  className="text-[#0a0a0a] hover:underline"
                >
                  Upgrade to VIP
                </Link>{" "}
                for full picks.
              </span>
            )}
          </p>
        </div>
      </main>
    </div>
  );
}
