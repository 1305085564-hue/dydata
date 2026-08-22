import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260823020000_audit_logs_smart_alert_dedupe.sql",
);

test("smart-alert claim migration uses a native unique key, not audit_logs text JSON operators", () => {
  const sql = readFileSync(migrationPath, "utf8");

  assert.match(sql, /create table if not exists public\.smart_alert_claims/i);
  assert.match(sql, /create unique index if not exists uq_smart_alert_claims_dedupe_key[\s\S]*where status in \('claimed', 'sent'\)/i);
  assert.match(sql, /status in \('claimed', 'sent', 'expired'\)/i);
  assert.doesNotMatch(sql, /detail\s*->>/i);
  assert.doesNotMatch(sql, /on public\.audit_logs/i);
});
