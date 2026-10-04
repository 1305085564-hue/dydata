import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

test("统一视频详情抽屉保留核心操作并移除旧归因实现", () => {
  const source = [
    "src/app/(app)/admin/content/content-detail-dialog.tsx",
    "src/app/(app)/admin/content/detail/content-detail-metrics.tsx",
    "src/app/(app)/admin/content/detail/content-detail-evidence.tsx",
    "src/app/(app)/admin/content/detail/content-detail-preview.tsx",
  ].map((path) => readFileSync(resolve(process.cwd(), path), "utf8")).join("\n");
  assert.match(source, /复制/);
  assert.match(source, /打开源视频网页/);
  assert.match(source, /回收站|移入回收站/);
  assert.doesNotMatch(source, /useContentComparison|asset_level|asset_note/);
});
