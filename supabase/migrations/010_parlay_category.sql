-- Tag each tracked parlay with the AI strategy that produced it.
-- Values: 'ev' (Best EV), 'payout' (Highest Payout), 'confidence' (Most Confident).
-- Historical rows will be NULL until backfilled.

ALTER TABLE parlays
ADD COLUMN IF NOT EXISTS category TEXT;

CREATE INDEX IF NOT EXISTS parlays_category_idx ON parlays(category);
CREATE INDEX IF NOT EXISTS parlays_confidence_idx ON parlays(confidence);
