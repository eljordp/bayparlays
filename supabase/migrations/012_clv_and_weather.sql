-- ─── CLV Tracking + Weather Cache ─────────────────────────────────────────
-- CLV (Closing Line Value) is the industry-standard metric for proving a
-- model actually has edge. If your opening price consistently beats the
-- closing line (after the market has digested all news), you're sharp.
-- Hit rate is noise; CLV is signal.

-- Opening lines = leg odds at the moment the parlay was generated.
-- Closing lines = the last price in line_history before commence_time.
-- clv_percent = average per-leg (closing_decimal / opening_decimal - 1) * 100.

ALTER TABLE parlays
  ADD COLUMN IF NOT EXISTS opening_lines jsonb,
  ADD COLUMN IF NOT EXISTS closing_lines jsonb,
  ADD COLUMN IF NOT EXISTS clv_percent numeric;

CREATE INDEX IF NOT EXISTS idx_parlays_clv ON parlays(clv_percent);

-- Weather cache: Open-Meteo is free and unlimited but we still cache to
-- avoid redundant calls when multiple legs for the same game get scored
-- in the same render pass.
CREATE TABLE IF NOT EXISTS weather_cache (
  game_id text primary key,
  stadium text,
  temperature_f numeric,
  wind_mph numeric,
  wind_deg numeric,
  precipitation_mm numeric,
  fetched_at timestamptz default now()
);

CREATE INDEX IF NOT EXISTS idx_weather_cache_fetched ON weather_cache(fetched_at desc);

ALTER TABLE weather_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read weather_cache" ON weather_cache FOR SELECT USING (true);
CREATE POLICY "Service write weather_cache" ON weather_cache FOR INSERT WITH CHECK (true);
CREATE POLICY "Service update weather_cache" ON weather_cache FOR UPDATE USING (true);

-- Odds API quota tracker: read x-requests-used / x-requests-remaining from
-- Odds API response headers after each fetch. Surface on /admin to know
-- how close we are to the 500/mo free limit.
CREATE TABLE IF NOT EXISTS odds_api_quota (
  id int primary key default 1,
  used int default 0,
  remaining int default 500,
  last_request_at timestamptz default now(),
  CHECK (id = 1)
);

INSERT INTO odds_api_quota (id, used, remaining) VALUES (1, 0, 500)
  ON CONFLICT (id) DO NOTHING;

ALTER TABLE odds_api_quota ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read quota" ON odds_api_quota FOR SELECT USING (true);
CREATE POLICY "Service write quota" ON odds_api_quota FOR UPDATE USING (true);
