import assert from "node:assert/strict";
import test from "node:test";

import {
  getAiFeatureCatalogEntry,
  getAiFeatureCatalogGroups,
  resolveAiFeatureAccess,
} from "./feature-catalog";

test("截图识别统一为单一功能键 ocr_screenshot，旧文字结构化已下线", () => {
  const ocr = getAiFeatureCatalogEntry("ocr_screenshot");
  assert.equal(ocr?.label, "截图识别");
  assert.equal(ocr?.routing, "binding");
  assert.equal(ocr?.group, "business");

  assert.equal(getAiFeatureCatalogEntry("ocr_screenshot_structure"), null);
  assert.equal(resolveAiFeatureAccess("ocr_screenshot").allowed, true);
  assert.equal(resolveAiFeatureAccess("ocr_screenshot_structure").allowed, false);
  assert.equal(getAiFeatureCatalogEntry("not_a_real_feature"), null);
});

test("文案改写已物理下线，调用被总控层拦截为未注册功能", () => {
  const entry = getAiFeatureCatalogEntry("content_rewrite");
  assert.equal(entry, null);
  assert.deepEqual(resolveAiFeatureAccess("content_rewrite"), {
    allowed: false,
    reason: "未注册的 AI 功能：content_rewrite",
  });
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
    "video_tag",
    "ocr_screenshot_structure",
    "unknown_feature",
  ]) {
    assert.deepEqual(resolveAiFeatureAccess(featureKey), {
      allowed: false,
      reason: `未注册的 AI 功能：${featureKey}`,
    });
  }
});

test("管理页只保留确认在用的业务功能，不展示半成品或旧配置", () => {
  const groups = getAiFeatureCatalogGroups();

  assert.ok(groups.business.some((entry) => entry.key === "ocr_screenshot"));
  assert.equal(groups.business.some((entry) => entry.key === "ocr_screenshot_structure"), false);
  assert.deepEqual(
    groups.business.filter((entry) =>
      ["single_video", "growth_insight", "report_insight", "ai_insight", "smart_alert", "growth_advice", "video_diagnose", "admin_assistant", "feishu_fulfillment_reminder", "video_tag", "default", "content_rewrite", "ocr_screenshot_structure"].includes(entry.key),
    ),
    [],
  );
});
