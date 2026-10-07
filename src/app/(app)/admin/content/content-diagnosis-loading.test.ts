import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { shouldReloadContentPageList } from "./content-page-query";
import test from "node:test";

test("视频详情抽屉只在选中视频后按需加载", () => {
  const source = readFileSync(
    resolve(process.cwd(), "src/app/(app)/admin/content/content-page-client.tsx"),
    "utf8",
  );

  assert.match(source, /dynamic\(\s*\(\) => import\("\.\/content-detail-dialog"\)/);
  assert.match(source, /if \(selectedVideoId\)/);
});

test("视频详情抽屉按固定视频管理权限提供移入回收站入口", () => {
  const pageSource = readFileSync(
    resolve(process.cwd(), "src/app/(app)/admin/content/content-page-client.tsx"),
    "utf8",
  );
  const drawerSource = [
    "src/app/(app)/admin/content/content-detail-dialog.tsx",
    "src/app/(app)/admin/content/detail/content-detail-metrics.tsx",
    "src/app/(app)/admin/content/detail/content-detail-evidence.tsx",
    "src/app/(app)/admin/content/detail/content-detail-preview.tsx",
    "src/app/(app)/admin/content/content-detail-lifecycle.ts",
    "src/lib/content/data/detail.ts",
  ].map((path) => readFileSync(resolve(process.cwd(), path), "utf8")).join("\n");

  assert.match(pageSource, /canOperateLifecycle=/);
  assert.match(pageSource, /permissionInfo\.permissions\.manage_videos === true/);
  assert.match(drawerSource, /canOperateLifecycle\?: boolean/);
  assert.match(drawerSource, /onLifecycleChanged: \(\) => void/);
  assert.match(drawerSource, /useContentDetailLifecycle/);
  assert.match(drawerSource, /移入回收站/);
  assert.match(drawerSource, /\/api\/admin\/videos\/\$\{video\.id\}\/lifecycle/);
  assert.match(drawerSource, /video\.lifecycle_state !== "trashed" && shouldShowPatch24hButton/);
});

test("内容页浏览器后退只在列表范围变化时重新取数", () => {
  const current = { view: "all" as const, perspective: "company" as const, teamId: null };

  assert.equal(
    shouldReloadContentPageList(
      { view: "trash", perspective: "company", teamId: null },
      current,
    ),
    true,
  );
  assert.equal(
    shouldReloadContentPageList(
      { view: "all", perspective: "company", teamId: null },
      current,
    ),
    false,
  );
});
