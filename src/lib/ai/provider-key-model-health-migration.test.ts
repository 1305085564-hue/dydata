import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../../../supabase/migrations/20261005210000_ai_provider_key_model_health.sql", import.meta.url),
  "utf8",
);

test("模型级健康迁移只增加兼容字段和受限 RPC", () => {
  assert.match(migration, /alter table public\.ai_provider_key_models/i);
  for (const column of [
    "consecutive_failures",
    "unhealthy_until",
    "last_failure_at",
    "last_success_at",
    "last_error_message",
    "last_failure_scope",
  ]) {
    assert.match(migration, new RegExp(`add column if not exists ${column}`, "i"));
  }
  assert.match(migration, /create index if not exists idx_ai_provider_key_models_health/i);
  assert.match(migration, /create or replace function public\.bump_provider_key_model_failure/i);
  assert.match(migration, /grant execute on function public\.bump_provider_key_model_failure\(uuid, text, text\)\s+to service_role/i);
  assert.match(migration, /revoke all on function public\.bump_provider_key_model_failure\(uuid, text, text\)\s+from public, anon, authenticated/i);
});
