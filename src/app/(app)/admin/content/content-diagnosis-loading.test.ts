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

test("详情读取失败时明确报错并提供重试，不以列表行代替详情", () => {
  const source = readFileSync(
    resolve(process.cwd(), "src/app/(app)/admin/content/content-page-client.tsx"),
    "utf8",
  );

  assert.match(source, /role="alert"/);
  assert.match(source, /详情没有加载出来，列表摘要不会代替详情显示/);
  assert.match(source, /重试加载详情/);
  assert.match(source, /selectedDetail\?\.video/);
  assert.doesNotMatch(source, /selectedVideo\s*\?\?\s*reviewVideos/);
});

test("从列表打开详情时使用已加载详情的话题分类，不依赖选题库状态权限", () => {
  const source = readFileSync(
    resolve(process.cwd(), "src/app/(app)/admin/content/content-page-client.tsx"),
    "utf8",
  );

  // 详情接口已返回真实分类；漏接这个字段会使普通列表点击丢失第四格和三个评级。
  assert.match(source, /const selectedTopicKind = selectedVideo\s*\? selectedDetail\?\.topicKind\s*\?\?/);
  assert.match(source, /topicKind=\{selectedTopicKind\}/);
  // URL 直达的旧详情必须继续限定同一作品，防止切换作品后串用分类。
  assert.match(source, /directVideoDetail\?\.video\.id === selectedVideo\.id/);
});

test("服务端范围中的负责人团队参与内容页团队视角解析", () => {
  const source = readFileSync(
    resolve(process.cwd(), "src/app/(app)/admin/content/content-data-container.tsx"),
    "utf8",
  );

  assert.match(source, /availableTeamIds:\s*\[[\s\S]*teams\.map\(\(team\) => team\.id\)[\s\S]*permissionInfo\.teamId/);
});

test("团队分页指纹使用权限范围团队而不是可选 URL teamId", () => {
  const loaderSource = readFileSync(
    resolve(process.cwd(), "src/lib/loaders/admin-content-page.ts"),
    "utf8",
  );

  assert.match(loaderSource, /bindContentListQueryToEffectiveScope\(args\.query,\s*resolvedScope\.teamId\)/);
  assert.match(loaderSource, /if \(effectiveQuery\.cursor && \(!cursor \|\| cursor\.queryFingerprint !== queryFingerprint\)\)/);
  assert.match(loaderSource, /if \(effectiveQuery\.cursor && payload\.cursorValid === false\)/);
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
