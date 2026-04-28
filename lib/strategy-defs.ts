// Shared strategy definitions — used by both the comparison endpoint
// (/api/track/strategies) and the detail endpoint (/api/track/strategies/[id]).
//
// Adding a new strategy: add an entry here, both routes pick it up.

export interface ParlayLike {
  status: string;
  confidence: number | null;
  legs_total: number | null;
  sports: string[] | null;
  combined_decimal: number | null;
  archived_at: string | null;
  created_at: string;
}

export interface StrategyDef {
  id: string;
  name: string;
  description: string;
  predicate: (p: ParlayLike) => boolean;
  isSweetSpot?: boolean;
}

const sportContains = (target: string) => (p: ParlayLike) =>
  Array.isArray(p.sports) && p.sports.some((s) => s.toUpperCase() === target);

export const STRATEGIES: StrategyDef[] = [
  {
    id: "sweet-spot",
    name: "Sweet Spot",
    description:
      "35-50% confidence + 2-leg only. Steady hitter for $10 bettors.",
    predicate: (p) =>
      (p.confidence ?? 0) >= 35 &&
      (p.confidence ?? 0) < 50 &&
      (p.legs_total ?? 0) === 2,
    isSweetSpot: true,
  },
  {
    id: "big-leg",
    name: "Big Leg",
    description: "4+ legs. Highest payouts, biggest variance.",
    predicate: (p) => (p.legs_total ?? 0) >= 4,
  },
  {
    id: "longshot-lab",
    name: "Longshot Lab",
    description: "Under 20% confidence. Lottery-ticket EV play.",
    predicate: (p) => (p.confidence ?? 0) > 0 && (p.confidence ?? 0) < 20,
  },
  {
    id: "balanced-3-leg",
    name: "Balanced 3-Leg",
    description: "20-35% confidence + 3 legs. Mid-risk, mid-reward.",
    predicate: (p) =>
      (p.confidence ?? 0) >= 20 &&
      (p.confidence ?? 0) < 35 &&
      (p.legs_total ?? 0) === 3,
  },
  {
    id: "mlb-only",
    name: "MLB Only",
    description:
      "Every parlay where every leg is MLB. Where the model has the deepest data.",
    predicate: (p) =>
      Array.isArray(p.sports) &&
      p.sports.length > 0 &&
      p.sports.every((s) => s.toUpperCase() === "MLB"),
  },
  {
    id: "nba-anywhere",
    name: "NBA In The Mix",
    description: "Any parlay with at least one NBA leg.",
    predicate: sportContains("NBA"),
  },
  {
    id: "full-slate",
    name: "Full Slate",
    description: "Every published parlay across every sport and category.",
    predicate: () => true,
  },
];

export function getStrategy(id: string): StrategyDef | undefined {
  return STRATEGIES.find((s) => s.id === id);
}
