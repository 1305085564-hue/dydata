CREATE INDEX IF NOT EXISTS idx_ai_insight_result_json_meta
ON ai_insight_result USING gin (result_json jsonb_path_ops);
