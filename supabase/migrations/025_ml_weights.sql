-- Logistic regression weights for per-leg win probability.
--
-- Calibration v2 (mig 023) and CLV gate (mig 024) operate on bucket-level
-- aggregates: "this bucket's hit rate is X" / "this bucket's CLV is Y."
-- Useful, but bucket-level. This migration adds storage for a real
-- per-leg model: a logistic regression that predicts P(win) from the
-- leg's features (sport, market, odds, ourProb, fairProb, sharpEdge,
-- weather/pitcher/injury/rest flags, etc).
--
-- The training cron fits weights nightly from graded leg outcomes and
-- writes a new versioned row. /api/parlays loads the latest version,
-- runs inference per candidate leg to get mlProb, blends with the
-- existing ourProb heuristic. The bucket calibration factor and CLV
-- gate still apply on top — this just gives us a smarter base estimate
-- before those layers run.
--
-- Why one row per training run (vs one row per feature):
--   - Inference needs ALL weights atomically to compute a probability.
--   - Splitting per-feature would mean a JOIN at every parlay request
--     and risk loading a partial weight set.
--   - JSONB lets us iterate on the feature set without schema migrations.

CREATE TABLE IF NOT EXISTS model_weights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trained_at timestamptz NOT NULL DEFAULT now(),

  -- Bumped manually whenever the feature set changes shape. Inference can
  -- refuse to load a row whose model_version doesn't match what the
  -- current code expects, falling back to no-ML behavior gracefully.
  model_version integer NOT NULL DEFAULT 1,

  -- Number of graded legs the fit was trained on. Below ~200 the model is
  -- effectively memorizing; the parlays route can use this to decide
  -- whether to trust mlProb at all (small samples → reduce blend weight).
  training_size integer NOT NULL,

  -- Final cross-entropy loss on train set + held-out validation set.
  -- Useful for spotting overfitting (val_loss climbing while train_loss
  -- drops) and for showing JP a quality signal in the admin view.
  train_loss numeric NOT NULL,
  val_loss numeric NOT NULL,

  -- The actual learned model. Schema:
  --   {
  --     "intercept": number,
  --     "weights": { [featureName: string]: number },
  --     "feature_means": { [continuousFeatureName: string]: number },
  --     "feature_stds":  { [continuousFeatureName: string]: number },
  --     "feature_order": string[]   // canonical order, frozen at train time
  --   }
  -- Continuous features are z-scored at train time; means+stds get stored
  -- so inference can apply the same transform.
  weights jsonb NOT NULL,

  -- Free-form notes from the training run (e.g. "L2=0.01, lr=0.05, 2000 epochs").
  notes text
);

CREATE INDEX IF NOT EXISTS idx_model_weights_lookup
  ON model_weights(model_version, trained_at DESC);
