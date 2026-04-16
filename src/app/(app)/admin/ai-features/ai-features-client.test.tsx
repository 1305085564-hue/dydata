import test from "node:test";
import assert from "node:assert/strict";

import { buildFeatureGroups } from "./ai-features-client";

test("AI 功能页按业务区分组，并让 growth 说明对齐第二批区块名", () => {
  const groups = buildFeatureGroups([
    {
      id: "1",
      feature_key: "growth_insight",
      label: "成长诊断",
      channel_id: "",
      channel_name: null,
      model: "",
      system_prompt: "",
      is_enabled: true,
      created_at: "",
      updated_at: "",
    },
    {
      id: "2",
      feature_key: "growth_advice",
      label: "成长建议",
      channel_id: "",
      channel_name: null,
      model: "",
      system_prompt: "",
      is_enabled: true,
      created_at: "",
      updated_at: "",
    },
    {
      id: "3",
      feature_key: "content_tools",
      label: "内容工具",
      channel_id: "",
      channel_name: null,
      model: "",
      system_prompt: "",
      is_enabled: true,
      created_at: "",
      updated_at: "",
    },
    {
      id: "4",
      feature_key: "ocr_screenshot",
      label: "截图识别",
      channel_id: "",
      channel_name: null,
      model: "",
      system_prompt: "",
      is_enabled: true,
      created_at: "",
      updated_at: "",
    },
    {
      id: "5",
      feature_key: "admin_assistant",
      label: "AI 助手",
      channel_id: "",
      channel_name: null,
      model: "",
      system_prompt: "",
      is_enabled: true,
      created_at: "",
      updated_at: "",
    },
  ]);

  assert.deepEqual(groups.map((item) => item.group), ["成长分析", "内容工具", "OCR/截图识别", "后台 AI 助手"]);

  const growthGroup = groups[0];
  assert.equal(growthGroup.features.length, 2);
  assert.match(growthGroup.features[0].metadata.location, /AI 洞察与行动建议/);
  assert.match(growthGroup.features[0].metadata.outputSummary, /问题证据|参考示例|改写建议|下一步动作/);
  assert.match(growthGroup.description, /growth 页/);

  const ocrGroup = groups.find((item) => item.group === "OCR/截图识别");
  assert.ok(ocrGroup);
  assert.match(ocrGroup.features[0].metadata.purpose, /截图/);
});
