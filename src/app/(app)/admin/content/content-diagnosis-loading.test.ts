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

