-- Widen columns that receive LLM-generated values, which can be longer
-- and less predictable than our fixed rule-table values.
ALTER TABLE diagnoses ALTER COLUMN cause TYPE VARCHAR(128);
ALTER TABLE diagnoses ALTER COLUMN confidence TYPE VARCHAR(32);
ALTER TABLE diagnoses ALTER COLUMN source TYPE VARCHAR(32);
ALTER TABLE diagnoses ALTER COLUMN recommended_action TYPE VARCHAR(64);