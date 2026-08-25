import assert from "node:assert/strict";
import test from "node:test";

import { buildAiFeatureControls } from "./feature-controls";

test("功能总控以代码目录为准，并把内部绑定合并成业务可读状态", () => {
  const controls = buildAiFeatureControls([
    {
      id: "binding-ocr",
      feature_key: "ocr_screenshot",
      provider_key_model_id: "model-1",
      model_id: "gemini-2.5-flash",
      system_prompt: "看图回退提示词",
      output_token_limit: 2400,
      context_message_limit: 12,
      channel_settings: { ocr_screenshot_channel: "vision" },
      is_enabled: true,
      lifecycle_state: "active",
      archived_at: null,
      archived_reason: null,
    },
    {
      id: "binding-structure",
      feature_key: "ocr_screenshot_structure",
      provider_key_model_id: "model-2",
      system_prompt: null,
      output_token_limit: 3600,
      context_message_limit: 30,
      channel_settings: { ocr_screenshot_channel: "vision" },
      is_enabled: true,
      lifecycle_state: "active",
      archived_at: null,
      archived_reason: null,
    },
  ]);

  assert.deepEqual(controls.find((control) => control.key === "ocr_screenshot"), {
    key: "ocr_screenshot",
    label: "截图识别·看图回退",
    description: "百度通道不可用时切回的视觉模型识别链路，只服务 vision 回退",
    group: "business",
    routing: "binding",
    bindingId: "binding-ocr",
    providerKeyModelId: "model-1",
    modelId: "gemini-2.5-flash",
    systemPrompt: "看图回退提示词",
    outputTokenLimit: 2400,
    contextMessageLimit: 12,
    ocrChannel: "vision",
    isEnabled: true,
    lifecycleState: "active",
    archivedAt: null,
    archivedReason: null,
  });

  const structure = controls.find((control) => control.key === "ocr_screenshot_structure");
  assert.equal(structure?.label, "截图识别·文字结构化");
  assert.equal(structure?.description, "百度通道 OCR 提字后的文本字段映射");
  assert.equal(structure?.providerKeyModelId, "model-2");
  assert.equal(structure?.ocrChannel, "baidu");
});

test("通道开关缺省或非法值都按百度兜底，不出现第三种状态", () => {
  const [missing, empty, invalid] = buildAiFeatureControls([
    {
      id: "binding-1",
      feature_key: "ocr_screenshot",
      provider_key_model_id: null,
      system_prompt: null,
      output_token_limit: 3600,
      context_message_limit: 30,
      is_enabled: true,
      lifecycle_state: "active",
      archived_at: null,
      archived_reason: null,
    },
    {
      id: "binding-2",
      feature_key: "ocr_screenshot",
      provider_key_model_id: null,
      system_prompt: null,
      output_token_limit: 3600,
      context_message_limit: 30,
      channel_settings: {},
      is_enabled: true,
      lifecycle_state: "active",
      archived_at: null,
      archived_reason: null,
    },
    {
      id: "binding-3",
      feature_key: "ocr_screenshot",
      provider_key_model_id: null,
      system_prompt: null,
      output_token_limit: 3600,
      context_message_limit: 30,
      channel_settings: { ocr_screenshot_channel: "chatgpt" },
      is_enabled: true,
      lifecycle_state: "active",
      archived_at: null,
      archived_reason: null,
    },
  ]);

  for (const control of [missing, empty, invalid]) {
    assert.equal(control?.ocrChannel, "baidu");
  }
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
