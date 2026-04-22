-- Add category column to sim_parlays for tracking which AI strategy produced each pick
-- Values: 'ev' (Best EV), 'payout' (Highest Payout), 'confidence' (Most Confident)

ALTER TABLE sim_parlays
ADD COLUMN IF NOT EXISTS category TEXT;

CREATE INDEX IF NOT EXISTS sim_parlays_category_idx ON sim_parlays(category);
