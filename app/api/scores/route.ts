import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const ODDS_API_KEY = process.env.ODDS_API_KEY;
const BASE = "https://api.the-odds-api.com/v4/sports";

const SPORT_MAP: Record<string, string> = {
  nba: "basketball_nba",
  nfl: "americanfootball_nfl",
  mlb: "baseball_mlb",
  nhl: "icehockey_nhl",
};

interface ScoreData {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  completed: boolean;
  scores: { name: string; score: string }[] | null;
  last_update: string | null;
}

export async function GET(request: NextRequest) {
  const sport = request.nextUrl.searchParams.get("sport") || "nba";
  const sportKey = SPORT_MAP[sport.toLowerCase()];

  if (!sportKey || !ODDS_API_KEY) {
    return NextResponse.json({ games: [] });
  }

  try {
    const res = await fetch(
      `${BASE}/${sportKey}/scores/?apiKey=${ODDS_API_KEY}&daysFrom=1`,
      { next: { revalidate: 3600 } } // Cache 1 hour
    );

    if (!res.ok) return NextResponse.json({ games: [] });

    const data: ScoreData[] = await res.json();

    const now = new Date();
    const games = data.map((g) => {
      const commence = new Date(g.commence_time);
      const homeScore =
        g.scores?.find((s) => s.name === g.home_team)?.score || null;
      const awayScore =
        g.scores?.find((s) => s.name === g.away_team)?.score || null;

      let status: "live" | "upcoming" | "final" = "upcoming";
      if (g.completed) status = "final";
      else if (g.scores && commence < now) status = "live";

      return {
        id: g.id,
        homeTeam: g.home_team,
        awayTeam: g.away_team,
        homeScore,
        awayScore,
        status,
        commenceTime: g.commence_time,
        completed: g.completed,
      };
    });

    // Sort: live first, then upcoming, then completed
    games.sort((a, b) => {
      const order = { live: 0, upcoming: 1, final: 2 };
      return order[a.status] - order[b.status];
    });

    return NextResponse.json(
      {
        games,
        sport,
        updatedAt: new Date().toISOString(),
      },
      {
        headers: {
          "Cache-Control":
            "public, s-maxage=900, stale-while-revalidate=60",
        },
      }
    );
  } catch {
    return NextResponse.json({ games: [] });
  }
}
