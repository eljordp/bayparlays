-- v2 calibration: bucket by (sport × market × odds_bucket) at LEG level.
--
-- v1 (migration 016) bucketed at the parlay level by sport only. That
-- conflates wildly different bet types — NBA spreads hit ~68%, NBA
-- moneylines hit ~22% — and a single blanket NBA factor averages those
-- into noise. v2 splits by market AND by odds range so each cell is a
-- coherent bet type.
--
-- Adds:
--   - model_calibration.odds_bucket — text key like "fav" / "pick" / "dog"
--   - composite index on (sport, market, odds_bucket, computed_at desc)
--
-- The reader in /api/parlays cascades most-specific → general:
--   sport+market+bucket  →  sport+market  →  sport  →  _GLOBAL
-- so old v1 rows still feed the cascade as fallback.

ALTER TABLE model_calibration
  ADD COLUMN IF NOT EXISTS odds_bucket text;

CREATE INDEX IF NOT EXISTS idx_calibration_v2_lookup
  ON model_calibration(sport, market, odds_bucket, computed_at DESC);

-- Document the bucket scheme inline so anyone reading the DB knows the
-- canonical labels without hunting through code.
COMMENT ON COLUMN model_calibration.odds_bucket IS
  'Decimal-odds bucket. NULL = bucket-agnostic (legacy/global). '
  'Buckets: heavy_fav (≤1.50, -200 or shorter), fav (1.50-1.91, -200 to -110), '
  'pick (1.91-2.10, -110 to +110), dog (2.10-3.00, +110 to +200), '
  'long (3.00-6.00, +200 to +500), moon (>6.00, +500+).';
