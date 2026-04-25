/**
 * Team brand colors and ESPN logo data for major US sports leagues.
 *
 * Used by BayParlays to render team-specific accent colors and inline team
 * logos on every parlay leg. The page is otherwise editorial monochrome —
 * team colors are the only branded color on the page.
 *
 * Keys match the team names returned by the Odds API (full city + nickname,
 * e.g. "Los Angeles Lakers", "Tampa Bay Lightning").
 */

export interface TeamBrand {
  primary: string;   // hex, e.g. "#552583" (Lakers purple)
  secondary: string; // hex, accent
  logoSlug: string;  // ESPN logo slug, e.g. "lal" — used to build URL
}

/** Default fallback brand for unknown teams (gray). */
export const DEFAULT_BRAND: TeamBrand = {
  primary: "#6b7280",
  secondary: "#1f2937",
  logoSlug: "",
};

export const TEAM_BRANDS: Record<string, TeamBrand> = {
  // ───────────────────────────── NBA (30) ─────────────────────────────
  "Atlanta Hawks":            { primary: "#E03A3E", secondary: "#C1D32F", logoSlug: "atl" },
  "Boston Celtics":           { primary: "#007A33", secondary: "#BA9653", logoSlug: "bos" },
  "Brooklyn Nets":            { primary: "#000000", secondary: "#FFFFFF", logoSlug: "bkn" },
  "Charlotte Hornets":        { primary: "#1D1160", secondary: "#00788C", logoSlug: "cha" },
  "Chicago Bulls":            { primary: "#CE1141", secondary: "#000000", logoSlug: "chi" },
  "Cleveland Cavaliers":      { primary: "#860038", secondary: "#FDBB30", logoSlug: "cle" },
  "Dallas Mavericks":         { primary: "#00538C", secondary: "#002B5E", logoSlug: "dal" },
  "Denver Nuggets":           { primary: "#0E2240", secondary: "#FEC524", logoSlug: "den" },
  "Detroit Pistons":          { primary: "#C8102E", secondary: "#1D42BA", logoSlug: "det" },
  "Golden State Warriors":    { primary: "#1D428A", secondary: "#FFC72C", logoSlug: "gs"  },
  "Houston Rockets":          { primary: "#CE1141", secondary: "#000000", logoSlug: "hou" },
  "Indiana Pacers":           { primary: "#002D62", secondary: "#FDBB30", logoSlug: "ind" },
  "Los Angeles Clippers":     { primary: "#C8102E", secondary: "#1D428A", logoSlug: "lac" },
  "Los Angeles Lakers":       { primary: "#552583", secondary: "#FDB927", logoSlug: "lal" },
  "Memphis Grizzlies":        { primary: "#5D76A9", secondary: "#12173F", logoSlug: "mem" },
  "Miami Heat":               { primary: "#98002E", secondary: "#F9A01B", logoSlug: "mia" },
  "Milwaukee Bucks":          { primary: "#00471B", secondary: "#EEE1C6", logoSlug: "mil" },
  "Minnesota Timberwolves":   { primary: "#0C2340", secondary: "#236192", logoSlug: "min" },
  "New Orleans Pelicans":     { primary: "#0C2340", secondary: "#C8102E", logoSlug: "no"  },
  "New York Knicks":          { primary: "#006BB6", secondary: "#F58426", logoSlug: "ny"  },
  "Oklahoma City Thunder":    { primary: "#007AC1", secondary: "#EF3B24", logoSlug: "okc" },
  "Orlando Magic":            { primary: "#0077C0", secondary: "#C4CED4", logoSlug: "orl" },
  "Philadelphia 76ers":       { primary: "#006BB6", secondary: "#ED174C", logoSlug: "phi" },
  "Phoenix Suns":             { primary: "#1D1160", secondary: "#E56020", logoSlug: "phx" },
  "Portland Trail Blazers":   { primary: "#E03A3E", secondary: "#000000", logoSlug: "por" },
  "Sacramento Kings":         { primary: "#5A2D81", secondary: "#63727A", logoSlug: "sac" },
  "San Antonio Spurs":        { primary: "#C4CED4", secondary: "#000000", logoSlug: "sa"  },
  "Toronto Raptors":          { primary: "#CE1141", secondary: "#000000", logoSlug: "tor" },
  "Utah Jazz":                { primary: "#002B5C", secondary: "#F9A01B", logoSlug: "utah" },
  "Washington Wizards":       { primary: "#002B5C", secondary: "#E31837", logoSlug: "wsh" },

  // ───────────────────────────── NFL (32) ─────────────────────────────
  "Arizona Cardinals":        { primary: "#97233F", secondary: "#000000", logoSlug: "ari" },
  "Atlanta Falcons":          { primary: "#A71930", secondary: "#000000", logoSlug: "atl" },
  "Baltimore Ravens":         { primary: "#241773", secondary: "#9E7C0C", logoSlug: "bal" },
  "Buffalo Bills":            { primary: "#00338D", secondary: "#C60C30", logoSlug: "buf" },
  "Carolina Panthers":        { primary: "#0085CA", secondary: "#101820", logoSlug: "car" },
  "Chicago Bears":            { primary: "#0B162A", secondary: "#C83803", logoSlug: "chi" },
  "Cincinnati Bengals":       { primary: "#FB4F14", secondary: "#000000", logoSlug: "cin" },
  "Cleveland Browns":         { primary: "#311D00", secondary: "#FF3C00", logoSlug: "cle" },
  "Dallas Cowboys":           { primary: "#003594", secondary: "#869397", logoSlug: "dal" },
  "Denver Broncos":           { primary: "#FB4F14", secondary: "#002244", logoSlug: "den" },
  "Detroit Lions":            { primary: "#0076B6", secondary: "#B0B7BC", logoSlug: "det" },
  "Green Bay Packers":        { primary: "#203731", secondary: "#FFB612", logoSlug: "gb"  },
  "Houston Texans":           { primary: "#03202F", secondary: "#A71930", logoSlug: "hou" },
  "Indianapolis Colts":       { primary: "#002C5F", secondary: "#A2AAAD", logoSlug: "ind" },
  "Jacksonville Jaguars":     { primary: "#101820", secondary: "#D7A22A", logoSlug: "jax" },
  "Kansas City Chiefs":       { primary: "#E31837", secondary: "#FFB81C", logoSlug: "kc"  },
  "Las Vegas Raiders":        { primary: "#000000", secondary: "#A5ACAF", logoSlug: "lv"  },
  "Los Angeles Chargers":     { primary: "#0080C6", secondary: "#FFC20E", logoSlug: "lac" },
  "Los Angeles Rams":         { primary: "#003594", secondary: "#FFA300", logoSlug: "lar" },
  "Miami Dolphins":           { primary: "#008E97", secondary: "#FC4C02", logoSlug: "mia" },
  "Minnesota Vikings":        { primary: "#4F2683", secondary: "#FFC62F", logoSlug: "min" },
  "New England Patriots":     { primary: "#002244", secondary: "#C60C30", logoSlug: "ne"  },
  "New Orleans Saints":       { primary: "#D3BC8D", secondary: "#101820", logoSlug: "no"  },
  "New York Giants":          { primary: "#0B2265", secondary: "#A71930", logoSlug: "nyg" },
  "New York Jets":            { primary: "#125740", secondary: "#000000", logoSlug: "nyj" },
  "Philadelphia Eagles":      { primary: "#004C54", secondary: "#A5ACAF", logoSlug: "phi" },
  "Pittsburgh Steelers":      { primary: "#FFB612", secondary: "#101820", logoSlug: "pit" },
  "San Francisco 49ers":      { primary: "#AA0000", secondary: "#B3995D", logoSlug: "sf"  },
  "Seattle Seahawks":         { primary: "#002244", secondary: "#69BE28", logoSlug: "sea" },
  "Tampa Bay Buccaneers":     { primary: "#D50A0A", secondary: "#34302B", logoSlug: "tb"  },
  "Tennessee Titans":         { primary: "#0C2340", secondary: "#4B92DB", logoSlug: "ten" },
  "Washington Commanders":    { primary: "#5A1414", secondary: "#FFB612", logoSlug: "wsh" },

  // ───────────────────────────── MLB (30) ─────────────────────────────
  "Arizona Diamondbacks":     { primary: "#A71930", secondary: "#E3D4AD", logoSlug: "ari" },
  "Atlanta Braves":           { primary: "#CE1141", secondary: "#13274F", logoSlug: "atl" },
  "Baltimore Orioles":        { primary: "#DF4601", secondary: "#000000", logoSlug: "bal" },
  "Boston Red Sox":           { primary: "#BD3039", secondary: "#0C2340", logoSlug: "bos" },
  "Chicago Cubs":             { primary: "#0E3386", secondary: "#CC3433", logoSlug: "chc" },
  "Chicago White Sox":        { primary: "#27251F", secondary: "#C4CED4", logoSlug: "chw" },
  "Cincinnati Reds":          { primary: "#C6011F", secondary: "#000000", logoSlug: "cin" },
  "Cleveland Guardians":      { primary: "#00385D", secondary: "#E50022", logoSlug: "cle" },
  "Colorado Rockies":         { primary: "#33006F", secondary: "#C4CED4", logoSlug: "col" },
  "Detroit Tigers":           { primary: "#0C2340", secondary: "#FA4616", logoSlug: "det" },
  "Houston Astros":           { primary: "#002D62", secondary: "#EB6E1F", logoSlug: "hou" },
  "Kansas City Royals":       { primary: "#004687", secondary: "#BD9B60", logoSlug: "kc"  },
  "Los Angeles Angels":       { primary: "#BA0021", secondary: "#003263", logoSlug: "laa" },
  "Los Angeles Dodgers":      { primary: "#005A9C", secondary: "#FFFFFF", logoSlug: "lad" },
  "Miami Marlins":            { primary: "#00A3E0", secondary: "#EF3340", logoSlug: "mia" },
  "Milwaukee Brewers":        { primary: "#12284B", secondary: "#FFC52F", logoSlug: "mil" },
  "Minnesota Twins":          { primary: "#002B5C", secondary: "#D31145", logoSlug: "min" },
  "New York Mets":            { primary: "#002D72", secondary: "#FF5910", logoSlug: "nym" },
  "New York Yankees":         { primary: "#003087", secondary: "#FFFFFF", logoSlug: "nyy" },
  "Oakland Athletics":        { primary: "#003831", secondary: "#EFB21E", logoSlug: "oak" },
  "Athletics":                { primary: "#003831", secondary: "#EFB21E", logoSlug: "oak" },
  "Philadelphia Phillies":    { primary: "#E81828", secondary: "#002D72", logoSlug: "phi" },
  "Pittsburgh Pirates":       { primary: "#FDB827", secondary: "#27251F", logoSlug: "pit" },
  "San Diego Padres":         { primary: "#2F241D", secondary: "#FFC425", logoSlug: "sd"  },
  "San Francisco Giants":     { primary: "#FD5A1E", secondary: "#27251F", logoSlug: "sf"  },
  "Seattle Mariners":         { primary: "#0C2C56", secondary: "#005C5C", logoSlug: "sea" },
  "St. Louis Cardinals":      { primary: "#C41E3A", secondary: "#0C2340", logoSlug: "stl" },
  "Tampa Bay Rays":           { primary: "#092C5C", secondary: "#8FBCE6", logoSlug: "tb"  },
  "Texas Rangers":            { primary: "#003278", secondary: "#C0111F", logoSlug: "tex" },
  "Toronto Blue Jays":        { primary: "#134A8E", secondary: "#1D2D5C", logoSlug: "tor" },
  "Washington Nationals":     { primary: "#AB0003", secondary: "#14225A", logoSlug: "wsh" },

  // ───────────────────────────── NHL (32) ─────────────────────────────
  "Anaheim Ducks":            { primary: "#F47A38", secondary: "#B9975B", logoSlug: "ana" },
  "Boston Bruins":            { primary: "#FFB81C", secondary: "#000000", logoSlug: "bos" },
  "Buffalo Sabres":           { primary: "#002654", secondary: "#FCB514", logoSlug: "buf" },
  "Calgary Flames":           { primary: "#C8102E", secondary: "#F1BE48", logoSlug: "cgy" },
  "Carolina Hurricanes":      { primary: "#CC0000", secondary: "#000000", logoSlug: "car" },
  "Chicago Blackhawks":       { primary: "#CF0A2C", secondary: "#000000", logoSlug: "chi" },
  "Colorado Avalanche":       { primary: "#6F263D", secondary: "#236192", logoSlug: "col" },
  "Columbus Blue Jackets":    { primary: "#002654", secondary: "#CE1126", logoSlug: "cbj" },
  "Dallas Stars":             { primary: "#006847", secondary: "#8F8F8C", logoSlug: "dal" },
  "Detroit Red Wings":        { primary: "#CE1126", secondary: "#FFFFFF", logoSlug: "det" },
  "Edmonton Oilers":          { primary: "#FF4C00", secondary: "#041E42", logoSlug: "edm" },
  "Florida Panthers":         { primary: "#041E42", secondary: "#C8102E", logoSlug: "fla" },
  "Los Angeles Kings":        { primary: "#111111", secondary: "#A2AAAD", logoSlug: "la"  },
  "Minnesota Wild":           { primary: "#A6192E", secondary: "#154734", logoSlug: "min" },
  "Montreal Canadiens":       { primary: "#AF1E2D", secondary: "#192168", logoSlug: "mtl" },
  "Nashville Predators":      { primary: "#FFB81C", secondary: "#041E42", logoSlug: "nsh" },
  "New Jersey Devils":        { primary: "#CE1126", secondary: "#000000", logoSlug: "nj"  },
  "New York Islanders":       { primary: "#00539B", secondary: "#F47D30", logoSlug: "nyi" },
  "New York Rangers":         { primary: "#0038A8", secondary: "#CE1126", logoSlug: "nyr" },
  "Ottawa Senators":          { primary: "#C52032", secondary: "#000000", logoSlug: "ott" },
  "Philadelphia Flyers":      { primary: "#F74902", secondary: "#000000", logoSlug: "phi" },
  "Pittsburgh Penguins":      { primary: "#000000", secondary: "#CFC493", logoSlug: "pit" },
  "San Jose Sharks":          { primary: "#006D75", secondary: "#EA7200", logoSlug: "sj"  },
  "Seattle Kraken":           { primary: "#001628", secondary: "#99D9D9", logoSlug: "sea" },
  "St. Louis Blues":          { primary: "#002F87", secondary: "#FCB514", logoSlug: "stl" },
  "Tampa Bay Lightning":      { primary: "#002868", secondary: "#FFFFFF", logoSlug: "tb"  },
  "Toronto Maple Leafs":      { primary: "#00205B", secondary: "#FFFFFF", logoSlug: "tor" },
  "Utah Hockey Club":         { primary: "#71AFE5", secondary: "#000000", logoSlug: "utah" },
  "Utah Mammoth":             { primary: "#71AFE5", secondary: "#000000", logoSlug: "utah" },
  "Vancouver Canucks":        { primary: "#00205B", secondary: "#00843D", logoSlug: "van" },
  "Vegas Golden Knights":     { primary: "#B4975A", secondary: "#333F42", logoSlug: "vgk" },
  "Washington Capitals":      { primary: "#C8102E", secondary: "#041E42", logoSlug: "wsh" },
  "Winnipeg Jets":            { primary: "#041E42", secondary: "#004C97", logoSlug: "wpg" },
};

/**
 * Strip diacritics ("Montréal" → "Montreal") and collapse whitespace so we
 * can match the keys in TEAM_BRANDS regardless of the source's accent style.
 */
function normalize(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Pre-build a normalized lookup map so getTeamBrand is O(1) after the first call.
let normalizedIndex: Record<string, TeamBrand> | null = null;
function getNormalizedIndex(): Record<string, TeamBrand> {
  if (normalizedIndex) return normalizedIndex;
  const idx: Record<string, TeamBrand> = {};
  for (const [key, brand] of Object.entries(TEAM_BRANDS)) {
    idx[normalize(key).toLowerCase()] = brand;
  }
  normalizedIndex = idx;
  return idx;
}

/**
 * Returns the brand for a team, with fuzzy matching for accents
 * (e.g. "Montréal Canadiens" → "Montreal Canadiens").
 */
export function getTeamBrand(teamName: string): TeamBrand | null {
  if (!teamName) return null;
  const direct = TEAM_BRANDS[teamName];
  if (direct) return direct;
  const idx = getNormalizedIndex();
  const hit = idx[normalize(teamName).toLowerCase()];
  return hit ?? null;
}

/**
 * Returns the ESPN logo URL for a team, or null if unknown.
 * Pattern: https://a.espncdn.com/i/teamlogos/{sport}/500/{slug}.png
 */
export function getTeamLogoUrl(teamName: string, sport: string): string | null {
  const brand = getTeamBrand(teamName);
  if (!brand || !brand.logoSlug) return null;
  const s = sport.toLowerCase();
  if (s !== "nba" && s !== "nfl" && s !== "mlb" && s !== "nhl") return null;
  return `https://a.espncdn.com/i/teamlogos/${s}/500/${brand.logoSlug}.png`;
}
