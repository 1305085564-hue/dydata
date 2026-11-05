import assert from "node:assert/strict";
import test from "node:test";

import { computeAvailability, type AvailabilityInput } from "./availability";
import { listRankedProviderKeyModels } from "@/lib/ai/provider-routing";

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

test("global_is_enabled 的 null、false、true 均不影响供给开关", () => {
  for (const globalIsEnabled of [null, false, true]) {
    const report = computeAvailabilityT(baseInput({
      keys: [{ id: "k1", provider_id: "p1", is_enabled: true }],
      models: [{ id: "m1", key_id: "k1", model_id: "model-a", is_enabled: true, global_is_enabled: globalIsEnabled }],
    }));

    assert.equal(report.modelFamilies[0]?.schedulableChannelCount, 1);
    assert.equal(report.modelFamilies[0]?.isShelved, true);
  }

  const switchedOff = computeAvailabilityT(baseInput({
    keys: [{ id: "k1", provider_id: "p1", is_enabled: true }],
    models: [{ id: "m1", key_id: "k1", model_id: "model-a", is_enabled: false, global_is_enabled: true }],
  }));
  assert.equal(switchedOff.modelFamilies[0]?.schedulableChannelCount, 0);
  assert.equal(switchedOff.modelFamilies[0]?.isShelved, false);
});

test("渠道本身正常但某模型已冻结时，该模型不计为可调度", () => {
  const report = computeAvailabilityT(baseInput({
    keys: [{ id: "k1", provider_id: "p1", is_enabled: true, consecutive_failures: 0, last_success_at: new Date(NOW).toISOString() }],
    models: [{ id: "m1", key_id: "k1", model_id: "model-a", is_enabled: true, global_is_enabled: true,
      consecutive_failures: 3, unhealthy_until: new Date(NOW + MINUTE).toISOString() }],
  }));
  assert.equal(report.modelFamilies[0].schedulableChannelCount, 0);
  assert.equal(report.schedulableKeyCount, 0);
});

test("global_is_enabled 为空时，页面仍按正式供给开关计为可调度", () => {
  const report = computeAvailabilityT(baseInput({
    keys: [{ id: "k1", provider_id: "p1", is_enabled: true }],
    models: [{ id: "m1", key_id: "k1", model_id: "model-a", is_enabled: true, global_is_enabled: null }],
  }));
  assert.equal(report.modelFamilies[0].schedulableChannelCount, 1);
});

test("同一份配置的页面可调度数与正式候选链逐项一致", async () => {
  const future = new Date(Date.now() + 3600_000).toISOString();
  const cases = [
    { model: {}, key: {}, provider: {}, expected: 1 },
    { model: { consecutive_failures: 3, unhealthy_until: future }, key: {}, provider: {}, expected: 0 },
    { model: { global_is_enabled: null }, key: {}, provider: {}, expected: 1 },
    { model: { is_enabled: false }, key: {}, provider: {}, expected: 0 },
    { model: { global_is_enabled: false }, key: {}, provider: {}, expected: 1 },
    { model: {}, key: { consecutive_failures: 3, unhealthy_until: future }, provider: {}, expected: 0 },
    { model: {}, key: { is_enabled: false }, provider: {}, expected: 0 },
    { model: {}, key: {}, provider: { is_enabled: false }, expected: 0 },
  ];
  for (const item of cases) {
    const model = { id: "m1", key_id: "k1", model_id: "model-a", is_enabled: true, global_is_enabled: true, ...item.model };
    const key = { id: "k1", provider_id: "p1", is_enabled: true, priority: 1, ...item.key };
    const provider = { id: "p1", name: "provider", base_url: "https://example.invalid", is_enabled: true, priority: 1, ...item.provider };
    const report = computeAvailability({ providers: [provider], keys: [key], models: [model] });
    const query = {
      select() { return this; }, eq() { return this; },
      then(resolve: (value: unknown) => unknown) { return Promise.resolve({ data: [{ ...model, key: { ...key, api_key: "fixture", provider } }], error: null }).then(resolve); },
    };
    const ranked = await listRankedProviderKeyModels({ from: () => query }, "model-a");
    assert.equal(ranked.length, item.expected);
    assert.equal(report.modelFamilies[0].schedulableChannelCount, ranked.length);
  }
});

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

  // 未到冷却门槛：有失败记录的渠道待复测，仍可试调度
  const stuck = computeAvailabilityT(baseInput({
    keys: [{ id: "k1", provider_id: "p1", is_enabled: true, consecutive_failures: 2 }],
    models: [{ id: "m1", key_id: "k1", model_id: "model-a", is_enabled: true }],
  }));
  assert.equal(stuck.schedulableKeyCount, 1);
  assert.equal(stuck.identityCounts.retest, 1);
});

test("指定模型不可用时改由全局默认顶班，不借用其他模型", () => {
  const report = computeAvailabilityT(baseInput({
    keys: [{ id: "k1", provider_id: "p1", is_enabled: true }],
    models: [
      { id: "m1", key_id: "k1", model_id: "model-selected", is_enabled: false },
      { id: "m2", key_id: "k1", model_id: "model-default", is_enabled: true },
      { id: "m3", key_id: "k1", model_id: "model-random", is_enabled: true },
    ],
    featureControls: [
      { key: "content_tools", label: "内容工具", group: "business", isEnabled: true, lifecycleState: "active", modelId: "model-selected", providerKeyModelId: "must-be-ignored" },
    ],
    defaultBinding: { feature_key: "default", model_id: "model-default" },
  }));

  const assurance = report.businessAssurances[0];
  assert.equal(assurance?.selectedModelId, "model-selected");
  assert.equal(assurance?.defaultModelId, "model-default");
  assert.equal(assurance?.preferredModelId, "model-default");
  assert.equal(assurance?.resolvedModelId, "model-default");
  assert.equal(assurance?.routingStatus, "fallback");
  assert.equal(assurance?.status, "degraded");
  assert.equal(assurance?.messageKey, "business.fallback");
  assert.equal(report.modelFamilies.find((family) => family.modelId === "model-selected")?.isShelved, true);
  assert.equal(report.affectedBusinessCount, 0);
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
  assert.equal(withDeadDefault.affectedBusinessFeatures[0]?.resolvedModelId, null);
  assert.equal(withDeadDefault.businessAssurances[0]?.selectedModelId, null);
  assert.equal(withDeadDefault.businessAssurances[0]?.preferredModelId, null);
  assert.equal(withDeadDefault.businessAssurances[0]?.defaultModelId, "model-a");
  assert.equal(withDeadDefault.businessAssurances[0]?.resolvedModelId, null);
  assert.equal(withDeadDefault.businessAssurances[0]?.routingStatus, "outage");
  assert.equal(withDeadDefault.businessAssurances[0]?.status, "outage");
  assert.equal(withDeadDefault.businessAssurances[0]?.messageKey, "business.outage");

  const withoutDefault = computeAvailabilityT(baseInput({
    keys, models,
    featureControls: [feature],
    defaultBinding: null,
  }));
  assert.equal(withoutDefault.affectedBusinessCount, 1);
  assert.equal(withoutDefault.affectedBusinessFeatures[0].resolvedModelId, null);
});

test("无可用模型时保留业务所选模型但不伪造实际模型", () => {
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

  const unavailable = computeAvailabilityT(baseInput({
    keys,
    models: [
      { id: "m1", key_id: "k1", model_id: "model-ghost", is_enabled: false },
      models[0],
    ],
    featureControls: [feature("model-ghost")],
  }));
  const assurance = unavailable.businessAssurances[0];
  assert.equal(assurance?.selectedModelId, "model-ghost");
  assert.equal(assurance?.preferredModelId, null);
  assert.equal(assurance?.resolvedModelId, null);
  assert.equal(assurance?.routingStatus, "outage");
  assert.equal(assurance?.status, "outage");
  assert.equal(unavailable.affectedBusinessFeatures[0]?.resolvedModelId, null);
  assert.equal(unavailable.modelFamilies.find((family) => family.modelId === "model-ghost")?.isShelved, true);
});

test("空 modelId 忽略旧 providerKeyModelId 并跟随默认模型", () => {
  const keys = [{ id: "k1", provider_id: "p1", is_enabled: true, consecutive_failures: 0, last_success_at: new Date(NOW - MINUTE).toISOString() }];
  const models = [
    { id: "m1", key_id: "k1", model_id: "model-legacy-pinned", is_enabled: true },
    { id: "m2", key_id: "k1", model_id: "model-default", is_enabled: true },
  ];
  const feature = {
    key: "content_tools", label: "内容工具", group: "business", isEnabled: true, lifecycleState: "active",
    modelId: null, providerKeyModelId: "m1",
  };

  const healthy = computeAvailabilityT(baseInput({
    keys, models,
    featureControls: [{ ...feature, providerKeyModelId: "m1" }],
    defaultBinding: { feature_key: "default", model_id: "model-default" },
  }));
  const assurance = healthy.businessAssurances[0];
  assert.equal(assurance?.selectedModelId, null);
  assert.equal(assurance?.defaultModelId, "model-default");
  assert.equal(assurance?.preferredModelId, "model-default");
  assert.equal(assurance?.resolvedModelId, "model-default");
  assert.equal(assurance?.routingStatus, "normal");
  assert.equal(assurance?.status, "healthy");
  assert.equal(assurance?.messageKey, "business.normal");
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

test("模型配置开关决定是否保留在模型列表中", () => {
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

test("global_is_enabled=false 不会覆盖已开启的模型供应", () => {
  const report = computeAvailabilityT(baseInput({
    keys: [{ id: "k1", provider_id: "p1", is_enabled: true, consecutive_failures: 0, last_success_at: new Date(NOW - MINUTE).toISOString() }],
    models: [{ id: "m1", key_id: "k1", model_id: "model-a", is_enabled: true, global_is_enabled: false }],
  }));
  const family = report.modelFamilies.find((item) => item.modelId === "model-a");
  assert.equal(family?.schedulableChannelCount, 1);
  assert.equal(family?.isSelectable, true);
});

test("默认模型不可用时没有实际模型，并保留默认模型标识", () => {
  const report = computeAvailabilityT(baseInput({
    keys: [{ id: "k1", provider_id: "p1", is_enabled: true, consecutive_failures: 3, unhealthy_until: new Date(NOW + 10 * MINUTE).toISOString(), last_failure_at: new Date(NOW - MINUTE).toISOString() }],
    models: [{ id: "m1", key_id: "k1", model_id: "model-a", is_enabled: true }],
    featureControls: [
      { key: "content_tools", label: "内容工具", group: "business", isEnabled: true, lifecycleState: "active", modelId: null, providerKeyModelId: null },
    ],
    defaultBinding: { feature_key: "default", model_id: "model-a" },
  }));
  assert.equal(report.affectedBusinessCount, 1);
  assert.equal(report.affectedBusinessFeatures[0]?.resolvedModelId, null);
  assert.equal(report.businessAssurances[0]?.selectedModelId, null);
  assert.equal(report.businessAssurances[0]?.preferredModelId, null);
  assert.equal(report.businessAssurances[0]?.resolvedModelId, null);
  assert.equal(report.businessAssurances[0]?.defaultModelId, "model-a");
  assert.equal(report.businessAssurances[0]?.routingStatus, "outage");
  assert.equal(report.globalDefaultModelId, "model-a");
});


test("五类身份互斥、合计守恒，模型故障与手动休眠均与正式调度一致", () => {
  const models = ["active", "retest", "sleeping", "invalid", "disabled"].map((identity, index) => ({
    id: `m-${identity}`, key_id: `k-${identity}`, model_id: "governed-model", is_enabled: identity !== "disabled",
    consecutive_failures: identity === "retest" ? 1 : 0,
    invalidated_at: identity === "invalid" ? new Date(NOW - MINUTE).toISOString() : null,
    sort_order: index + 1,
  }));
  const keys = ["active", "retest", "sleeping", "invalid", "disabled"].map((identity) => ({
    id: `k-${identity}`, provider_id: "p1", is_enabled: true,
    manual_sleep_until: identity === "sleeping" ? new Date(NOW + MINUTE).toISOString() : null,
  }));
  const result = computeAvailabilityT(baseInput({ keys, models }));
  const family = result.modelFamilies[0];
  assert.deepEqual(family.identityCounts, { active: 1, retest: 1, sleeping: 1, invalid: 1, disabled: 1 });
  assert.equal(Object.values(family.identityCounts).reduce((sum, count) => sum + count, 0), family.channels.length);
  assert.equal(family.schedulableChannelCount, 2); assert.equal(family.redundancyCount, 1);
  assert.equal(family.singlePointRisk, false);
  assert.deepEqual(result.identityCounts, family.identityCounts);
});


test("未挂载模型的启用渠道不能计为正常在岗或可调度", () => {
  const report = computeAvailabilityT(baseInput({ keys: [{ id: "empty", provider_id: "p1", is_enabled: true }] }));
  assert.equal(report.keys[0].identity, "invalid"); assert.equal(report.keys[0].isSchedulable, false);
  assert.equal(report.identityCounts.active, 0); assert.equal(report.identityCounts.invalid, 1);
});
