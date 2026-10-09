import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { getModelDisplayName, MODEL_DISPLAY_NAMES } from "./model-families";

test("模型显示名覆盖实测四大模型及核心型号", () => {
  assert.equal(getModelDisplayName("claude-haiku-4-5-20251001"), "Claude 4.5 Haiku");
  assert.equal(getModelDisplayName("claude-haiku-4-5"), "Claude 4.5 Haiku");
  assert.equal(getModelDisplayName("gemini-2.5-flash-lite"), "Gemini 2.5 Flash Lite");
  assert.equal(getModelDisplayName("gpt-6-luna"), "GPT-6 Luna");
  assert.equal(getModelDisplayName("gpt-6-sol"), "GPT-6 Sol");

  // 基础经典型号
  assert.equal(getModelDisplayName("claude-3-5-sonnet-20241022"), "Claude 3.5 Sonnet");
  assert.equal(getModelDisplayName("deepseek-reasoner"), "DeepSeek R1");
  assert.equal(getModelDisplayName("deepseek-chat"), "DeepSeek-V3");
  assert.equal(getModelDisplayName("gpt-4o"), "GPT-4o");
  assert.equal(getModelDisplayName("gpt-4o-mini"), "GPT-4o-mini");
  assert.equal(getModelDisplayName("o3-mini"), "OpenAI o3-mini");
  assert.equal(getModelDisplayName("gemini-2.5-flash"), "Gemini 2.5 Flash");
  assert.equal(getModelDisplayName("qwen-3.8-max"), "通义千问 3.8-Max");
  assert.equal(getModelDisplayName("kimi-k1.5"), "Kimi K1.5");
});

test("智能推断能处理带供应商命名空间与变体前缀的模型ID", () => {
  assert.equal(getModelDisplayName("anthropic/claude-haiku-4-5-20251001"), "Claude 4.5 Haiku");
  assert.equal(getModelDisplayName("google/gemini-2.5-flash-lite"), "Gemini 2.5 Flash Lite");
  assert.equal(getModelDisplayName("openai/gpt-6-luna"), "GPT-6 Luna");
  assert.equal(getModelDisplayName("openai/gpt-6-sol"), "GPT-6 Sol");
});

test("未知模型使用稳定可读兜底，不得直接把内部带连字符 ID 当标题", () => {
  // 带有日期后缀的模型
  const withDate = getModelDisplayName("custom-vision-pro-20251231");
  assert.equal(withDate, "Custom Vision Pro");
  assert.doesNotMatch(withDate, /20251231/);
  assert.doesNotMatch(withDate, /[-_]/);

  // 开源架构模型
  const llama = getModelDisplayName("meta-llama/llama-3.3-70b-instruct");
  assert.equal(llama, "Llama 3.3 70B Instruct");

  // 缩写大写兜底
  const ocrModel = getModelDisplayName("deep-ocr-v2");
  assert.equal(ocrModel, "Deep OCR V2");

  // 空值兜底
  assert.equal(getModelDisplayName(""), "未知模型");
});

test("ai-config 前端界面与后端路由中'分组'一词彻底清零", () => {
  const checkDirs = [
    path.resolve(process.cwd(), "src/app/(app)/admin/ai-config"),
    path.resolve(process.cwd(), "src/app/api/admin/ai-config"),
  ];

  function scanDir(dir: string): string[] {
    const violations: string[] = [];
    const files = fs.readdirSync(dir, { withFileTypes: true });
    for (const file of files) {
      const fullPath = path.join(dir, file.name);
      if (file.isDirectory()) {
        violations.push(...scanDir(fullPath));
      } else if (file.isFile() && (file.name.endsWith(".ts") || file.name.endsWith(".tsx"))) {
        // 排除当前测试用例自身如果处于该目录下
        const content = fs.readFileSync(fullPath, "utf-8");
        if (content.includes("分组")) {
          violations.push(fullPath);
        }
      }
    }
    return violations;
  }

  const allViolations: string[] = [];
  for (const d of checkDirs) {
    if (fs.existsSync(d)) {
      allViolations.push(...scanDir(d));
    }
  }

  assert.deepEqual(allViolations, [], `ai-config 模块中不能存在任何"分组"文案: ${allViolations.join(", ")}`);
});
