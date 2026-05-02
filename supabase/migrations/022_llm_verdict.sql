-- LLM-as-verifier columns on parlays.
--
-- The slate cron (post 2026-05-02) sends each candidate through
-- Gemini 2.5 Flash before publishing. The verifier returns:
--   verdict: "keep" | "soft" | "skip"
--   confidence: 0-100 LLM-rated probability
--   reason: one-sentence rationale
--
-- "skip" picks are dropped before insert. "keep" + "soft" both publish,
-- but "keep" sorts to the top of the slate. We persist the LLM verdict
-- on the row so the postmortem can compare actual outcomes against
-- both the statistical model AND the LLM's read.
--
-- Columns are nullable so historical rows (pre-this migration) stay
-- valid. Slate cron has a fallback that retries the insert without
-- these columns if the migration hasn't been applied yet.

ALTER TABLE parlays
  ADD COLUMN IF NOT EXISTS llm_verdict     text,    -- 'keep' / 'soft' / 'skip'
  ADD COLUMN IF NOT EXISTS llm_confidence  smallint, -- 0-100
  ADD COLUMN IF NOT EXISTS llm_reason      text;

CREATE INDEX IF NOT EXISTS idx_parlays_llm_verdict
  ON parlays(llm_verdict)
  WHERE llm_verdict IS NOT NULL;
