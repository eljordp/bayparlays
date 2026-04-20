export interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  tier: "free" | "sharp" | "vip";
  category: "milestone" | "streak" | "skill" | "social";
}

export const BADGES: Badge[] = [
  // Milestone badges
  { id: "first_pick", name: "First Pick", description: "Placed your first sim bet", icon: "\uD83C\uDFAF", tier: "free", category: "milestone" },
  { id: "ten_picks", name: "Getting Started", description: "Placed 10 sim bets", icon: "\uD83D\uDCCA", tier: "free", category: "milestone" },
  { id: "fifty_picks", name: "Regular", description: "Placed 50 sim bets", icon: "\uD83D\uDCAA", tier: "sharp", category: "milestone" },
  { id: "hundred_picks", name: "Veteran", description: "Placed 100 sim bets", icon: "\uD83C\uDFC6", tier: "vip", category: "milestone" },

  // Win streaks
  { id: "streak_3", name: "Hot Hand", description: "3 wins in a row", icon: "\uD83D\uDD25", tier: "free", category: "streak" },
  { id: "streak_5", name: "On Fire", description: "5 wins in a row", icon: "\u26A1", tier: "sharp", category: "streak" },
  { id: "streak_10", name: "Unstoppable", description: "10 wins in a row", icon: "\uD83D\uDC51", tier: "vip", category: "streak" },

  // Skill badges
  { id: "first_win", name: "Winner", description: "Won your first sim parlay", icon: "\u2705", tier: "free", category: "skill" },
  { id: "big_payout", name: "Big Score", description: "Won $500+ on a single sim parlay", icon: "\uD83D\uDCB0", tier: "sharp", category: "skill" },
  { id: "huge_payout", name: "Jackpot", description: "Won $2,000+ on a single sim parlay", icon: "\uD83C\uDFB0", tier: "vip", category: "skill" },
  { id: "profitable", name: "In The Green", description: "Sim bankroll above starting balance", icon: "\uD83D\uDCC8", tier: "free", category: "skill" },
  { id: "double_up", name: "Double Up", description: "Doubled your sim bankroll", icon: "\uD83D\uDE80", tier: "vip", category: "skill" },
  { id: "multi_sport", name: "Diversified", description: "Sim bets across 3+ sports", icon: "\uD83C\uDF0E", tier: "sharp", category: "skill" },
  { id: "all_sports", name: "Global Player", description: "Sim bets across 5+ sports", icon: "\uD83C\uDFC5", tier: "vip", category: "skill" },

  // Social
  { id: "referral_1", name: "Networker", description: "Referred 1 friend", icon: "\uD83E\uDD1D", tier: "free", category: "social" },
  { id: "referral_5", name: "Ambassador", description: "Referred 5 friends", icon: "\uD83D\uDCE2", tier: "sharp", category: "social" },
  { id: "referral_10", name: "Influencer", description: "Referred 10 friends", icon: "\u2B50", tier: "vip", category: "social" },
];
