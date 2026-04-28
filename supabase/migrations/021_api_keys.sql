-- api_keys — Supabase-backed key vault for external services.
--
-- Today this stores a single rotating Odds API key so JP can swap keys
-- without redeploying Vercel each time. Tomorrow it could hold ESPN
-- session cookies, Stripe webhook secrets, etc.
--
-- Read path: lib/odds-key.ts caches the active row for 30 sec then falls
-- back to process.env.ODDS_API_KEY if the table doesn't exist yet or is
-- empty. So this migration is non-blocking — pre-existing env-var setups
-- keep working.

CREATE TABLE IF NOT EXISTS api_keys (
  id          bigserial PRIMARY KEY,
  service     text NOT NULL,                    -- e.g. 'odds_api'
  key_value   text NOT NULL,
  active      boolean NOT NULL DEFAULT false,
  rotated_at  timestamptz NOT NULL DEFAULT now(),
  rotated_by  text,                              -- email of who rotated it
  notes       text
);

CREATE UNIQUE INDEX IF NOT EXISTS api_keys_one_active_per_service
  ON api_keys(service)
  WHERE active = true;

CREATE INDEX IF NOT EXISTS api_keys_service_rotated_at
  ON api_keys(service, rotated_at DESC);
