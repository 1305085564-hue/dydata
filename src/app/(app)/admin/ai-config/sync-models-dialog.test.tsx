import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const dialogSource = readFileSync(
  resolve(process.cwd(), "src/app/(app)/admin/ai-config/components/sync-models-dialog.tsx"),
  "utf8"
);

test("SyncModelsDialog 标题包含同步模型与渠道名", () => {
  assert.match(dialogSource, /同步模型 · \{keyLabel\}/);
});

test("SyncModelsDialog S8 上游比对卡呈现新增与下线数量", () => {
  assert.match(dialogSource, /上游新增 \{newCount\} 个/);
  assert.match(dialogSource, /下线 \{staleModelIds\.length\} 个/);
});

test("SyncModelsDialog S9 标签只保留在用与新发现两种，且删掉疑似未验证 (D7)", () => {
  assert.match(dialogSource, /在用/);
  assert.match(dialogSource, /新发现/);
  // D7: 删掉「疑似，未验证」分类
  assert.doesNotMatch(dialogSource, /疑似，未验证/);
  assert.doesNotMatch(dialogSource, /"储备中"/);
});

test("SyncModelsDialog 口径 7: 清理上游已下线模型与合并写法", () => {
  assert.match(dialogSource, /cleanup_stale_models/);
  assert.match(dialogSource, /清理上游已下线模型/);
  assert.match(dialogSource, /推荐写法:/);
  assert.match(dialogSource, /更多版本/);
});
