// Slate diversity filter.
//
// Without this, a "slate of 12" can collapse into 3-4 distinct ideas dressed
// up as 12. Example:
//
//   #1: Lakers ML / Braves -1.5 / Over 8.5   (+428 EV 32%)
//   #2: Lakers ML / Braves -1.5 / Over 9.5   (+401 EV 31%)
//   #3: Lakers ML / Braves -1.5 / Padres ML  (+395 EV 30%)
//
// Three picks, same Lakers + Braves base. If Lakers loses, all three lose.
// The slate looks diversified, but it isn't — it's one bet repeated.
//
// Three passes, run in order on a list already sorted best-first:
//
//   1. Near-duplicate prune. Drop a candidate if it shares
//      max(2, min(n_a, n_b) - 1) legs with any kept parlay. So:
//        - 2-leg vs 2-leg: drop on 2/2 overlap (exact dupe).
//        - 2-leg vs 3-leg: drop on 2/2 overlap (2-leg fully inside 3-leg).
//        - 3-leg vs 3-leg: drop on 2/3 overlap.
//        - 4-leg vs 4-leg: drop on 3/4 overlap.
//
//   2. Leg quota. No single leg (gameId::pick) appears in more than
//      `maxPerLeg` kept picks. Default 2.
//
//   3. Game quota. No single gameId appears in more than `maxPerGame`
//      kept picks across ANY market. Catches the "Lakers ML in pick #1,
//      Lakers -5.5 in pick #2, Lakers/Celtics Over in pick #3" pattern —
//      different leg signatures, same underlying correlated bet on the
//      Lakers game. Default 3 (allows two markets on the same game to
//      coexist, blocks three-deep concentration).
//
// Same-game correlation downweighting INSIDE a parlay was considered but
// doesn't apply — buildParlays in app/api/parlays/route.ts already enforces
// no two legs from the same game inside a single parlay (see usedGames
// check). The game quota addresses correlation ACROSS picks instead.

export interface DiversityLeg {
  gameId?: string;
  pick: string;
}

export interface DiversityParlay {
  legs: DiversityLeg[];
}

export interface DiversityOptions {
  maxPerLeg?: number;
  maxPerGame?: number;
}

function legKey(leg: DiversityLeg): string {
  return `${leg.gameId ?? ""}::${leg.pick}`.toLowerCase();
}

function legSet(parlay: DiversityParlay): Set<string> {
  return new Set(parlay.legs.map(legKey));
}

function gameSet(parlay: DiversityParlay): Set<string> {
  const s = new Set<string>();
  for (const l of parlay.legs) {
    if (l.gameId) s.add(l.gameId);
  }
  return s;
}

function overlapCount(a: Set<string>, b: Set<string>): number {
  let n = 0;
  for (const k of a) if (b.has(k)) n++;
  return n;
}

export function applyDiversityFilter<T extends DiversityParlay>(
  parlays: T[],
  options: DiversityOptions = {},
): T[] {
  const maxPerLeg = options.maxPerLeg ?? 2;
  const maxPerGame = options.maxPerGame ?? 3;
  const kept: { parlay: T; legs: Set<string> }[] = [];
  const legCounts = new Map<string, number>();
  const gameCounts = new Map<string, number>();

  for (const candidate of parlays) {
    const candidateLegs = legSet(candidate);
    if (candidateLegs.size === 0) continue;

    let isNearDup = false;
    for (const k of kept) {
      const threshold = Math.max(2, Math.min(candidateLegs.size, k.legs.size) - 1);
      if (overlapCount(candidateLegs, k.legs) >= threshold) {
        isNearDup = true;
        break;
      }
    }
    if (isNearDup) continue;

    let exceedsQuota = false;
    for (const lk of candidateLegs) {
      if ((legCounts.get(lk) ?? 0) >= maxPerLeg) {
        exceedsQuota = true;
        break;
      }
    }
    if (exceedsQuota) continue;

    const candidateGames = gameSet(candidate);
    let exceedsGameQuota = false;
    for (const gid of candidateGames) {
      if ((gameCounts.get(gid) ?? 0) >= maxPerGame) {
        exceedsGameQuota = true;
        break;
      }
    }
    if (exceedsGameQuota) continue;

    kept.push({ parlay: candidate, legs: candidateLegs });
    for (const lk of candidateLegs) {
      legCounts.set(lk, (legCounts.get(lk) ?? 0) + 1);
    }
    for (const gid of candidateGames) {
      gameCounts.set(gid, (gameCounts.get(gid) ?? 0) + 1);
    }
  }

  return kept.map((k) => k.parlay);
}
