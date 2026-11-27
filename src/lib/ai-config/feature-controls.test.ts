import assert from "node:assert/strict";
import test from "node:test";

import { buildAiFeatureControls } from "./feature-controls";

test("功能总控以代码目录为准，统一合并截图识别并移除旧 ocrChannel 与结构化项", () => {
  const controls = buildAiFeatureControls([
    {
      id: "binding-ocr",
      feature_key: "ocr_screenshot",
      model_id: "clairic",
      system_prompt: "识别截图提示词",
      output_token_limit: 2400,
      context_message_limit: 12,
      is_enabled: true,
      lifecycle_state: "active",
      archived_at: null,
      archived_reason: null,
    },
    {
      id: "binding-structure",
      feature_key: "ocr_screenshot_structure",
      system_prompt: null,
      output_token_limit: 3600,
      context_message_limit: 30,
      is_enabled: true,
      lifecycle_state: "active",
      archived_at: null,
      archived_reason: null,
    },
  ]);

  const ocrControl = controls.find((control) => control.key === "ocr_screenshot");
  assert.equal(ocrControl?.label, "截图识别");
  assert.equal(ocrControl?.modelId, "clairic");
  assert.equal(ocrControl?.systemPrompt, "识别截图提示词");
  assert.equal(ocrControl?.outputTokenLimit, 2400);
  assert.equal(ocrControl?.contextMessageLimit, 12);
  assert.equal("ocrChannel" in (ocrControl ?? {}), false);

  assert.equal(controls.some((control) => control.key === "ocr_screenshot_structure"), false);
});

test("已删除功能即使数据库仍有遗留记录，也不能出现在业务总控", () => {
  const controls = buildAiFeatureControls([
    {
      id: "binding-alert",
      feature_key: "smart_alert",
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
