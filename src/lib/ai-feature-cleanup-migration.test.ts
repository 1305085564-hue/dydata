import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sql = readFileSync(
  new URL("../../supabase/migrations/20260801103000_remove_dead_ai_features.sql", import.meta.url),
  "utf8",
);

const removedFeatureKeys = [
  "single_video",
  "growth_insight",
  "report_insight",
  "ai_insight",
  "smart_alert",
  "growth_advice",
  "video_diagnose",
  "admin_assistant",
  "feishu_fulfillment_reminder",
];

test("AI 旧功能清理迁移同时删除配置和恢复快照", () => {
  assert.match(sql, /delete from public\.ai_feature_config_archives/i);
  assert.match(sql, /delete from public\.ai_feature_config\b/i);
  assert.match(sql, /delete from public\.ai_feature_bindings/i);
  for (const featureKey of removedFeatureKeys) {
    assert.match(sql, new RegExp(`'${featureKey}'`));
  }
});

test("功能生命周期事务只接受确认在线的功能，并包含首页截图识别", () => {
  const functionSql = sql.slice(sql.indexOf("create or replace function public.manage_ai_feature_lifecycle"));

  assert.match(functionSql, /'ocr_screenshot'/);
  assert.match(functionSql, /'content_analysis'/);
  for (const featureKey of removedFeatureKeys) {
    assert.doesNotMatch(functionSql, new RegExp(`'${featureKey}'`));
  }
});
