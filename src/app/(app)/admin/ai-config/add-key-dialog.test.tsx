import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const addKeySource = readFileSync(
  resolve(process.cwd(), "src/app/(app)/admin/ai-config/components/add-key-dialog.tsx"),
  "utf8"
);

test("AddKeyDialog 直接输入 API 接口地址与密钥，不强制先选接入点 (S6)", () => {
  assert.match(addKeySource, /API 接口地址 \(Base URL\)/);
  assert.match(addKeySource, /API Key 密钥/);
  assert.match(addKeySource, /获取模型/);
  // 删掉内嵌的就地新增接入点小表单
  assert.doesNotMatch(addKeySource, /isCreatingProvider/);
  assert.doesNotMatch(addKeySource, /＋ 新增接入点/);
});

test("AddKeyDialog 删掉调度顺位优先级输入项 (D4)", () => {
  assert.doesNotMatch(addKeySource, /priority/i);
});

test("AddKeyDialog 通过服务端探测模型，并提交所选模型列表", () => {
  assert.match(addKeySource, /probe_provider_models/);
  assert.match(addKeySource, /selected_model_ids/);
  assert.doesNotMatch(addKeySource, /targetUrl.*\/models/);
});
