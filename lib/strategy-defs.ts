// Shared strategy definitions — used by both the comparison endpoint
// (/api/track/strategies) and the detail endpoint (/api/track/strategies/[id]).
//
// Adding a new strategy: add an entry here, both routes pick it up.
//
// Strategies are organized by dimension:
//   - sport       (which leagues are in the parlay)
//   - confidence  (how sure the model claims to be)
//   - structure   (leg count)
// Comparison page groups by dimension so users compare apples-to-apples.
// "Total" is left as a separate dimension for the all-up baseline if needed.

export interface ParlayLike {
  status: string;
  confidence: number | null;
  legs_total: number | null;
  sports: string[] | null;
  combined_decimal: number | null;
  archived_at: string | null;
  created_at: string;
}

export type StrategyDimension = "sport" | "confidence" | "structure";

export interface StrategyDef {
  id: string;
  name: string;
  description: string;
  dimension: StrategyDimension;
  predicate: (p: ParlayLike) => boolean;
}

const sportContains = (target: string) => (p: ParlayLike) =>
  Array.isArray(p.sports) && p.sports.some((s) => s.toUpperCase() === target);

const sportOnly = (target: string) => (p: ParlayLike) =>
  Array.isArray(p.sports) &&
  p.sports.length > 0 &&
  p.sports.every((s) => s.toUpperCase() === target);

export const STRATEGIES: StrategyDef[] = [
  // ── Sport ─────────────────────────────────────────────────────────
  {
    id: "mlb-only",
    name: "MLB Only",
    description:
      "Every leg is MLB. Where the model has the deepest data (weather + pitchers).",
    dimension: "sport",
    predicate: sportOnly("MLB"),
  },
  {
    id: "nba-anywhere",
    name: "NBA In The Mix",
    description: "Any parlay with at least one NBA leg.",
    dimension: "sport",
    predicate: sportContains("NBA"),
  },
  {
    id: "nhl-anywhere",
    name: "NHL In The Mix",
    description: "Any parlay with at least one NHL leg.",
    dimension: "sport",
    predicate: sportContains("NHL"),
  },

  // ── Confidence ────────────────────────────────────────────────────
  {
    id: "high-conf",
    name: "High Confidence",
    description: "50%+ confidence picks. The model's strongest convictions.",
    dimension: "confidence",
    predicate: (p) => (p.confidence ?? 0) >= 50,
  },
  {
    id: "sweet-spot",
    name: "Sweet Spot",
    description: "35-50% confidence + 2-leg only. Steady hitter for $10 bettors.",
    dimension: "confidence",
    predicate: (p) =>
      (p.confidence ?? 0) >= 35 &&
      (p.confidence ?? 0) < 50 &&
      (p.legs_total ?? 0) === 2,
  },
  {
    id: "balanced-3-leg",
    name: "Balanced 3-Leg",
    description: "20-35% confidence + 3 legs. Mid-risk, mid-reward.",
    dimension: "confidence",
    predicate: (p) =>
      (p.confidence ?? 0) >= 20 &&
      (p.confidence ?? 0) < 35 &&
      (p.legs_total ?? 0) === 3,
  },
  {
    id: "longshot-lab",
    name: "Longshot Lab",
    description: "Under 20% confidence. Lottery-ticket EV play.",
    dimension: "confidence",
    predicate: (p) => (p.confidence ?? 0) > 0 && (p.confidence ?? 0) < 20,
  },

  // ── Structure ─────────────────────────────────────────────────────
  {
    id: "two-leg",
    name: "2-Leg Only",
    description: "Two legs total. Highest hit rate, modest payouts.",
    dimension: "structure",
    predicate: (p) => (p.legs_total ?? 0) === 2,
  },
  {
    id: "three-leg",
    name: "3-Leg Only",
    description: "Three legs total. Balanced risk/reward.",
    dimension: "structure",
    predicate: (p) => (p.legs_total ?? 0) === 3,
  },
  {
    id: "big-leg",
    name: "Big Leg (4+)",
    description: "4+ legs. Highest payouts, biggest variance.",
    dimension: "structure",
    predicate: (p) => (p.legs_total ?? 0) >= 4,
  },
];

export function getStrategy(id: string): StrategyDef | undefined {
  return STRATEGIES.find((s) => s.id === id);
}
