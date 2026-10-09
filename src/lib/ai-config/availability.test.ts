import assert from "node:assert/strict";
import test from "node:test";

import { computeAvailability, type AvailabilityInput } from "./availability";

const NOW = Date.parse("2026-10-04T12:00:00Z");
const MINUTE = 60_000;

function computeAvailabilityT(input: AvailabilityInput) {
  return computeAvailability(input, { now: NOW });
}

function baseInput(overrides: Partial<AvailabilityInput> = {}): AvailabilityInput {
  return {
    providers: [{ id: "p1", name: "服务商一", is_enabled: true }],
    keys: [],
    models: [],
    featureControls: [],
    defaultBinding: null,
    ...overrides,
  };
}

test("健康、未测、故障、停用四态密钥混合时计数各归各位", () => {
  const report = computeAvailabilityT(baseInput({
    keys: [
      // 健康：成功晚于失败
      { id: "k1", provider_id: "p1", label: "健康密钥", is_enabled: true, consecutive_failures: 0, last_success_at: new Date(NOW - 5 * MINUTE).toISOString(), last_failure_at: new Date(NOW - 60 * MINUTE).toISOString() },
      // 未测：无任何时间戳
      { id: "k2", provider_id: "p1", label: "未测密钥", is_enabled: true },
      // 故障：失败晚于成功，但失败次数未冻结
      { id: "k3", provider_id: "p1", label: "故障密钥", is_enabled: true, consecutive_failures: 1, last_success_at: new Date(NOW - 60 * MINUTE).toISOString(), last_failure_at: new Date(NOW - 5 * MINUTE).toISOString() },
      // 停用：不参与健康分母
      { id: "k4", provider_id: "p1", label: "停用密钥", is_enabled: false },
    ],
    models: [
      { id: "m1", key_id: "k1", model_id: "model-a", is_enabled: true },
      { id: "m2", key_id: "k2", model_id: "model-a", is_enabled: true },
      { id: "m3", key_id: "k3", model_id: "model-a", is_enabled: true },
      { id: "m4", key_id: "k4", model_id: "model-a", is_enabled: true },
    ],
  }));

  assert.equal(report.totalKeyCount, 4);
  assert.equal(report.enabledKeyCount, 3);
  assert.equal(report.healthyKeyCount, 1);
  assert.equal(report.untestedKeyCount, 1);
  assert.equal(report.faultKeyCount, 1);
  // 运行时口径：故障但未冻结的密钥仍可调度
  assert.equal(report.schedulableKeyCount, 3);
});

test("冻结密钥不可调度，冻结过期后恢复可调度", () => {
  const frozen = computeAvailabilityT(baseInput({
    keys: [{
      id: "k1", provider_id: "p1", is_enabled: true, consecutive_failures: 3,
      unhealthy_until: new Date(NOW + 10 * MINUTE).toISOString(),
      last_failure_at: new Date(NOW - 5 * MINUTE).toISOString(),
    }],
    models: [{ id: "m1", key_id: "k1", model_id: "model-a", is_enabled: true }],
  }));
  assert.equal(frozen.schedulableKeyCount, 0);
  assert.equal(frozen.faultKeyCount, 1);

  const thawed = computeAvailabilityT(baseInput({
    keys: [{
      id: "k1", provider_id: "p1", is_enabled: true, consecutive_failures: 3,
      unhealthy_until: new Date(NOW - 10 * MINUTE).toISOString(),
      last_failure_at: new Date(NOW - 20 * MINUTE).toISOString(),
    }],
    models: [{ id: "m1", key_id: "k1", model_id: "model-a", is_enabled: true }],
  }));
  assert.equal(thawed.schedulableKeyCount, 1);

  // 三次失败但无冻结截止时间：运行时 toConfig 视为不可调度
  const stuck = computeAvailabilityT(baseInput({
    keys: [{ id: "k1", provider_id: "p1", is_enabled: true, consecutive_failures: 3 }],
    models: [{ id: "m1", key_id: "k1", model_id: "model-a", is_enabled: true }],
  }));
  assert.equal(stuck.schedulableKeyCount, 0);
});

test("所有渠道被冻结的现役模型计入无可用渠道，绑定它的业务受影响", () => {
  const report = computeAvailabilityT(baseInput({
    keys: [{
      id: "k1", provider_id: "p1", is_enabled: true, consecutive_failures: 3,
      unhealthy_until: new Date(NOW + 10 * MINUTE).toISOString(),
      last_failure_at: new Date(NOW - 5 * MINUTE).toISOString(),
    }],
    models: [{ id: "m1", key_id: "k1", model_id: "model-a", is_enabled: true }],
    featureControls: [
      { key: "content_tools", label: "内容工具", group: "business", isEnabled: true, lifecycleState: "active", modelId: "model-a", providerKeyModelId: null },
    ],
  }));

  assert.equal(report.activeModelFamilyCount, 1);
  assert.equal(report.noChannelModelFamilyCount, 1);
  assert.equal(report.schedulableModelFamilyCount, 0);
  assert.deepEqual(report.affectedBusinessFeatures, [
    { key: "content_tools", label: "内容工具", resolvedModelId: "model-a" },
  ]);
});

test("未指定模型的业务跟随全局默认：默认可用不算受影响，默认缺失或不可用才算", () => {
  const feature = { key: "content_tools", label: "内容工具", group: "business", isEnabled: true, lifecycleState: "active", modelId: null, providerKeyModelId: null };
  const keys = [{ id: "k1", provider_id: "p1", is_enabled: true, consecutive_failures: 0, last_success_at: new Date(NOW - MINUTE).toISOString() }];
  const models = [{ id: "m1", key_id: "k1", model_id: "model-a", is_enabled: true }];

  const withHealthyDefault = computeAvailabilityT(baseInput({
    keys, models,
    featureControls: [feature],
    defaultBinding: { feature_key: "default", model_id: "model-a" },
  }));
  assert.equal(withHealthyDefault.affectedBusinessCount, 0);

  const withDeadDefault = computeAvailabilityT(baseInput({
    keys: [{ ...keys[0], consecutive_failures: 3, unhealthy_until: new Date(NOW + 10 * MINUTE).toISOString(), last_failure_at: new Date(NOW - MINUTE).toISOString() }],
    models,
    featureControls: [feature],
    defaultBinding: { feature_key: "default", model_id: "model-a" },
  }));
  assert.equal(withDeadDefault.affectedBusinessCount, 1);
  assert.deepEqual(withDeadDefault.affectedBusinessFeatures[0].resolvedModelId, "model-a");

  const withoutDefault = computeAvailabilityT(baseInput({
    keys, models,
    featureControls: [feature],
    defaultBinding: null,
  }));
  assert.equal(withoutDefault.affectedBusinessCount, 1);
  assert.equal(withoutDefault.affectedBusinessFeatures[0].resolvedModelId, null);
});

test("指定模型无渠道时业务回落全量顺位，指定模型健康则不受影响", () => {
  const keys = [
    { id: "k1", provider_id: "p1", is_enabled: true, consecutive_failures: 0, last_success_at: new Date(NOW - MINUTE).toISOString() },
  ];
  const models = [
    { id: "m1", key_id: "k1", model_id: "model-good", is_enabled: true },
    { id: "m2", key_id: "k1", model_id: "model-ghost", is_enabled: true },
  ];
  const feature = (modelId: string | null) => ({
    key: "content_tools", label: "内容工具", group: "business", isEnabled: true, lifecycleState: "active", modelId, providerKeyModelId: null,
  });

  const ok = computeAvailabilityT(baseInput({ keys, models, featureControls: [feature("model-good")] }));
  assert.equal(ok.affectedBusinessCount, 0);
  assert.equal(ok.modelFamilies.find((f) => f.modelId === "model-ghost")?.schedulableChannelCount, 1);

  // model-ghost 无任何渠道记录：视同无渠道，业务回落
  const ghost = computeAvailabilityT(baseInput({ keys, models: models.slice(0, 1), featureControls: [feature("model-ghost")] }));
  assert.equal(ghost.affectedBusinessCount, 1);
  assert.deepEqual(ghost.affectedBusinessFeatures[0].resolvedModelId, "model-ghost");
});

test("pinned 渠道绑定整链启用才推导模型，链路断开回落全局默认", () => {
  const keys = [{ id: "k1", provider_id: "p1", is_enabled: true, consecutive_failures: 0, last_success_at: new Date(NOW - MINUTE).toISOString() }];
  const models = [
    { id: "m1", key_id: "k1", model_id: "model-pinned", is_enabled: true },
    { id: "m2", key_id: "k1", model_id: "model-broken", is_enabled: false },
  ];
  const feature = {
    key: "content_tools", label: "内容工具", group: "business", isEnabled: true, lifecycleState: "active",
    modelId: null, providerKeyModelId: "m1",
  };

  const healthy = computeAvailabilityT(baseInput({
    keys, models,
    featureControls: [{ ...feature, providerKeyModelId: "m1" }],
    defaultBinding: { feature_key: "default", model_id: "model-pinned" },
  }));
  // pinned 生效：解析到 model-pinned 且可用
  assert.equal(healthy.affectedBusinessCount, 0);

  const broken = computeAvailabilityT(baseInput({
    keys, models,
    featureControls: [{ ...feature, providerKeyModelId: "m2" }],
    defaultBinding: { feature_key: "default", model_id: "model-pinned" },
  }));
  // pinned 记录被停用：视同未指定，回落默认 model-pinned，仍可用
  assert.equal(broken.affectedBusinessCount, 0);
});

test("暂停与归档的业务不计入受影响", () => {
  const report = computeAvailabilityT(baseInput({
    keys: [{ id: "k1", provider_id: "p1", is_enabled: true, consecutive_failures: 3, unhealthy_until: new Date(NOW + 10 * MINUTE).toISOString(), last_failure_at: new Date(NOW - MINUTE).toISOString() }],
    models: [{ id: "m1", key_id: "k1", model_id: "model-a", is_enabled: true }],
    featureControls: [
      { key: "f1", label: "已暂停", group: "business", isEnabled: false, lifecycleState: "active", modelId: "model-a", providerKeyModelId: null },
      { key: "f2", label: "已归档", group: "business", isEnabled: true, lifecycleState: "archived", modelId: "model-a", providerKeyModelId: null },
      { key: "f3", label: "系统项", group: "system", isEnabled: true, lifecycleState: "active", modelId: "model-a", providerKeyModelId: null },
    ],
  }));
  assert.equal(report.affectedBusinessCount, 0);
});

test("服务商停用时其密钥按停用计，渠道全部不可调度", () => {
  const report = computeAvailabilityT(baseInput({
    providers: [{ id: "p1", name: "服务商一", is_enabled: false }],
    keys: [{ id: "k1", provider_id: "p1", is_enabled: true, consecutive_failures: 0, last_success_at: new Date(NOW - MINUTE).toISOString() }],
    models: [{ id: "m1", key_id: "k1", model_id: "model-a", is_enabled: true }],
  }));
  assert.equal(report.enabledKeyCount, 0);
  assert.equal(report.healthyKeyCount, 0);
  assert.equal(report.schedulableKeyCount, 0);
  assert.equal(report.modelFamilies[0]?.schedulableChannelCount, 0);
});

test("模型记录全部下架不入现役系列，渠道级计数以运行时口径为准", () => {
  const report = computeAvailabilityT(baseInput({
    keys: [{ id: "k1", provider_id: "p1", is_enabled: true, consecutive_failures: 0, last_success_at: new Date(NOW - MINUTE).toISOString() }],
    models: [
      { id: "m1", key_id: "k1", model_id: "model-off", is_enabled: false },
      { id: "m2", key_id: "k1", model_id: "model-on", is_enabled: true },
    ],
  }));
  assert.equal(report.modelFamilies.find((f) => f.modelId === "model-off")?.isShelved, false);
  assert.equal(report.modelFamilies.find((f) => f.modelId === "model-on")?.isShelved, true);
  assert.equal(report.activeModelFamilyCount, 1);
  assert.equal(report.schedulableModelFamilyCount, 1);
});

test("全站关闭时渠道仍可保留就绪状态，但业务可用数为零并明确暴露原因", () => {
  const report = computeAvailabilityT(baseInput({
    keys: [{ id: "k1", provider_id: "p1", is_enabled: true, consecutive_failures: 0, last_success_at: new Date(NOW - MINUTE).toISOString() }],
    models: [{ id: "m1", key_id: "k1", model_id: "model-a", is_enabled: true, global_is_enabled: false }],
  }));
  const family = report.modelFamilies.find((item) => item.modelId === "model-a");
  assert.equal(family?.schedulableChannelCount, 0);
  assert.equal(family?.channelReadyButGlobalDisabled, 1);
  assert.equal(family?.globalIsEnabled, false);
});

test("未指定模型的业务在全局默认指向冻结模型时按默认模型记受影响", () => {
  const report = computeAvailabilityT(baseInput({
    keys: [{ id: "k1", provider_id: "p1", is_enabled: true, consecutive_failures: 3, unhealthy_until: new Date(NOW + 10 * MINUTE).toISOString(), last_failure_at: new Date(NOW - MINUTE).toISOString() }],
    models: [{ id: "m1", key_id: "k1", model_id: "model-a", is_enabled: true }],
    featureControls: [
      { key: "content_tools", label: "内容工具", group: "business", isEnabled: true, lifecycleState: "active", modelId: null, providerKeyModelId: null },
    ],
    defaultBinding: { feature_key: "default", model_id: "model-a" },
  }));
  assert.equal(report.affectedBusinessCount, 1);
  assert.deepEqual(report.affectedBusinessFeatures[0].resolvedModelId, "model-a");
  assert.equal(report.globalDefaultModelId, "model-a");
});
