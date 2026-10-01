import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../../../supabase/migrations/20261001095105_restore_provider_key_health_rpc.sql", import.meta.url),
  "utf8",
);

test("provider key health 修复迁移不改历史版本，并在表存在时恢复失败计数 RPC", () => {
  assert.match(migration, /to_regclass\('public\.ai_provider_keys'\)/i);
  assert.match(migration, /create or replace function public\.bump_provider_key_failure\(/i);
  assert.match(migration, /returns void/i);
  assert.match(migration, /security definer/i);
  assert.match(migration, /set search_path = public/i);
  assert.match(migration, /consecutive_failures = public\.ai_provider_keys\.consecutive_failures \+ 1/i);
  assert.match(migration, /unhealthy_until/i);
  assert.match(migration, /revoke all on function public\.bump_provider_key_failure\(uuid, text\)/i);
  assert.match(migration, /grant execute on function public\.bump_provider_key_failure\(uuid, text\) to service_role/i);
});

test("provider key health 修复迁移不偷偷承担渠道绑定改写", () => {
  assert.doesNotMatch(migration, /ai_feature_bindings/i);
  assert.doesNotMatch(migration, /update public\.ai_feature_bindings/i);
});
