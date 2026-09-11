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
