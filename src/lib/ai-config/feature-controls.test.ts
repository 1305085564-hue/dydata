import assert from "node:assert/strict";
import test from "node:test";

import { buildAiFeatureControls } from "./feature-controls";

test("功能总控以代码目录为准，并把内部绑定合并成业务可读状态", () => {
  const controls = buildAiFeatureControls([
    {
      id: "binding-growth",
      feature_key: "growth_insight",
      provider_key_model_id: "model-1",
      system_prompt: "诊断提示词",
      output_token_limit: 2400,
      context_message_limit: 12,
      is_enabled: true,
      lifecycle_state: "active",
      archived_at: null,
      archived_reason: null,
    },
  ]);

  assert.deepEqual(controls.find((control) => control.key === "growth_insight"), {
    key: "growth_insight",
    label: "成长诊断",
    description: "成长页面的 AI 诊断",
    group: "business",
    routing: "binding",
    bindingId: "binding-growth",
    providerKeyModelId: "model-1",
    systemPrompt: "诊断提示词",
    outputTokenLimit: 2400,
    contextMessageLimit: 12,
    isEnabled: true,
    lifecycleState: "active",
    archivedAt: null,
    archivedReason: null,
  });
});

test("归档目录中的功能即使遗留记录显示启用，也必须显示为已归档", () => {
  const controls = buildAiFeatureControls([
    {
      id: "binding-alert",
      feature_key: "smart_alert",
      provider_key_model_id: "model-1",
      system_prompt: null,
      output_token_limit: 3600,
      context_message_limit: 30,
      is_enabled: true,
      lifecycle_state: "active",
      archived_at: null,
      archived_reason: null,
    },
  ]);

  const control = controls.find((item) => item.key === "smart_alert");
  assert.equal(control?.lifecycleState, "archived");
  assert.equal(control?.isEnabled, false);
  assert.match(control?.archivedReason ?? "", /不调用 AI/);
});

test("没有专属绑定的正式功能仍显示自动策略，不要求管理员创建内部 key", () => {
  const control = buildAiFeatureControls([]).find((item) => item.key === "content_analysis");

  assert.equal(control?.bindingId, null);
  assert.equal(control?.isEnabled, true);
  assert.equal(control?.lifecycleState, "active");
});
