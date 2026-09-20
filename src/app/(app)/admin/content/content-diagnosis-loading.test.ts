import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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
  const drawerSource = readFileSync(
    resolve(process.cwd(), "src/app/(app)/admin/content/content-detail-dialog.tsx"),
    "utf8",
  );

  assert.match(pageSource, /canOperateLifecycle=/);
  assert.match(pageSource, /permissionInfo\.permissions\.manage_videos === true/);
  assert.match(drawerSource, /canOperateLifecycle\?: boolean/);
  assert.match(drawerSource, /onLifecycleChanged: \(\) => void/);
  assert.match(drawerSource, /移入回收站/);
  assert.match(drawerSource, /\/api\/admin\/videos\/\$\{video\.id\}\/lifecycle/);
});

test("内容页浏览器后退会同步列表范围与视频抽屉状态", () => {
  const source = readFileSync(
    resolve(process.cwd(), "src/app/(app)/admin/content/content-page-client.tsx"),
    "utf8",
  );

  assert.match(source, /resolveContentPageStateFromSearch/);
  assert.match(source, /nextState\.view !== view/);
  assert.match(source, /nextState\.perspective !== perspective/);
  assert.match(source, /nextState\.teamId !== teamId/);
  assert.match(
    source,
    /loadData\(\s*nextState\.view,\s*nextState\.perspective,\s*nextState\.teamId,\s*\{\s*background:\s*true\s*\}/,
  );
});
