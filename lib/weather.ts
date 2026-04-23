// ─── Weather for MLB Totals ───────────────────────────────────────────────
// Wind direction + speed + temperature at outdoor MLB stadiums moves run
// totals meaningfully. Hot + wind blowing OUT at Wrigley = over. Cold + wind
// IN at Oracle = under. Sportsbooks adjust for this slowly in some markets.
//
// Open-Meteo is FREE and unlimited with no API key required.
// https://open-meteo.com/en/docs
//
// Only outdoor stadiums matter — domes are listed but return null weather.

import { createClient } from "@supabase/supabase-js";

// Coordinates are stadium sites. Elevation included for altitude-sensitive
// parks (Coors Field is the big one). Roof "closed" = treat as indoor.
export interface Stadium {
  team: string;
  name: string;
  lat: number;
  lon: number;
  outdoor: boolean;
  elevation_ft: number;
}

export const MLB_STADIUMS: Record<string, Stadium> = {
  "Arizona Diamondbacks": { team: "Arizona Diamondbacks", name: "Chase Field", lat: 33.4455, lon: -112.0667, outdoor: false, elevation_ft: 1100 },
  "Atlanta Braves":       { team: "Atlanta Braves",       name: "Truist Park", lat: 33.8908, lon: -84.4678, outdoor: true, elevation_ft: 1050 },
  "Baltimore Orioles":    { team: "Baltimore Orioles",    name: "Camden Yards", lat: 39.2839, lon: -76.6217, outdoor: true, elevation_ft: 36 },
  "Boston Red Sox":       { team: "Boston Red Sox",       name: "Fenway Park", lat: 42.3467, lon: -71.0972, outdoor: true, elevation_ft: 21 },
  "Chicago Cubs":         { team: "Chicago Cubs",         name: "Wrigley Field", lat: 41.9484, lon: -87.6553, outdoor: true, elevation_ft: 595 },
  "Chicago White Sox":    { team: "Chicago White Sox",    name: "Guaranteed Rate Field", lat: 41.8299, lon: -87.6338, outdoor: true, elevation_ft: 595 },
  "Cincinnati Reds":      { team: "Cincinnati Reds",      name: "Great American Ball Park", lat: 39.0974, lon: -84.5066, outdoor: true, elevation_ft: 490 },
  "Cleveland Guardians":  { team: "Cleveland Guardians",  name: "Progressive Field", lat: 41.4962, lon: -81.6852, outdoor: true, elevation_ft: 650 },
  "Colorado Rockies":     { team: "Colorado Rockies",     name: "Coors Field", lat: 39.7559, lon: -104.9942, outdoor: true, elevation_ft: 5200 },
  "Detroit Tigers":       { team: "Detroit Tigers",       name: "Comerica Park", lat: 42.3390, lon: -83.0485, outdoor: true, elevation_ft: 600 },
  "Houston Astros":       { team: "Houston Astros",       name: "Minute Maid Park", lat: 29.7572, lon: -95.3552, outdoor: false, elevation_ft: 22 },
  "Kansas City Royals":   { team: "Kansas City Royals",   name: "Kauffman Stadium", lat: 39.0517, lon: -94.4803, outdoor: true, elevation_ft: 750 },
  "Los Angeles Angels":   { team: "Los Angeles Angels",   name: "Angel Stadium", lat: 33.8003, lon: -117.8827, outdoor: true, elevation_ft: 160 },
  "Los Angeles Dodgers":  { team: "Los Angeles Dodgers",  name: "Dodger Stadium", lat: 34.0739, lon: -118.2400, outdoor: true, elevation_ft: 500 },
  "Miami Marlins":        { team: "Miami Marlins",        name: "loanDepot Park", lat: 25.7781, lon: -80.2197, outdoor: false, elevation_ft: 10 },
  "Milwaukee Brewers":    { team: "Milwaukee Brewers",    name: "American Family Field", lat: 43.0280, lon: -87.9712, outdoor: false, elevation_ft: 650 },
  "Minnesota Twins":      { team: "Minnesota Twins",      name: "Target Field", lat: 44.9817, lon: -93.2776, outdoor: true, elevation_ft: 815 },
  "New York Mets":        { team: "New York Mets",        name: "Citi Field", lat: 40.7571, lon: -73.8458, outdoor: true, elevation_ft: 20 },
  "New York Yankees":     { team: "New York Yankees",     name: "Yankee Stadium", lat: 40.8296, lon: -73.9262, outdoor: true, elevation_ft: 55 },
  "Oakland Athletics":    { team: "Oakland Athletics",    name: "Oakland Coliseum", lat: 37.7516, lon: -122.2005, outdoor: true, elevation_ft: 40 },
  "Philadelphia Phillies":{ team: "Philadelphia Phillies",name: "Citizens Bank Park", lat: 39.9061, lon: -75.1665, outdoor: true, elevation_ft: 39 },
  "Pittsburgh Pirates":   { team: "Pittsburgh Pirates",   name: "PNC Park", lat: 40.4469, lon: -80.0057, outdoor: true, elevation_ft: 730 },
  "San Diego Padres":     { team: "San Diego Padres",     name: "Petco Park", lat: 32.7073, lon: -117.1566, outdoor: true, elevation_ft: 62 },
  "San Francisco Giants": { team: "San Francisco Giants", name: "Oracle Park", lat: 37.7786, lon: -122.3893, outdoor: true, elevation_ft: 12 },
  "Seattle Mariners":     { team: "Seattle Mariners",     name: "T-Mobile Park", lat: 47.5914, lon: -122.3325, outdoor: false, elevation_ft: 56 },
  "St. Louis Cardinals":  { team: "St. Louis Cardinals",  name: "Busch Stadium", lat: 38.6226, lon: -90.1928, outdoor: true, elevation_ft: 465 },
  "Tampa Bay Rays":       { team: "Tampa Bay Rays",       name: "Tropicana Field", lat: 27.7682, lon: -82.6534, outdoor: false, elevation_ft: 44 },
  "Texas Rangers":        { team: "Texas Rangers",        name: "Globe Life Field", lat: 32.7473, lon: -97.0847, outdoor: false, elevation_ft: 550 },
  "Toronto Blue Jays":    { team: "Toronto Blue Jays",    name: "Rogers Centre", lat: 43.6414, lon: -79.3894, outdoor: false, elevation_ft: 250 },
  "Washington Nationals": { team: "Washington Nationals", name: "Nationals Park", lat: 38.8730, lon: -77.0074, outdoor: true, elevation_ft: 25 },
};

export interface WeatherSignal {
  stadium: string;
  outdoor: boolean;
  temperature_f: number | null;
  wind_mph: number | null;
  wind_deg: number | null;
  precipitation_mm: number | null;
  // Qualitative bias on the game total. Positive = leans over. Negative = leans under.
  // Range roughly [-0.6, +0.6] runs. Intentionally conservative.
  run_bias: number;
  reason: string | null;
}

/**
 * Fetch weather at a stadium around commence_time (hourly, so we pick the
 * hour closest to first pitch). Cached per game in Supabase for 6hrs.
 */
export async function fetchGameWeather(
  homeTeam: string,
  gameId: string,
  commenceTime: string
): Promise<WeatherSignal | null> {
  const stadium = MLB_STADIUMS[homeTeam];
  if (!stadium) return null;

  // Indoor games have no weather signal.
  if (!stadium.outdoor) {
    return {
      stadium: stadium.name,
      outdoor: false,
      temperature_f: null,
      wind_mph: null,
      wind_deg: null,
      precipitation_mm: null,
      run_bias: 0,
      reason: null,
    };
  }

  // Check cache first (6hr TTL — weather forecast doesn't change hour-to-hour)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  let cached: { temperature_f: number | null; wind_mph: number | null; wind_deg: number | null; precipitation_mm: number | null; fetched_at: string } | null = null;
  if (supabaseUrl && supabaseKey) {
    try {
      const supabase = createClient(supabaseUrl, supabaseKey);
      const { data } = await supabase
        .from("weather_cache")
        .select("*")
        .eq("game_id", gameId)
        .maybeSingle();
      if (data) {
        const age = Date.now() - new Date(data.fetched_at).getTime();
        if (age < 6 * 60 * 60 * 1000) cached = data;
      }
    } catch {
      // Ignore cache errors — we'll just fetch
    }
  }

  let temp: number | null;
  let wind: number | null;
  let windDeg: number | null;
  let precip: number | null;

  if (cached) {
    temp = cached.temperature_f;
    wind = cached.wind_mph;
    windDeg = cached.wind_deg;
    precip = cached.precipitation_mm;
  } else {
    // Fetch from Open-Meteo
    const date = commenceTime.slice(0, 10); // YYYY-MM-DD
    const url =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${stadium.lat}&longitude=${stadium.lon}` +
      `&hourly=temperature_2m,wind_speed_10m,wind_direction_10m,precipitation` +
      `&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=mm` +
      `&start_date=${date}&end_date=${date}` +
      `&timezone=auto`;

    try {
      const res = await fetch(url, { next: { revalidate: 3600 } });
      if (!res.ok) return null;
      type OpenMeteoResp = {
        hourly?: {
          time: string[];
          temperature_2m: number[];
          wind_speed_10m: number[];
          wind_direction_10m: number[];
          precipitation: number[];
        };
      };
      const data: OpenMeteoResp = await res.json();
      const times: string[] = data.hourly?.time ?? [];
      const tempsArr: number[] = data.hourly?.temperature_2m ?? [];
      const windsArr: number[] = data.hourly?.wind_speed_10m ?? [];
      const windDegsArr: number[] = data.hourly?.wind_direction_10m ?? [];
      const precipsArr: number[] = data.hourly?.precipitation ?? [];

      // Find hour closest to commence_time
      const target = new Date(commenceTime).getTime();
      let bestIdx = 0;
      let bestDiff = Infinity;
      for (let i = 0; i < times.length; i++) {
        const diff = Math.abs(new Date(times[i]).getTime() - target);
        if (diff < bestDiff) { bestDiff = diff; bestIdx = i; }
      }
      temp = tempsArr[bestIdx] ?? null;
      wind = windsArr[bestIdx] ?? null;
      windDeg = windDegsArr[bestIdx] ?? null;
      precip = precipsArr[bestIdx] ?? null;

      // Persist to cache
      if (supabaseUrl && supabaseKey) {
        try {
          const supabase = createClient(supabaseUrl, supabaseKey);
          await supabase.from("weather_cache").upsert({
            game_id: gameId,
            stadium: stadium.name,
            temperature_f: temp,
            wind_mph: wind,
            wind_deg: windDeg,
            precipitation_mm: precip,
            fetched_at: new Date().toISOString(),
          });
        } catch {
          // Non-fatal
        }
      }
    } catch {
      return null;
    }
  }

  return {
    stadium: stadium.name,
    outdoor: true,
    temperature_f: temp,
    wind_mph: wind,
    wind_deg: windDeg,
    precipitation_mm: precip,
    ...computeRunBias({ temp, wind, windDeg, precip, elevation: stadium.elevation_ft }),
  };
}

/**
 * Turn raw weather numbers into a run bias for totals markets. Conservative
 * by design — weather matters at the margins, not as a standalone signal.
 *
 * Bias convention: positive = more runs (favors OVER), negative = fewer (favors UNDER).
 */
function computeRunBias(w: {
  temp: number | null;
  wind: number | null;
  windDeg: number | null;
  precip: number | null;
  elevation: number;
}): { run_bias: number; reason: string | null } {
  const reasons: string[] = [];
  let bias = 0;

  // Heat helps the ball carry. 85F+ is a mild tailwind for offense.
  if (w.temp !== null) {
    if (w.temp >= 90) { bias += 0.2; reasons.push(`${Math.round(w.temp)}F heat`); }
    else if (w.temp >= 80) { bias += 0.1; }
    else if (w.temp <= 45) { bias -= 0.2; reasons.push(`${Math.round(w.temp)}F cold`); }
    else if (w.temp <= 55) { bias -= 0.1; }
  }

  // Wind is the big one. 15+mph matters. Direction matters more.
  // We don't have stadium orientation data so we use wind speed only
  // as a proxy (high wind = more volatility; we lean slightly over).
  if (w.wind !== null && w.wind >= 15) {
    bias += 0.15;
    reasons.push(`${Math.round(w.wind)}mph wind`);
  }

  // Rain kills scoring.
  if (w.precip !== null && w.precip >= 2) {
    bias -= 0.25;
    reasons.push("rain forecast");
  }

  // Coors bias is already baked into the total by the book, don't double-count.
  // We only adjust for unusually cold/hot Colorado nights.

  return {
    run_bias: Math.round(bias * 100) / 100,
    reason: reasons.length ? reasons.join(", ") : null,
  };
}
