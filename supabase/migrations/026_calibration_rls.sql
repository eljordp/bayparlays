-- RLS fix: model_calibration and model_weights need public-read policies
-- so the admin pages and /api/parlays (which use the anon Supabase client)
-- can actually see the rows the service-role cron just wrote.
--
-- Without these policies, RLS silently blocks every SELECT and the admin
-- pages render empty even after a successful recompute. The cron is
-- unaffected because it uses SUPABASE_SERVICE_ROLE_KEY which bypasses RLS.
--
-- Pattern matches research_parlays / weather_cache / edge_picks — same
-- reasoning: these tables hold internal model stats, no user-identifying
-- data, safe to expose for SELECT.

ALTER TABLE model_calibration ENABLE ROW LEVEL SECURITY;
ALTER TABLE model_weights ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read model_calibration" ON model_calibration;
DROP POLICY IF EXISTS "Service write model_calibration" ON model_calibration;
DROP POLICY IF EXISTS "Service update model_calibration" ON model_calibration;

CREATE POLICY "Public read model_calibration"
  ON model_calibration FOR SELECT USING (true);
CREATE POLICY "Service write model_calibration"
  ON model_calibration FOR INSERT WITH CHECK (true);
CREATE POLICY "Service update model_calibration"
  ON model_calibration FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Public read model_weights" ON model_weights;
DROP POLICY IF EXISTS "Service write model_weights" ON model_weights;

CREATE POLICY "Public read model_weights"
  ON model_weights FOR SELECT USING (true);
CREATE POLICY "Service write model_weights"
  ON model_weights FOR INSERT WITH CHECK (true);
