// ─── MLB Lineups & Probable Pitchers ──────────────────────────────────────
// MLB Stats API is FREE, unlimited, no auth required.
// https://statsapi.mlb.com/docs
//
// Probable pitchers typically post 24-48hrs before first pitch. Confirmed
// lineups post ~2hrs before. Both are meaningful signal — totals markets
// and h2h especially move on pitcher news.

export interface ProbablePitcher {
  id: number;
  fullName: string;
  era: number | null;
  whip: number | null;
  wins: number | null;
  losses: number | null;
}

export interface GameLineup {
  gamePk: number;
  commenceTime: string;
  homeTeam: string;
  awayTeam: string;
  homePitcher: ProbablePitcher | null;
  awayPitcher: ProbablePitcher | null;
}

type RawMlbPerson = { id?: number; fullName?: string };
type RawMlbStat = { era?: string; whip?: string; wins?: number; losses?: number };
type RawMlbSplit = { stat?: RawMlbStat };
type RawMlbStatBlock = { splits?: RawMlbSplit[] };

const BASE = "https://statsapi.mlb.com/api/v1";

/**
 * Fetch probable pitchers for all games on a given date.
 * Returns empty array on failure — never throws (free API, no drama).
 */
export async function fetchProbablePitchers(date: string): Promise<GameLineup[]> {
  const url =
    `${BASE}/schedule?sportId=1&date=${date}` +
    `&hydrate=probablePitcher(note),team`;

  try {
    const res = await fetch(url, { next: { revalidate: 1800 } }); // 30min cache
    if (!res.ok) return [];
    type RawMlbGame = {
      gamePk?: number;
      gameDate?: string;
      teams?: {
        home?: { team?: { name?: string }; probablePitcher?: RawMlbPerson };
        away?: { team?: { name?: string }; probablePitcher?: RawMlbPerson };
      };
    };
    type RawMlbSchedule = {
      dates?: { games?: RawMlbGame[] }[];
    };
    const data: RawMlbSchedule = await res.json();
    const games: RawMlbGame[] = (data.dates ?? []).flatMap((d) => d.games ?? []);

    const lineups: GameLineup[] = [];

    for (const g of games) {
      const homeRaw = g.teams?.home;
      const awayRaw = g.teams?.away;
      const homePitcherMeta = homeRaw?.probablePitcher;
      const awayPitcherMeta = awayRaw?.probablePitcher;

      // Pitcher stats are a second hop. Only fetch if we have the pitcher id.
      const [homePitcher, awayPitcher] = await Promise.all([
        homePitcherMeta ? fetchPitcherStats(homePitcherMeta) : Promise.resolve(null),
        awayPitcherMeta ? fetchPitcherStats(awayPitcherMeta) : Promise.resolve(null),
      ]);

      lineups.push({
        gamePk: g.gamePk ?? 0,
        commenceTime: g.gameDate ?? "",
        homeTeam: homeRaw?.team?.name ?? "",
        awayTeam: awayRaw?.team?.name ?? "",
        homePitcher,
        awayPitcher,
      });
    }

    return lineups;
  } catch {
    return [];
  }
}

async function fetchPitcherStats(p: RawMlbPerson): Promise<ProbablePitcher | null> {
  if (!p?.id) return null;
  try {
    const year = new Date().getFullYear();
    const url = `${BASE}/people/${p.id}/stats?stats=season&group=pitching&season=${year}`;
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) {
      return { id: p.id, fullName: p.fullName ?? "", era: null, whip: null, wins: null, losses: null };
    }
    type RawStatsResp = { stats?: RawMlbStatBlock[] };
    const data: RawStatsResp = await res.json();
    const stat = data.stats?.[0]?.splits?.[0]?.stat;
    return {
      id: p.id,
      fullName: p.fullName ?? "",
      era: stat?.era ? parseFloat(stat.era) : null,
      whip: stat?.whip ? parseFloat(stat.whip) : null,
      wins: stat?.wins ?? null,
      losses: stat?.losses ?? null,
    };
  } catch {
    return { id: p.id, fullName: p.fullName ?? "", era: null, whip: null, wins: null, losses: null };
  }
}

/**
 * Lookup a game's pitcher matchup by home+away team names.
 * Match is exact on names — MLB Stats API uses canonical names ("New York Yankees"),
 * same as The Odds API. No fuzzy matching needed yet.
 */
export function findGameLineup(
  lineups: GameLineup[],
  homeTeam: string,
  awayTeam: string
): GameLineup | null {
  return (
    lineups.find(
      (g) => g.homeTeam === homeTeam && g.awayTeam === awayTeam
    ) ?? null
  );
}

/**
 * Turn a pitcher matchup into a run-bias signal for totals markets.
 * Two sub-average ERAs (both < 3.75) = lean under.
 * Two starters with ERA > 5.00 = lean over.
 * Cap at +/-0.25 runs so it doesn't dominate the model.
 */
export function pitcherMatchupBias(
  lineup: GameLineup | null
): { bias: number; reason: string | null } {
  if (!lineup) return { bias: 0, reason: null };
  const h = lineup.homePitcher?.era;
  const a = lineup.awayPitcher?.era;
  if (h === null || a === null || h === undefined || a === undefined) {
    return { bias: 0, reason: null };
  }
  const avgEra = (h + a) / 2;
  if (avgEra <= 3.25) return { bias: -0.25, reason: "ace-vs-ace (avg ERA <3.25)" };
  if (avgEra <= 3.75) return { bias: -0.12, reason: `strong pitching (avg ERA ${avgEra.toFixed(2)})` };
  if (avgEra >= 5.50) return { bias: 0.25, reason: `bullpen game (avg ERA ${avgEra.toFixed(2)})` };
  if (avgEra >= 4.75) return { bias: 0.12, reason: `shaky pitching (avg ERA ${avgEra.toFixed(2)})` };
  return { bias: 0, reason: null };
}
