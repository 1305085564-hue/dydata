import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const computeSource = readFileSync(
  resolve(process.cwd(), "src/app/(app)/admin/ai-config/components/compute-pool-panel.tsx"),
  "utf8",
);
const channelSource = readFileSync(
  resolve(process.cwd(), "src/app/(app)/admin/ai-config/components/channel-pool-view.tsx"),
  "utf8",
);

test("R4 两个批量入口显式使用 120 秒预算并启动有界刷新", () => {
  assert.match(computeSource, /runCommand\("check_all_in_use".*AI_MODEL_BATCH_TIMEOUT_MS\)/);
  assert.match(channelSource, /runCommand\("test_key_all_models".*AI_MODEL_BATCH_TIMEOUT_MS\)/);
  assert.match(computeSource, /startDetectionRefresh/);
  assert.match(channelSource, /startDetectionRefresh/);
  assert.match(computeSource, /loadData/);
  assert.match(channelSource, /loadData/);
});

test("R4 中断后保留“未完整收齐”说明和手动重新读取入口", () => {
  for (const source of [computeSource, channelSource]) {
    assert.match(source, /检测未完整收齐/);
    assert.match(source, /重新读取最新状态/);
  }
});
