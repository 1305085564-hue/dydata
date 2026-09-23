import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("./collaboration-workbench.tsx", import.meta.url),
  "utf8",
);

test("协作工作台使用统一视频详情抽屉并按视频管理权限开放生命周期操作", () => {
  assert.match(source, /<ContentDetailDialog/);
  assert.match(source, /video=\{diagnosisDetail\.video\}/);
  assert.match(source, /snapshot=\{diagnosisDetail\.snapshot\}/);
  assert.match(source, /canOperateLifecycle=\{canManageVideos\}/);
});

test("数据管理切页签用 history.replaceState 镜像 URL，不污染历史、也不触发服务端重取", () => {
  const handleTabChangeBody = source.match(/const handleTabChange = \(nextTab: TabKey\) => \{[\s\S]*?\n  \};/)?.[0] ?? "";

  assert.match(handleTabChangeBody, /history\.replaceState\(/);
  assert.doesNotMatch(handleTabChangeBody, /router\.replace\(`/);
  assert.doesNotMatch(handleTabChangeBody, /router\.push\(`/);
});

test("当前月份右箭头呈现禁用态与已是当前月份提示", () => {
  assert.match(source, /isCurrentMonth/);
  assert.match(source, /已是当前月份/);
  assert.match(source, /cursor-not-allowed/);
});
