import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { canBackfillRawModelDisplayName, getModelDisplayName, resolveModelDisplayName } from "./model-families";

test("模型显示名覆盖实测四大模型及核心型号", () => {
  assert.equal(getModelDisplayName("claude-haiku-4-5-20251001"), "Claude Haiku 4.5 (2025-10-01)");
  assert.equal(getModelDisplayName("claude-haiku-4-5"), "Claude Haiku 4.5");
  assert.equal(getModelDisplayName("gemini-2.5-flash-lite"), "Gemini 2.5 Flash Lite");
  assert.equal(getModelDisplayName("gpt-6-luna"), "GPT-6 Luna");
  assert.equal(getModelDisplayName("gpt-6-sol"), "GPT-6 Sol");
  // 同一条渠道上并存的 GPT-5 变体不能折叠成同一个显示名（否则分不清测的是哪个）
  assert.equal(getModelDisplayName("gpt-5.5"), "GPT-5.5");
  assert.equal(getModelDisplayName("gpt-5.6-terra"), "GPT-5.6 Terra");
  assert.equal(getModelDisplayName("gpt-5.6-sol"), "GPT-5.6 Sol");
  assert.equal(getModelDisplayName("gpt-5"), "GPT-5");

  // 基础经典型号
  assert.equal(getModelDisplayName("claude-3-5-sonnet-20241022"), "Claude 3.5 Sonnet (2024-10-22)");
  assert.equal(getModelDisplayName("deepseek-reasoner"), "DeepSeek Reasoner");
  assert.equal(getModelDisplayName("deepseek-chat"), "DeepSeek Chat");
  assert.equal(getModelDisplayName("gpt-4o"), "GPT-4o");
  assert.equal(getModelDisplayName("gpt-4o-mini"), "GPT-4o-mini");
  assert.equal(getModelDisplayName("o3-mini"), "OpenAI o3-mini");
  assert.equal(getModelDisplayName("gemini-2.5-flash"), "Gemini 2.5 Flash");
  assert.equal(getModelDisplayName("qwen-3.8-max"), "Qwen 3.8 Max");
  assert.equal(getModelDisplayName("kimi-k1.5"), "Kimi K1.5");
});

test("智能推断能处理带供应商命名空间与变体前缀的模型ID", () => {
  assert.equal(getModelDisplayName("anthropic/claude-haiku-4-5-20251001"), "Claude Haiku 4.5 (2025-10-01)");
  assert.equal(getModelDisplayName("google/gemini-2.5-flash-lite"), "Gemini 2.5 Flash Lite");
  assert.equal(getModelDisplayName("openai/gpt-6-luna"), "GPT-6 Luna");
  assert.equal(getModelDisplayName("openai/gpt-6-sol"), "GPT-6 Sol");
});

test("未知模型使用稳定可读兜底，不得直接把内部带连字符 ID 当标题", () => {
  // 带有日期后缀的模型
  const withDate = getModelDisplayName("custom-vision-pro-20251231");
  assert.equal(withDate, "Custom Vision Pro (2025-12-31)");
  assert.doesNotMatch(withDate, /20251231/);
  assert.match(withDate, /^Custom Vision Pro \(\d{4}-\d{2}-\d{2}\)$/);

  // 开源架构模型
  const llama = getModelDisplayName("meta-llama/llama-3.3-70b-instruct");
  assert.equal(llama, "Llama 3.3 70B Instruct");

  // 缩写大写兜底
  const ocrModel = getModelDisplayName("deep-ocr-v2");
  assert.equal(ocrModel, "Deep OCR V2");

  // 空值兜底
  assert.equal(getModelDisplayName(""), "未知模型");
});

test("模型名解析保留库内自定义名，配置池使用服务端模型报告", () => {
  assert.equal(resolveModelDisplayName("GPT-5.6 Sol", "gpt-5.6-sol"), "GPT-5.6 Sol");
  assert.equal(resolveModelDisplayName("gpt-5.5", "gpt-5.5"), "GPT-5.5");
  assert.equal(resolveModelDisplayName("gpt-5.6-terra", "gpt-5.6-terra"), "GPT-5.6 Terra");
  assert.equal(resolveModelDisplayName(null, "gpt-5.6-sol"), "GPT-5.6 Sol");

  const source = fs.readFileSync(path.resolve(process.cwd(), "src/app/(app)/admin/ai-config/components/compute-pool-panel.tsx"), "utf8");
  assert.match(source, /bundle\.availability\.modelFamilies/);
  assert.doesNotMatch(source, /computeAvailability\s*\(/);
});

test("新显示名按模型 ID 规则生成，变体和日期保持独立名称", () => {
  assert.equal(getModelDisplayName("claude-haiku-5-5"), "Claude Haiku 5.5");
  assert.equal(getModelDisplayName("claude-haiku-5-5-thinking"), "Claude Haiku 5.5 (Thinking)");
  assert.equal(getModelDisplayName("claude-haiku-5-5-agentic"), "Claude Haiku 5.5 (Agentic)");
  assert.notEqual(getModelDisplayName("claude-haiku-5-5-20251001"), getModelDisplayName("claude-haiku-5-5"));
});

test("同步运行时只回填原始 ID；旧自动名交给一次性迁移，人工名称保留", () => {
  assert.equal(canBackfillRawModelDisplayName("claude-haiku-4-5-20251001", "claude-haiku-4-5-20251001"), true);
  assert.equal(canBackfillRawModelDisplayName("Claude 4.5 Haiku", "claude-haiku-4-5-20251001"), false);
  assert.equal(canBackfillRawModelDisplayName("市场部自定义名称", "claude-haiku-4-5-20251001"), false);
  assert.equal(canBackfillRawModelDisplayName(null, "claude-haiku-4-5-20251001"), false);
});
