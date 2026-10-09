import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const addKeySource = readFileSync(
  resolve(process.cwd(), "src/app/(app)/admin/ai-config/components/add-key-dialog.tsx"),
  "utf8"
);

test("AddKeyDialog 下拉显示接入点名称而非内部 UUID", () => {
  // SelectValue 必须以 selectedProvider.name 优先渲染，杜绝显示 UUID
  assert.match(
    addKeySource,
    /<SelectValue[^>]*>\s*\{bundle\?\.providers\.find\(\(p\) => p\.id === selectedProviderId\)\?\.name \|\| "选择接入点"\}/
  );
});

test("AddKeyDialog 包含表单说明：接入点 = 上游服务商，渠道 = 这个服务商下的一条专线", () => {
  assert.match(addKeySource, /接入点 = 上游服务商，渠道 = 这个服务商下的一条专线。/);
});

test("AddKeyDialog 接入点下拉包含'＋ 新增接入点'并在就地展开三个字段输入", () => {
  assert.match(addKeySource, /＋ 新增接入点/);
  assert.match(addKeySource, /isCreatingProvider/);
  assert.match(addKeySource, /接入点名称 \*/);
  assert.match(addKeySource, /Base URL \*/);
  assert.match(addKeySource, /描述说明（选填）/);
  assert.match(addKeySource, /保存并选用/);
});

test("AddKeyDialog 已停用接入点标明'（已停用）'并处于禁用态", () => {
  assert.match(addKeySource, /\{p\.name\} \{!p\.is_enabled \? "（已停用）" : ""\}/);
  assert.match(addKeySource, /disabled=\{!p\.is_enabled\}/);
});

test("AddKeyDialog 保留快捷词按钮与建议名称提示", () => {
  assert.match(addKeySource, /"Claude", "Gemini", "ChatGPT"/);
  assert.match(addKeySource, /建议名称：/);
});
