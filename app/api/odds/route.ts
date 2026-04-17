import { NextRequest, NextResponse } from "next/server";

const ODDS_API_KEY = process.env.ODDS_API_KEY;
const BASE_URL = "https://api.the-odds-api.com/v4";

const SPORT_MAP: Record<string, string> = {
  nba: "basketball_nba",
  nfl: "americanfootball_nfl",
  mlb: "baseball_mlb",
  ufc: "mma_mixed_martial_arts",
  nhl: "icehockey_nhl",
  ncaaf: "americanfootball_ncaaf",
  ncaab: "basketball_ncaab",
  soccer: "soccer_epl",
};

// All US-legal bookmakers the API supports
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const US_BOOKMAKERS = [
  "draftkings",
  "fanduel",
  "betmgm",
  "caesars",
  "pointsbetus",
  "betrivers",
  "unibet_us",
  "wynnbet",
  "superbook",
  "twinspires",
  "betus",
  "bovada",
  "lowvig",
  "betonlineag",
  "mybookieag",
  "williamhill_us",
  "espnbet",
  "fliff",
  "hardrockbet",
  "fanatics",
];

// Friendly display names
const BOOK_DISPLAY_NAMES: Record<string, string> = {
  draftkings: "DraftKings",
  fanduel: "FanDuel",
  betmgm: "BetMGM",
  caesars: "Caesars",
  pointsbetus: "PointsBet",
  betrivers: "BetRivers",
  unibet_us: "Unibet",
  wynnbet: "WynnBet",
  superbook: "SuperBook",
  twinspires: "TwinSpires",
  betus: "BetUS",
  bovada: "Bovada",
  lowvig: "LowVig",
  betonlineag: "BetOnline",
  mybookieag: "MyBookie",
  williamhill_us: "William Hill",
  espnbet: "ESPN BET",
  fliff: "Fliff",
  hardrockbet: "Hard Rock",
  fanatics: "Fanatics",
};

export interface OddsOutcome {
  name: string;
  price: number;
  point?: number;
}

export interface BookmakerOdds {
  key: string;
  title: string;
  outcomes: OddsOutcome[];
  lastUpdate: string;
}

export interface MarketOdds {
  key: string; // h2h, spreads, totals
  bookmakers: BookmakerOdds[];
}

export interface BestOdds {
  outcomeName: string;
  bestPrice: number;
  bestPoint?: number;
  bestBook: string;
  bestBookKey: string;
}

export interface GameOdds {
  id: string;
  sportKey: string;
  homeTeam: string;
  awayTeam: string;
  commenceTime: string;
  markets: MarketOdds[];
  bestOdds: Record<string, BestOdds[]>; // keyed by market (h2h, spreads, totals)
}

export interface OddsResponse {
  games: GameOdds[];
  sport: string;
  bookDisplayNames: Record<string, string>;
  requestsUsed: string | null;
  requestsRemaining: string | null;
  cachedAt: string;
}

// Determine best odds per outcome for a given market across all bookmakers
function findBestOdds(bookmakers: BookmakerOdds[], marketKey: string): BestOdds[] {
  const bestMap = new Map<string, BestOdds>();

  for (const book of bookmakers) {
    for (const outcome of book.outcomes) {
      const key = marketKey === "totals" ? outcome.name : outcome.name;
      const existing = bestMap.get(key);

      if (!existing || outcome.price > existing.bestPrice) {
        bestMap.set(key, {
          outcomeName: outcome.name,
          bestPrice: outcome.price,
          bestPoint: outcome.point,
          bestBook: book.title,
          bestBookKey: book.key,
        });
      }
    }
  }

  return Array.from(bestMap.values());
}

// Parse raw API response into our structured format
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseApiResponse(rawGames: any[]): GameOdds[] {
  return rawGames.map((game) => {
    const markets: MarketOdds[] = [];
    const bestOdds: Record<string, BestOdds[]> = {};

    // Group bookmaker data by market type
    const marketGroups = new Map<string, BookmakerOdds[]>();

    for (const bookmaker of game.bookmakers || []) {
      for (const market of bookmaker.markets || []) {
        const marketKey = market.key; // h2h, spreads, totals

        if (!marketGroups.has(marketKey)) {
          marketGroups.set(marketKey, []);
        }

        marketGroups.get(marketKey)!.push({
          key: bookmaker.key,
          title: BOOK_DISPLAY_NAMES[bookmaker.key] || bookmaker.title,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          outcomes: market.outcomes.map((o: any) => ({
            name: o.name,
            price: o.price,
            point: o.point,
          })),
          lastUpdate: market.last_update || bookmaker.last_update,
        });
      }
    }

    const marketKeys = Array.from(marketGroups.keys());
    for (const key of marketKeys) {
      const bookmakers = marketGroups.get(key)!;
      markets.push({ key, bookmakers });
      bestOdds[key] = findBestOdds(bookmakers, key);
    }

    return {
      id: game.id,
      sportKey: game.sport_key,
      homeTeam: game.home_team,
      awayTeam: game.away_team,
      commenceTime: game.commence_time,
      markets,
      bestOdds,
    };
  });
}

export async function GET(request: NextRequest) {
  if (!ODDS_API_KEY) {
    return NextResponse.json(
      { error: "ODDS_API_KEY is not configured" },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(request.url);
  const sport = searchParams.get("sport") || "nba";
  const sportKey = SPORT_MAP[sport.toLowerCase()];

  if (!sportKey) {
    return NextResponse.json(
      {
        error: `Invalid sport: ${sport}. Valid options: ${Object.keys(SPORT_MAP).join(", ")}`,
      },
      { status: 400 }
    );
  }

  try {
    // Fetch all three markets in parallel for maximum data coverage
    const marketTypes = ["h2h", "spreads", "totals"];

    const fetches = marketTypes.map((market) => {
      const url = new URL(`${BASE_URL}/sports/${sportKey}/odds`);
      url.searchParams.set("apiKey", ODDS_API_KEY!);
      url.searchParams.set("regions", "us,us2");
      url.searchParams.set("markets", market);
      url.searchParams.set("oddsFormat", "american");
      return fetch(url.toString(), { next: { revalidate: 300 } });
    });

    const responses = await Promise.all(fetches);

    // Check for errors
    for (const res of responses) {
      if (!res.ok) {
        const errorText = await res.text();
        console.error(`Odds API error (${res.status}):`, errorText);

        if (res.status === 401) {
          return NextResponse.json(
            { error: "Invalid API key" },
            { status: 401 }
          );
        }
        if (res.status === 429) {
          return NextResponse.json(
            { error: "Rate limit exceeded. Try again shortly." },
            { status: 429 }
          );
        }
      }
    }

    // Parse all responses
    const allData = await Promise.all(
      responses.map((res) => (res.ok ? res.json() : Promise.resolve([])))
    );

    // Merge market data: the API returns the same game structure for each market,
    // so we need to merge bookmaker data from each market call into unified game objects
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const gameMap = new Map<string, any>();

    for (const games of allData) {
      for (const game of games) {
        if (!gameMap.has(game.id)) {
          gameMap.set(game.id, {
            ...game,
            bookmakers: [],
          });
        }

        const existing = gameMap.get(game.id)!;

        // Merge bookmaker markets into the unified game
        for (const bookmaker of game.bookmakers || []) {
          const existingBook = existing.bookmakers.find(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (b: any) => b.key === bookmaker.key
          );

          if (existingBook) {
            // Add new markets to existing bookmaker
            existingBook.markets = [
              ...existingBook.markets,
              ...bookmaker.markets,
            ];
          } else {
            existing.bookmakers.push({ ...bookmaker });
          }
        }
      }
    }

    const mergedGames = Array.from(gameMap.values());
    const games = parseApiResponse(mergedGames);

    // Sort games by commence time (soonest first)
    games.sort(
      (a, b) =>
        new Date(a.commenceTime).getTime() -
        new Date(b.commenceTime).getTime()
    );

    // Pull rate limit info from last response headers
    const lastRes = responses[responses.length - 1];

    const response: OddsResponse = {
      games,
      sport,
      bookDisplayNames: BOOK_DISPLAY_NAMES,
      requestsUsed: lastRes.headers.get("x-requests-used"),
      requestsRemaining: lastRes.headers.get("x-requests-remaining"),
      cachedAt: new Date().toISOString(),
    };

    return NextResponse.json(response, {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60",
      },
    });
  } catch (err) {
    console.error("Odds API fetch error:", err);
    return NextResponse.json(
      { error: "Failed to fetch odds. Please try again." },
      { status: 500 }
    );
  }
}
