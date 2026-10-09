import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const dialogSource = readFileSync(
  resolve(process.cwd(), "src/app/(app)/admin/ai-config/components/sync-models-dialog.tsx"),
  "utf8"
);

test("SyncModelsDialog 标题去掉供应商名只显示渠道名称", () => {
  // 必须只渲染 keyLabel，不再拼接 providerName
  assert.match(dialogSource, /<DialogTitle[^>]*>\s*\{keyLabel\}\s*<\/DialogTitle>/);
  assert.doesNotMatch(dialogSource, /providerName/);
});

test("SyncModelsDialog 严格遵循存量口径与计数，禁止出现增量获取文案", () => {
  // 严禁出现「已从渠道获取 N 个可用型号」等增量文案
  assert.doesNotMatch(dialogSource, /已从渠道获取/);
  assert.match(dialogSource, /已勾选/);
  assert.match(dialogSource, /selectedModelIds\.size/);
  assert.match(dialogSource, /inventory\.length/);
});

test("SyncModelsDialog 覆盖现役、本渠道启用、新增、储备中四类分区标识", () => {
  assert.match(dialogSource, /"现役"/);
  assert.match(dialogSource, /"本渠道启用"/);
  assert.match(dialogSource, /"新增"/);
  assert.match(dialogSource, /"储备中"/);
  assert.match(dialogSource, /isGlobalActive/);
  assert.match(dialogSource, /isEnabled/);
  assert.match(dialogSource, /isNewlyDiscovered/);
});

test("SyncModelsDialog 严格区分拉取中、拉取失败、真的0个三类空态，失败提供重试", () => {
  assert.match(dialogSource, /正在拉取该渠道全部模型列表/);
  assert.match(dialogSource, /模型列表同步失败/);
  assert.match(dialogSource, /重试/);
  assert.match(dialogSource, /此渠道尚未返回任何模型/);
  // 禁止把失败误显示为「还没有可启用的型号」
  assert.doesNotMatch(dialogSource, /还没有可启用的型号/);
});

test("SyncModelsDialog 底部提供'检测此渠道全部模型'入口及失败明细展开", () => {
  assert.match(dialogSource, /检测此渠道全部模型/);
  assert.match(dialogSource, /onTestKeyAllModels/);
  assert.match(dialogSource, /查看失败原因/);
});
