import assert from "node:assert/strict";
import test from "node:test";
import { computeAvailability, type AvailabilityModel } from "./availability";
import { buildDependencyPreview } from "./key-dependencies";
import { getAiFeatureCatalogGroups } from "@/lib/ai/feature-catalog";

const NOW = Date.parse("2026-11-05T10:00:00Z");
const provider = { id: "p", name: "本地", is_enabled: true };
const key = { id: "k", provider_id: "p", is_enabled: true };
const model = { id: "m", key_id: "k", model_id: "default-model", is_enabled: true };

for (const [label, patch, status, message] of [
  ["正常", {}, "normal", "business.normal"],
  ["到期恢复", { consecutive_failures: 1, unhealthy_until: new Date(NOW - 1000).toISOString() }, "normal", "business.normal"],
  ["歇着", { consecutive_failures: 1, unhealthy_until: new Date(NOW + 60_000).toISOString() }, "outage", "business.outage_retrying"],
  ["需要处理", { invalidated_at: new Date(NOW).toISOString() }, "outage", "business.outage"],
  ["关闭", { is_enabled: false }, "outage", "business.outage"],
] as const) {
  test(`全局默认现成状态：${label}，不计入业务数量`, () => {
    const report = computeAvailability({ providers: [provider], keys: [key],
      models: [{ ...model, ...patch }], defaultBinding: { feature_key: "default", model_id: model.model_id },
    }, { now: NOW });
    const assurance = report.businessAssurances.find(item => item.key === "default")!;
    assert.ok(assurance);
    assert.equal(assurance.label, "全局默认");
    assert.equal(assurance.routingStatus, status);
    assert.equal(assurance.messageKey, message);
    assert.equal(assurance.preferredModelId, status === "normal" ? model.model_id : null);
    assert.equal(assurance.selectedModelId, model.model_id);
    assert.equal(assurance.defaultModelId, model.model_id);
    assert.equal(assurance.schedulableChannelCount, status === "normal" ? 1 : 0);
    assert.deepEqual(report.businessSummary, { normal: 0, fallback: 0, outage: 0, needsAttentionChannels: label === "需要处理" ? 1 : 0 });
    assert.equal(report.affectedBusinessCount, 0);
  });
}

test("未设置默认或默认模型无供应都返回停摆；其他模型歇着不会影响默认文案", () => {
  for (const modelId of [null, "no-supply"]) {
    const report = computeAvailability({ providers: [provider], keys: [key],
      models: [{ ...model, unhealthy_until: new Date(NOW + 60_000).toISOString() }],
      defaultBinding: { feature_key: "default", model_id: modelId },
    }, { now: NOW });
    const assurance = report.businessAssurances.find(item => item.key === "default")!;
    assert.equal(assurance.routingStatus, "outage");
    assert.equal(assurance.messageKey, "business.outage");
    assert.equal(assurance.preferredModelId, null);
    assert.equal(assurance.defaultModelId, modelId);
  }
});

test("全局默认的停摆不额外计入正常/顶班/停摆数量或关闭影响名单", async () => {
  const models: AvailabilityModel[] = [model, { ...model, id: "other", model_id: "business-model" }];
  const bindings = [
    { feature_key: "default", model_id: model.model_id },
    ...getAiFeatureCatalogGroups().business.map(entry => ({ feature_key: entry.key, model_id: "business-model", is_enabled: true, lifecycle_state: "active" })),
  ];
  const tables: Record<string, unknown[]> = { ai_providers: [provider], ai_provider_keys: [key], ai_provider_key_models: models, ai_feature_bindings: bindings };
  const db = { from: (table: string) => ({ select: async () => ({ data: tables[table], error: null }) }) };
  const preview = await buildDependencyPreview(db, { scope: "supply", id: model.id });
  assert.equal(preview.requiresConfirmation, false);
  assert.deepEqual(preview.affectedBusinesses, []);
  const report = computeAvailability({ providers: [provider], keys: [key], models: [{ ...model, is_enabled: false }, models[1]],
    defaultBinding: bindings[0], featureControls: [{ key: "content_tools", label: "内容工具", group: "business", lifecycleState: "active", isEnabled: true, modelId: "business-model" }],
  });
  assert.equal(report.businessAssurances.find(item => item.key === "default")?.routingStatus, "outage");
  assert.equal(report.businessSummary.normal, 1);
  assert.equal(report.businessSummary.outage, 0);
});
