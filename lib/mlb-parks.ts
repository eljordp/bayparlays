// MLB park factors — relative scoring multiplier per stadium.
//
// Park factor = (runs scored at this park / runs scored at league avg park),
// rolling over 3 seasons to smooth single-year noise. Source: Baseball Savant
// + Statcast park-factor leaderboard. Updated annually pre-season.
//
// Used to bias MLB totals: a Coors Field game expects ~1.2x league-avg
// runs, an Oracle Park game expects ~0.85x. The Normal-distribution totals
// model already takes expected total as input — we just shift it ±0.5 runs
// based on park to capture a structural effect the recent-scoring averages
// can't fully see (because they wash across all parks).

interface ParkFactor {
  factor: number; // 1.00 = league avg, 1.20 = +20% runs, 0.85 = -15% runs
  ballpark: string;
}

// Keyed by team commonName as it appears in Odds API responses.
// Factors approximate Statcast 3-year park factors (2023-2025).
const PARK_FACTORS: Record<string, ParkFactor> = {
  "Colorado Rockies":          { factor: 1.20, ballpark: "Coors Field" },
  "Cincinnati Reds":           { factor: 1.10, ballpark: "Great American Ball Park" },
  "Texas Rangers":             { factor: 1.07, ballpark: "Globe Life Field" },
  "Boston Red Sox":            { factor: 1.06, ballpark: "Fenway Park" },
  "New York Yankees":          { factor: 1.05, ballpark: "Yankee Stadium" },
  "Chicago Cubs":              { factor: 1.05, ballpark: "Wrigley Field" },
  "Atlanta Braves":            { factor: 1.04, ballpark: "Truist Park" },
  "Philadelphia Phillies":     { factor: 1.04, ballpark: "Citizens Bank Park" },
  "Toronto Blue Jays":         { factor: 1.03, ballpark: "Rogers Centre" },
  "Baltimore Orioles":         { factor: 1.02, ballpark: "Camden Yards" },
  "Minnesota Twins":           { factor: 1.02, ballpark: "Target Field" },
  "Houston Astros":            { factor: 1.01, ballpark: "Daikin Park" },
  "Kansas City Royals":        { factor: 1.01, ballpark: "Kauffman Stadium" },
  "Milwaukee Brewers":         { factor: 1.00, ballpark: "American Family Field" },
  "Arizona Diamondbacks":      { factor: 1.00, ballpark: "Chase Field" },
  "Athletics":                 { factor: 0.99, ballpark: "Sutter Health Park" },
  "Tampa Bay Rays":            { factor: 0.98, ballpark: "Steinbrenner Field" },
  "Washington Nationals":      { factor: 0.98, ballpark: "Nationals Park" },
  "Los Angeles Dodgers":       { factor: 0.97, ballpark: "Dodger Stadium" },
  "St. Louis Cardinals":       { factor: 0.97, ballpark: "Busch Stadium" },
  "Detroit Tigers":            { factor: 0.96, ballpark: "Comerica Park" },
  "Chicago White Sox":         { factor: 0.96, ballpark: "Rate Field" },
  "Cleveland Guardians":       { factor: 0.95, ballpark: "Progressive Field" },
  "Pittsburgh Pirates":        { factor: 0.95, ballpark: "PNC Park" },
  "New York Mets":             { factor: 0.94, ballpark: "Citi Field" },
  "Los Angeles Angels":        { factor: 0.93, ballpark: "Angel Stadium" },
  "San Diego Padres":          { factor: 0.92, ballpark: "Petco Park" },
  "Seattle Mariners":          { factor: 0.92, ballpark: "T-Mobile Park" },
  "Miami Marlins":             { factor: 0.91, ballpark: "loanDepot park" },
  "San Francisco Giants":      { factor: 0.85, ballpark: "Oracle Park" },
};

// League-avg expected total used for bias scaling. The actual total
// varies by matchup (good pitchers vs bad), but we just want the
// directional shift the park imparts. Capped ±0.6 runs so a single
// signal can't overwhelm pitcher/weather/lineup biases.
const LEAGUE_AVG_TOTAL = 8.5;
const MAX_BIAS = 0.6;

export interface ParkBias {
  homeTeam: string;
  ballpark: string | null;
  factor: number;
  // Total bias in runs. Positive = favor Over.
  totalBias: number;
  reason: string | null;
}

export function getMlbParkBias(homeTeam: string): ParkBias {
  const pf = PARK_FACTORS[homeTeam];
  if (!pf) {
    return {
      homeTeam,
      ballpark: null,
      factor: 1.0,
      totalBias: 0,
      reason: null,
    };
  }
  const rawBias = (pf.factor - 1.0) * LEAGUE_AVG_TOTAL;
  const totalBias = Math.max(-MAX_BIAS, Math.min(MAX_BIAS, rawBias));
  let reason: string | null = null;
  if (Math.abs(totalBias) >= 0.2) {
    const direction = totalBias > 0 ? "hitter-friendly" : "pitcher-friendly";
    reason = `${pf.ballpark} (${direction}, factor ${pf.factor.toFixed(2)}x)`;
  }
  return {
    homeTeam,
    ballpark: pf.ballpark,
    factor: pf.factor,
    totalBias: Math.round(totalBias * 100) / 100,
    reason,
  };
}
