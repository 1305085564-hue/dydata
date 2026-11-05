import assert from "node:assert/strict";
import test from "node:test";

import { findModelChannelCandidates, groupModelIdAliases, isModelConfirmedUnavailable } from "./model-discovery";

test("只把大小写和分隔符不同的模型 ID 合并为展示别名", () => {
  assert.deepEqual(groupModelIdAliases([
    "claude-haiku-5-5",
    "claude-haiku-5.5",
    "claude-haiku-5.5-thinking",
    "claude-haiku-5.5-agentic",
    "claude-haiku-5.5-20251001",
    "CLAUDE_HAIKU_5_5",
  ]), [
    {
      displayName: "Claude Haiku 5.5",
      recommendedModelId: "claude-haiku-5-5",
      modelIds: ["claude-haiku-5-5", "claude-haiku-5.5", "CLAUDE_HAIKU_5_5"],
    },
    {
      displayName: "Claude Haiku 5.5 (Thinking)",
      recommendedModelId: "claude-haiku-5.5-thinking",
      modelIds: ["claude-haiku-5.5-thinking"],
    },
    {
      displayName: "Claude Haiku 5.5 (Agentic)",
      recommendedModelId: "claude-haiku-5.5-agentic",
      modelIds: ["claude-haiku-5.5-agentic"],
    },
    {
      displayName: "Claude Haiku 5.5 (2025-10-01)",
      recommendedModelId: "claude-haiku-5.5-20251001",
      modelIds: ["claude-haiku-5.5-20251001"],
    },
  ]);
});

test("渠道发现按 available_models 精确匹配，只列未打开的供应且不返回密钥", () => {
  const candidates = findModelChannelCandidates({
    providers: [
      { id: "p1", name: "Provider 1", is_enabled: true },
      { id: "p2", name: "停用接入点", is_enabled: false },
    ],
    keys: [
      { id: "k-open", provider_id: "p1", label: "已开", is_enabled: true, available_models: ["claude-haiku-5-5"] },
      { id: "k-closed", provider_id: "p1", label: "待开", is_enabled: true, available_models: ["claude-haiku-5-5"] },
      { id: "k-disabled", provider_id: "p2", label: "接入点关闭", is_enabled: false, available_models: ["claude-haiku-5-5"] },
      { id: "k-alias", provider_id: "p1", label: "别名未同步", is_enabled: true, available_models: ["claude-haiku-5.5"] },
    ],
    models: [
      { id: "m-open", key_id: "k-open", model_id: "claude-haiku-5-5", is_enabled: true },
      { id: "m-off", key_id: "k-closed", model_id: "claude-haiku-5-5", is_enabled: false },
    ],
  }, "claude-haiku-5-5");

  assert.deepEqual(candidates, [
    {
      modelId: "claude-haiku-5-5",
      keyId: "k-closed",
      keyLabel: "待开",
      providerId: "p1",
      providerName: "Provider 1",
      providerEnabled: true,
      keyEnabled: true,
      existingSupplyId: "m-off",
      requiresProbe: true,
    },
    {
      modelId: "claude-haiku-5-5",
      keyId: "k-disabled",
      keyLabel: "接入点关闭",
      providerId: "p2",
      providerName: "停用接入点",
      providerEnabled: false,
      keyEnabled: false,
      existingSupplyId: null,
      requiresProbe: true,
    },
  ]);
  assert.equal(JSON.stringify(candidates).includes("api_key"), false);
});

test("陈旧判定只接受 404 或明确的模型不存在证据", () => {
  assert.equal(isModelConfirmedUnavailable(404, "not found"), true);
  assert.equal(isModelConfirmedUnavailable(400, "model_not_found"), true);
  assert.equal(isModelConfirmedUnavailable(400, "The model 'vendor/model-x' does not exist"), true);
  assert.equal(isModelConfirmedUnavailable(400, "模型不存在"), true);
  assert.equal(isModelConfirmedUnavailable(429, "model_not_found"), false);
  assert.equal(isModelConfirmedUnavailable(400, "model field not found"), false);
  assert.equal(isModelConfirmedUnavailable(400, "invalid model parameter"), false);
  assert.equal(isModelConfirmedUnavailable(500, "upstream unavailable"), false);
});
