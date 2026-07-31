import assert from "node:assert/strict";
import test from "node:test";

import {
  getAiFeatureCatalogEntry,
  getAiFeatureCatalogGroups,
  resolveAiFeatureAccess,
} from "./feature-catalog";

test("业务功能目录只暴露真实业务名称，不把内部 key 交给管理员维护", () => {
  const entry = getAiFeatureCatalogEntry("ocr_screenshot");

  assert.equal(entry?.label, "截图识别");
  assert.equal(entry?.description, "首页日报截图识别与指标回填");
  assert.equal(entry?.routing, "binding");
  assert.equal(entry?.group, "business");
  assert.equal(getAiFeatureCatalogEntry("not_a_real_feature"), null);
});

test("文案改写明确使用专用路由，不可作为普通模型绑定处理", () => {
  const entry = getAiFeatureCatalogEntry("content_rewrite");

  assert.equal(entry?.routing, "rewrite");
  assert.equal(resolveAiFeatureAccess("content_rewrite").allowed, false);
  assert.match(resolveAiFeatureAccess("content_rewrite").reason ?? "", /文案改写/);
});

test("已删除和未注册功能都被总控层拦截，不能静默掉进兜底渠道", () => {
  for (const featureKey of [
    "single_video",
    "growth_insight",
    "report_insight",
    "ai_insight",
    "smart_alert",
    "growth_advice",
    "video_diagnose",
    "admin_assistant",
    "feishu_fulfillment_reminder",
    "unknown_feature",
  ]) {
    assert.deepEqual(resolveAiFeatureAccess(featureKey), {
      allowed: false,
      reason: `未注册的 AI 功能：${featureKey}`,
    });
  }
});

test("管理页只保留确认在用的业务和文案改写，不展示半成品或旧配置", () => {
  const groups = getAiFeatureCatalogGroups();

  assert.ok(groups.business.some((entry) => entry.key === "ocr_screenshot"));
  assert.ok(groups.rewrite.some((entry) => entry.key === "content_rewrite"));
  assert.deepEqual(
    [...groups.business, ...groups.rewrite].filter((entry) =>
      ["single_video", "growth_insight", "report_insight", "ai_insight", "smart_alert", "growth_advice", "video_diagnose", "admin_assistant", "feishu_fulfillment_reminder", "default"].includes(entry.key),
    ),
    [],
  );
});
