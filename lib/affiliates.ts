// ─── Sportsbook Affiliate Deeplinks ───────────────────────────────────────
// Centralized config for affiliate / referral links per sportsbook. Every
// place on the site that renders a book name should route through
// `affiliateLink(book)` so that once JP gets approved with each book's
// affiliate program, dropping the code here flips the entire site to
// revenue-generating links with no other changes needed.
//
// Revenue model: retail books pay $100-$500 per First-Time Depositor (FTD).
// Even with the edges product, the affiliate flip is the most reliable path
// to positive unit economics that doesn't depend on model accuracy.

export interface BookConfig {
  displayName: string;          // what the site renders
  homepage: string;             // used when no affiliate code yet
  affiliate: string | null;     // null = not yet approved, falls back to homepage
  // Optional: affiliate-program notes for internal reference (never shown to users)
  notes?: string;
}

// All known books surfaced by The Odds API /v4/sports/.../odds?regions=us.
// Keys are lowercased canonical names to simplify lookup. Add an affiliate
// entry the moment an affiliate code is live.
export const BOOK_CONFIG: Record<string, BookConfig> = {
  "fanduel": {
    displayName: "FanDuel",
    homepage: "https://www.fanduel.com/sportsbook",
    affiliate: null,
    notes: "Apply at https://partners.fanduel.com — US only, needs W9",
  },
  "draftkings": {
    displayName: "DraftKings",
    homepage: "https://sportsbook.draftkings.com",
    affiliate: null,
    notes: "Apply via https://partnerships.draftkings.com — 90-day review",
  },
  "betmgm": {
    displayName: "BetMGM",
    homepage: "https://sports.betmgm.com",
    affiliate: null,
    notes: "Apply via Impact Radius or direct partnerships team",
  },
  "caesars": {
    displayName: "Caesars",
    homepage: "https://www.caesars.com/sportsbook-and-casino",
    affiliate: null,
  },
  "betrivers": {
    displayName: "BetRivers",
    homepage: "https://www.betrivers.com",
    affiliate: null,
  },
  "pointsbet": {
    displayName: "PointsBet",
    homepage: "https://nj.pointsbet.com",
    affiliate: null,
  },
  "mybookie.ag": {
    displayName: "MyBookie.ag",
    homepage: "https://www.mybookie.ag",
    affiliate: null,
    notes: "Offshore — may have its own affiliate program with faster approval",
  },
  "bovada": {
    displayName: "Bovada",
    homepage: "https://www.bovada.lv",
    affiliate: null,
    notes: "Offshore — BVAffiliates has direct program",
  },
  "lowvig.ag": {
    displayName: "LowVig.ag",
    homepage: "https://www.lowvig.ag",
    affiliate: null,
  },
  "betonlineag": {
    displayName: "BetOnline",
    homepage: "https://www.betonline.ag",
    affiliate: null,
  },
};

/**
 * Normalize a book name so lookups work across Odds API variations
 * (e.g. "FanDuel" vs "fanduel" vs "FanDuel Sportsbook").
 */
function normalizeBookKey(book: string): string {
  return book.toLowerCase().replace(/\s+/g, "").replace(/sportsbook$/, "");
}

/**
 * Returns the URL to send a user to when they want to place a bet at `book`.
 * Falls back to the book's homepage when no affiliate code is configured.
 * Safe to call with any book name, including unknowns.
 */
export function affiliateLink(book: string | undefined | null): string {
  if (!book) return "#";
  const key = normalizeBookKey(book);
  const cfg = BOOK_CONFIG[key];
  if (!cfg) return "#";
  return cfg.affiliate ?? cfg.homepage;
}

/**
 * Returns the display name for a book, in case we want to standardize how
 * it appears in the UI (e.g. "FanDuel" not "FanDuel Sportsbook").
 */
export function bookDisplayName(book: string | undefined | null): string {
  if (!book) return "";
  const key = normalizeBookKey(book);
  return BOOK_CONFIG[key]?.displayName ?? book;
}

/**
 * Returns true if we have an active affiliate code for this book. UI can
 * use this to show a subtle "affiliate" label or not.
 */
export function hasAffiliate(book: string | undefined | null): boolean {
  if (!book) return false;
  const key = normalizeBookKey(book);
  return !!BOOK_CONFIG[key]?.affiliate;
}
