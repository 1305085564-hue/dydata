import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

test("诊断工作台只在选中视频后按需加载", () => {
  const source = readFileSync(
    resolve(process.cwd(), "src/app/(app)/admin/content/content-page-client.tsx"),
    "utf8",
  );

  assert.match(source, /dynamic\(\s*\(\) => import\("\.\/content-diagnosis-workbench"\)/);
  assert.doesNotMatch(source, /import \{ ContentDiagnosisWorkbench \} from "\.\/content-diagnosis-workbench"/);
  assert.match(source, /if \(selectedVideoId\)/);
});

test("归因舱向 owner 和 team_admin 提供移入回收站入口", () => {
  const pageSource = readFileSync(
    resolve(process.cwd(), "src/app/(app)/admin/content/content-page-client.tsx"),
    "utf8",
  );
  const workbenchSource = readFileSync(
    resolve(process.cwd(), "src/app/(app)/admin/content/content-diagnosis-workbench.tsx"),
    "utf8",
  );

  assert.match(pageSource, /canOperateLifecycle=/);
  assert.match(pageSource, /businessRole === "owner" \|\| permissionInfo\.businessRole === "team_admin"/);
  assert.match(workbenchSource, /canOperateLifecycle: boolean/);
  assert.match(workbenchSource, /onLifecycleChanged: \(\) => void/);
  assert.match(workbenchSource, /移入回收站/);
  assert.match(workbenchSource, /\/api\/admin\/videos\/\$\{video\.id\}\/lifecycle/);
});
