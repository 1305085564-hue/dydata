import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sql = readFileSync(
  new URL(
    "../../supabase/migrations/20260914102806_reconcile_ai_input_bundle_schema.sql",
    import.meta.url,
  ),
  "utf8",
);

test("AI 输入包迁移补齐生成诊断所需字段并兼容线上旧表", () => {
  for (const column of [
    "insight_scope",
    "scope_entity_id",
    "input_version",
    "data_quality_state",
    "input_json",
    "generated_at",
  ]) {
    assert.match(sql, new RegExp(`add column if not exists ${column}\\b`, "i"));
  }

  assert.match(sql, /scope_entity_id\s*=\s*coalesce\(scope_entity_id,\s*content_item_id\)/i);
  assert.match(sql, /input_json\s*=\s*coalesce\(input_json,\s*input,\s*'\{\}'::jsonb\)/i);
  assert.match(sql, /generated_at\s*=\s*coalesce\(generated_at,\s*created_at,\s*now\(\)\)/i);
  assert.match(sql, /alter column insight_scope set not null/i);
  assert.match(sql, /alter column input_json set not null/i);
});

test("AI 输入包迁移恢复 026 的合法值约束并刷新 PostgREST schema cache", () => {
  assert.match(sql, /insight_scope in \('single_video',\s*'member_week',\s*'member_month',\s*'team_week',\s*'team_month'\)/i);
  assert.match(sql, /data_quality_state in \('sufficient',\s*'partial',\s*'insufficient'\)/i);
  assert.match(sql, /notify pgrst,\s*'reload schema'/i);
  assert.doesNotMatch(sql, /ai_insight_result_insight_type_check/i);
});
