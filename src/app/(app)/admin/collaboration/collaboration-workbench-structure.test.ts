import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("./collaboration-workbench.tsx", import.meta.url),
  "utf8",
);

test("协作工作台打开诊断抽屉时传入成员、视频和快照上下文", () => {
  assert.match(source, /const diagnosisProfiles = useMemo/);
  assert.match(source, /profiles=\{diagnosisProfiles\}/);
  assert.match(source, /videos=\{\[diagnosisDetail\.video\]\}/);
  assert.match(source, /snapshots=\{diagnosisDetail\.snapshot \? \[diagnosisDetail\.snapshot\] : \[\]\}/);
});

test("岗位管理 Tab 切换使用 replace，避免污染浏览器历史", () => {
  const handleTabChangeBody = source.match(/const handleTabChange = \(nextTab: TabKey\) => \{[\s\S]*?\n  \};/)?.[0] ?? "";

  assert.match(handleTabChangeBody, /router\.replace\(`/);
  assert.doesNotMatch(handleTabChangeBody, /router\.push\(`/);
});
