-- Decision trace per topic — deterministic, no LLM reasoning, safe to expose to owner.
alter table topics
  add column if not exists decision_trace jsonb;
