// Per-leg logistic regression inference.
//
// Pure-TS implementation so we can run it both server-side (training cron,
// parlay generation) and in scripts without any Python/scikit dependency.
//
// The model is a vanilla logistic regression: σ(intercept + Σ w_i * x_i).
// Continuous features get z-scored using the means/stds saved at train
// time. Categorical features are one-hot encoded and either present (1)
// or absent (0). Booleans are 0/1.
//
// MODEL_VERSION must be bumped whenever the feature set changes shape,
// so a stale row from a previous schema can't be silently consumed.

export const MODEL_VERSION = 1;

export interface ModelWeights {
  intercept: number;
  weights: Record<string, number>;
  feature_means: Record<string, number>;
  feature_stds: Record<string, number>;
  feature_order: string[];
}

// What we need from each leg to score it. Mirrors the subset of ScoredLeg
// the model actually consumes — calling code constructs this from whatever
// shape its leg objects have.
export interface LegFeatures {
  sport?: string;
  market?: string;
  decimalOdds?: number;
  ourProb?: number;
  fairProb?: number | null;
  evVsFair?: number | null;
  bookCount?: number;
  sharpEdge?: boolean;
  hasWeatherNote?: boolean;
  hasPitcherNote?: boolean;
  hasInjuryNote?: boolean;
  hasRestNote?: boolean;
  scored?: boolean;
}

// ─── Feature canonicalization ──────────────────────────────────────────────
//
// The training cron and the inference path MUST produce the same feature
// vector for the same leg, or weights learned on one will be applied to a
// different shape on the other. extractFeatures is the single source of
// truth for that mapping.
//
// INVARIANT: every code path that needs a feature vector — training,
// inference, validation, debug tooling — calls extractFeatures(leg)
// directly. NEVER inline the field reads or default-fills elsewhere.
// If a leg is missing a field (e.g. fairProb on a leg that skipped
// de-vig), the default applied here is what the model was trained on,
// so the inference value matches the training distribution by
// construction. Inlining defaults at the call site would silently
// break this — the model would have learned weights for one default
// and the caller would feed it another.

const SPORTS = ["NBA", "NFL", "MLB", "NHL", "UFC", "NCAAF", "NCAAB", "soccer"] as const;
const MARKETS = ["moneyline", "spread", "total"] as const;
const ODDS_BUCKETS = ["heavy_fav", "fav", "pick", "dog", "long", "moon"] as const;

export function oddsBucketFor(decimal: number | undefined): string | null {
  if (typeof decimal !== "number" || !isFinite(decimal) || decimal <= 1) return null;
  if (decimal <= 1.5) return "heavy_fav";
  if (decimal <= 1.91) return "fav";
  if (decimal <= 2.1) return "pick";
  if (decimal <= 3.0) return "dog";
  if (decimal <= 6.0) return "long";
  return "moon";
}

// Canonical ordered list of every feature name the model supports. Used
// both for training (so weights end up in a consistent order) and as the
// `feature_order` array stored alongside the weights.
export function canonicalFeatureOrder(): string[] {
  const cont = ["decimalOdds", "ourProb", "fairProb", "evVsFair", "bookCount"];
  const bools = [
    "sharpEdge",
    "hasWeatherNote",
    "hasPitcherNote",
    "hasInjuryNote",
    "hasRestNote",
    "scored",
  ];
  const sportOneHot = SPORTS.map((s) => `sport_${s.toUpperCase()}`);
  const marketOneHot = MARKETS.map((m) => `market_${m}`);
  const bucketOneHot = ODDS_BUCKETS.map((b) => `bucket_${b}`);
  return [...cont, ...bools, ...sportOneHot, ...marketOneHot, ...bucketOneHot];
}

export const CONTINUOUS_FEATURES = ["decimalOdds", "ourProb", "fairProb", "evVsFair", "bookCount"];

export function extractFeatures(leg: LegFeatures): Record<string, number> {
  const out: Record<string, number> = {};

  // Continuous — fall back to neutral defaults when missing so the feature
  // still appears in the vector but contributes nothing useful (the z-score
  // transform turns "= the mean" into 0).
  out.decimalOdds = typeof leg.decimalOdds === "number" ? leg.decimalOdds : 2.0;
  out.ourProb = typeof leg.ourProb === "number" ? leg.ourProb : 0.5;
  out.fairProb = typeof leg.fairProb === "number" ? leg.fairProb : (out.ourProb ?? 0.5);
  out.evVsFair = typeof leg.evVsFair === "number" ? leg.evVsFair : 0;
  out.bookCount = typeof leg.bookCount === "number" ? leg.bookCount : 1;

  // Booleans
  out.sharpEdge = leg.sharpEdge ? 1 : 0;
  out.hasWeatherNote = leg.hasWeatherNote ? 1 : 0;
  out.hasPitcherNote = leg.hasPitcherNote ? 1 : 0;
  out.hasInjuryNote = leg.hasInjuryNote ? 1 : 0;
  out.hasRestNote = leg.hasRestNote ? 1 : 0;
  out.scored = leg.scored ? 1 : 0;

  // Sport one-hot — match against canonical labels case-insensitively.
  const sportUp = (leg.sport ?? "").toUpperCase();
  for (const s of SPORTS) {
    out[`sport_${s.toUpperCase()}`] = sportUp === s.toUpperCase() ? 1 : 0;
  }

  // Market one-hot
  const marketLower = (leg.market ?? "").toLowerCase();
  for (const m of MARKETS) {
    out[`market_${m}`] = marketLower === m ? 1 : 0;
  }

  // Odds-bucket one-hot
  const bucket = oddsBucketFor(leg.decimalOdds);
  for (const b of ODDS_BUCKETS) {
    out[`bucket_${b}`] = bucket === b ? 1 : 0;
  }

  return out;
}

// Apply z-score transform to continuous features using train-time stats.
// Standardization keeps gradient descent well-conditioned and lets weights
// be interpretable as "effect per standard deviation."
export function standardize(
  features: Record<string, number>,
  means: Record<string, number>,
  stds: Record<string, number>,
): Record<string, number> {
  const out: Record<string, number> = { ...features };
  for (const name of CONTINUOUS_FEATURES) {
    const mean = means[name];
    const std = stds[name];
    if (typeof mean === "number" && typeof std === "number" && std > 1e-9) {
      out[name] = ((features[name] ?? mean) - mean) / std;
    }
  }
  return out;
}

function sigmoid(z: number): number {
  // Stable form: avoid exp overflow on large |z|.
  if (z >= 0) {
    const ez = Math.exp(-z);
    return 1 / (1 + ez);
  }
  const ez = Math.exp(z);
  return ez / (1 + ez);
}

// Score a leg against learned weights. Returns P(win) ∈ (0, 1).
// If the weights object is malformed or missing required transforms,
// falls back to leg.ourProb so the caller never gets garbage.
export function predictProb(leg: LegFeatures, model: ModelWeights | null): number {
  if (!model) return typeof leg.ourProb === "number" ? leg.ourProb : 0.5;
  const raw = extractFeatures(leg);
  const x = standardize(raw, model.feature_means, model.feature_stds);
  let z = model.intercept;
  for (const name of model.feature_order) {
    const w = model.weights[name];
    if (typeof w !== "number") continue;
    const v = x[name];
    if (typeof v !== "number" || !isFinite(v)) continue;
    z += w * v;
  }
  if (!isFinite(z)) {
    return typeof leg.ourProb === "number" ? leg.ourProb : 0.5;
  }
  return sigmoid(z);
}

// ─── Training (used by the cron route) ─────────────────────────────────────
//
// Vanilla logistic regression with L2 regularization, batch gradient
// descent. Adequate for our sample size (~1k-10k legs). If we outgrow
// it, swap in a proper library or move to gradient-boosted trees.

export interface TrainSample {
  features: Record<string, number>;
  label: 0 | 1;
}

export interface TrainConfig {
  learningRate: number;
  l2: number;
  epochs: number;
  earlyStopPatience: number;
}

export const DEFAULT_TRAIN_CONFIG: TrainConfig = {
  learningRate: 0.05,
  l2: 0.01,
  epochs: 2000,
  earlyStopPatience: 50,
};

export interface TrainResult {
  intercept: number;
  weights: Record<string, number>;
  feature_means: Record<string, number>;
  feature_stds: Record<string, number>;
  feature_order: string[];
  trainLoss: number;
  valLoss: number;
  epochsRun: number;
}

function meanStd(values: number[]): { mean: number; std: number } {
  if (values.length === 0) return { mean: 0, std: 1 };
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance =
    values.reduce((s, v) => s + (v - mean) * (v - mean), 0) / values.length;
  return { mean, std: Math.sqrt(variance) };
}

function bceLoss(
  samples: TrainSample[],
  intercept: number,
  weights: Record<string, number>,
  featureOrder: string[],
): number {
  let loss = 0;
  for (const s of samples) {
    let z = intercept;
    for (const name of featureOrder) {
      const v = s.features[name] ?? 0;
      const w = weights[name] ?? 0;
      z += w * v;
    }
    const p = sigmoid(z);
    const safeP = Math.max(1e-9, Math.min(1 - 1e-9, p));
    loss += s.label === 1 ? -Math.log(safeP) : -Math.log(1 - safeP);
  }
  return loss / samples.length;
}

export function fitLogReg(
  rawSamples: TrainSample[],
  cfg: TrainConfig = DEFAULT_TRAIN_CONFIG,
  seed = 1337,
): TrainResult {
  const featureOrder = canonicalFeatureOrder();

  // Compute mean/std for continuous features only — categoricals stay 0/1.
  const feature_means: Record<string, number> = {};
  const feature_stds: Record<string, number> = {};
  for (const name of CONTINUOUS_FEATURES) {
    const col = rawSamples.map((s) => s.features[name] ?? 0);
    const { mean, std } = meanStd(col);
    feature_means[name] = mean;
    feature_stds[name] = std > 1e-9 ? std : 1;
  }

  // Standardize every sample once up front.
  const samples: TrainSample[] = rawSamples.map((s) => ({
    features: standardize(s.features, feature_means, feature_stds),
    label: s.label,
  }));

  // Deterministic 80/20 split using a tiny LCG so multiple runs on the
  // same data produce comparable train/val splits.
  let rng = seed;
  function rand() {
    rng = (rng * 1664525 + 1013904223) >>> 0;
    return rng / 0x100000000;
  }
  const shuffled = samples.slice();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const cut = Math.floor(shuffled.length * 0.8);
  const train = shuffled.slice(0, cut);
  const val = shuffled.slice(cut);

  // Init weights to 0 — gradient descent on convex BCE will converge from
  // anywhere; zero start gives a stable, reproducible run.
  let intercept = 0;
  const weights: Record<string, number> = {};
  for (const name of featureOrder) weights[name] = 0;

  let bestValLoss = Infinity;
  let bestState = { intercept, weights: { ...weights } };
  let stallEpochs = 0;
  let epochsRun = 0;

  for (let epoch = 0; epoch < cfg.epochs; epoch++) {
    epochsRun = epoch + 1;
    // Batch gradient: sum gradient over all training samples.
    let gradIntercept = 0;
    const grads: Record<string, number> = {};
    for (const name of featureOrder) grads[name] = 0;

    for (const s of train) {
      let z = intercept;
      for (const name of featureOrder) {
        z += (weights[name] ?? 0) * (s.features[name] ?? 0);
      }
      const p = sigmoid(z);
      const err = p - s.label;
      gradIntercept += err;
      for (const name of featureOrder) {
        grads[name] += err * (s.features[name] ?? 0);
      }
    }

    const n = train.length || 1;
    intercept -= cfg.learningRate * (gradIntercept / n);
    for (const name of featureOrder) {
      // Gradient + L2 penalty (don't penalize intercept).
      const g = grads[name] / n + cfg.l2 * weights[name];
      weights[name] -= cfg.learningRate * g;
    }

    if (epoch % 25 === 0 || epoch === cfg.epochs - 1) {
      const vl = bceLoss(val, intercept, weights, featureOrder);
      if (vl < bestValLoss - 1e-5) {
        bestValLoss = vl;
        bestState = { intercept, weights: { ...weights } };
        stallEpochs = 0;
      } else {
        stallEpochs += 25;
        if (stallEpochs >= cfg.earlyStopPatience) {
          break;
        }
      }
    }
  }

  const trainLoss = bceLoss(train, bestState.intercept, bestState.weights, featureOrder);
  const valLoss = bceLoss(val, bestState.intercept, bestState.weights, featureOrder);

  return {
    intercept: bestState.intercept,
    weights: bestState.weights,
    feature_means,
    feature_stds,
    feature_order: featureOrder,
    trainLoss,
    valLoss,
    epochsRun,
  };
}
