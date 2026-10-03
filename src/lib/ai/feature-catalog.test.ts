import assert from "node:assert/strict";
import test from "node:test";

import {
  getAiFeatureCatalogEntry,
  getAiFeatureCatalogGroups,
  resolveAiFeatureAccess,
} from "./feature-catalog";

test("截图识别拆成看图回退和文字结构化两个功能键，语义各自独立", () => {
  const fallback = getAiFeatureCatalogEntry("ocr_screenshot");
  assert.equal(fallback?.label, "截图识别·看图回退");
  assert.equal(fallback?.description, "百度通道不可用时切回的视觉模型识别链路，只服务 vision 回退");
  assert.equal(fallback?.routing, "binding");
  assert.equal(fallback?.group, "business");

  const structure = getAiFeatureCatalogEntry("ocr_screenshot_structure");
  assert.equal(structure?.label, "截图识别·文字结构化");
  assert.equal(structure?.description, "百度通道 OCR 提字后的文本字段映射");
  assert.equal(structure?.routing, "binding");
  assert.equal(structure?.group, "business");

  assert.equal(resolveAiFeatureAccess("ocr_screenshot").allowed, true);
  assert.equal(resolveAiFeatureAccess("ocr_screenshot_structure").allowed, true);
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
  assert.ok(groups.business.some((entry) => entry.key === "ocr_screenshot_structure"));
  assert.deepEqual(
    groups.business.filter((entry) =>
      ["single_video", "growth_insight", "report_insight", "ai_insight", "smart_alert", "growth_advice", "video_diagnose", "admin_assistant", "feishu_fulfillment_reminder", "default", "content_rewrite"].includes(entry.key),
    ),
    [],
  );
});
