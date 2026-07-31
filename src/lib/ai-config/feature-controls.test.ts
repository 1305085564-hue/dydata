import assert from "node:assert/strict";
import test from "node:test";

import { buildAiFeatureControls } from "./feature-controls";

test("功能总控以代码目录为准，并把内部绑定合并成业务可读状态", () => {
  const controls = buildAiFeatureControls([
    {
      id: "binding-ocr",
      feature_key: "ocr_screenshot",
      provider_key_model_id: "model-1",
      system_prompt: "截图识别提示词",
      output_token_limit: 2400,
      context_message_limit: 12,
      is_enabled: true,
      lifecycle_state: "active",
      archived_at: null,
      archived_reason: null,
    },
  ]);

  assert.deepEqual(controls.find((control) => control.key === "ocr_screenshot"), {
    key: "ocr_screenshot",
    label: "截图识别",
    description: "首页日报截图识别与指标回填",
    group: "business",
    routing: "binding",
    bindingId: "binding-ocr",
    providerKeyModelId: "model-1",
    systemPrompt: "截图识别提示词",
    outputTokenLimit: 2400,
    contextMessageLimit: 12,
    isEnabled: true,
    lifecycleState: "active",
    archivedAt: null,
    archivedReason: null,
  });
});

test("已删除功能即使数据库仍有遗留记录，也不能出现在业务总控", () => {
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

  assert.equal(controls.some((item) => item.key === "smart_alert"), false);
});

test("没有专属绑定的正式功能仍显示自动策略，不要求管理员创建内部 key", () => {
  const control = buildAiFeatureControls([]).find((item) => item.key === "content_analysis");

  assert.equal(control?.bindingId, null);
  assert.equal(control?.isEnabled, true);
  assert.equal(control?.lifecycleState, "active");
});
