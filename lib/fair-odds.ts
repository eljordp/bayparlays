// ─── Fair Odds / De-Vigging ───────────────────────────────────────────────
// Book's implied probability always sums to >100% across a two-way market
// (e.g. Over 8 at -110 → 52.4%, Under 8 at -110 → 52.4%, sum = 104.8%).
// That 4.8% is the vig. De-vigging removes it and leaves the book's TRUE
// probability estimate — what the book thinks will happen, ignoring profit.
//
// This gives us two things:
//   1. A better "ourProb" fallback when we don't have a model signal
//   2. A way to flag single books whose price diverges from the consensus

export interface TwoWayOutcome {
  odds: number;            // American odds
  implied: number;         // Implied probability (with vig)
}

export function americanToDecimal(odds: number): number {
  if (odds > 0) return odds / 100 + 1;
  return 100 / Math.abs(odds) + 1;
}

export function americanToImpliedProb(odds: number): number {
  const dec = americanToDecimal(odds);
  return 1 / dec;
}

/**
 * De-vig a two-way market using the proportional (multiplicative) method.
 * Returns the fair no-vig probability for the `side` outcome.
 *
 * Example: Over -110 (52.38%), Under -110 (52.38%). Overround = 4.76%.
 * Fair prob for Over = 52.38 / (52.38 + 52.38) = 50.00%.
 */
export function deVigTwoWay(sideOdds: number, oppositeOdds: number): number {
  const p1 = americanToImpliedProb(sideOdds);
  const p2 = americanToImpliedProb(oppositeOdds);
  const sum = p1 + p2;
  if (sum <= 0) return p1;
  return p1 / sum;
}

/**
 * Take a list of single-side odds from many books and return the consensus
 * no-vig fair probability. Uses the MEDIAN of each book's de-vigged price
 * (median is more robust to one wonky book than mean).
 *
 * bookMarkets: array where each element is {side, opposite} for one book.
 */
export function consensusFairProb(
  bookMarkets: { side: number; opposite: number }[]
): number | null {
  if (bookMarkets.length === 0) return null;
  const fairs = bookMarkets
    .map(({ side, opposite }) => deVigTwoWay(side, opposite))
    .sort((a, b) => a - b);
  const mid = Math.floor(fairs.length / 2);
  if (fairs.length % 2 === 0) return (fairs[mid - 1] + fairs[mid]) / 2;
  return fairs[mid];
}

/**
 * Given the consensus fair probability and a single book's price, compute
 * the EV of betting that book. Positive = bettor edge; negative = vig bites.
 *
 * Returns decimal EV (0.03 = +3% EV). This is the REAL edge metric — ignore
 * hit rate, chase this number.
 */
export function evVsFair(bookOdds: number, fairProb: number): number {
  const decimal = americanToDecimal(bookOdds);
  return fairProb * decimal - 1;
}

/**
 * Flag a leg as "sharp divergence" if the best available book is pricing
 * a side significantly better than the de-vigged consensus. A 2%+ edge vs
 * no-vig fair is a real opportunity — most days you won't see it.
 *
 * Returns:
 *   - fairProb: no-vig consensus across all books
 *   - bestEv: EV if you bet the best-priced book
 *   - isSharpEdge: true iff bestEv >= 0.02 (2% EV)
 *   - confidenceBoost: 0-15 points to add to leg confidence when sharp edge found
 */
export function detectSharpEdge(
  bestOdds: number,
  allBooks: { side: number; opposite: number }[]
): {
  fairProb: number | null;
  bestEv: number;
  isSharpEdge: boolean;
  confidenceBoost: number;
} {
  const fairProb = consensusFairProb(allBooks);
  if (fairProb === null) {
    return { fairProb: null, bestEv: 0, isSharpEdge: false, confidenceBoost: 0 };
  }
  const bestEv = evVsFair(bestOdds, fairProb);
  const isSharpEdge = bestEv >= 0.02;
  // Scale boost with edge size, cap at 15
  const confidenceBoost = isSharpEdge ? Math.min(15, Math.round(bestEv * 200)) : 0;
  return { fairProb, bestEv, isSharpEdge, confidenceBoost };
}
