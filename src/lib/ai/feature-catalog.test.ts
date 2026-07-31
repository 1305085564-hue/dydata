import assert from "node:assert/strict";
import test from "node:test";

import {
  getAiFeatureCatalogEntry,
  getAiFeatureCatalogGroups,
  resolveAiFeatureAccess,
} from "./feature-catalog";

test("业务功能目录只暴露真实业务名称，不把内部 key 交给管理员维护", () => {
  const entry = getAiFeatureCatalogEntry("growth_insight");

  assert.equal(entry?.label, "成长诊断");
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

test("归档功能与未注册功能都被总控层拦截，不能静默掉进兜底渠道", () => {
  assert.deepEqual(resolveAiFeatureAccess("smart_alert"), {
    allowed: false,
    reason: "智能预警已归档，不能再调用 AI",
  });
  assert.deepEqual(resolveAiFeatureAccess("unknown_feature"), {
    allowed: false,
    reason: "未注册的 AI 功能：unknown_feature",
  });
});

test("管理页按业务、改写、待核验和归档分组，不把内部默认项放进业务配置", () => {
  const groups = getAiFeatureCatalogGroups();

  assert.ok(groups.business.some((entry) => entry.key === "growth_insight"));
  assert.ok(groups.rewrite.some((entry) => entry.key === "content_rewrite"));
  assert.ok(groups.review.some((entry) => entry.key === "report_insight"));
  assert.ok(groups.archived.some((entry) => entry.key === "admin_assistant"));
  assert.ok(groups.archived.some((entry) => entry.key === "feishu_fulfillment_reminder"));
  assert.ok(!groups.business.some((entry) => entry.key === "default"));
});
