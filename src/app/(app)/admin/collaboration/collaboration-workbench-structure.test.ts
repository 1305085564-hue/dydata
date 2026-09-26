import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const source = readFileSync(
  new URL("./collaboration-workbench.tsx", import.meta.url),
  "utf8",
);

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

const dialogSource = readFileSync(
  new URL("../content/content-detail-dialog.tsx", import.meta.url),
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

test("数据管理抽屉只给组员渲染查看能力：选题库联动回调一律不传", () => {
  // 不传 status / 回调 → 入库、移出选题库按钮在数据管理里永不出现（复用 review_content 才会激活）
  assert.doesNotMatch(source, /onToggleTopicLibrary/);
  assert.doesNotMatch(source, /topicLibraryStatus/);
  // 生命周期与永久删除由 manage_videos 决定，组员为 false
  assert.match(source, /canOperateLifecycle=\{canManageVideos\}/);
  assert.match(source, /canPurge=\{false\}/);
  assert.match(pageSource, /canManageVideos=\{permissionInfo\.permissions\.manage_videos === true\}/);
});

test("作品复盘抽屉的写控件全部在 canOperate 分支内，只读账号拿不到入口", () => {
  assert.match(dialogSource, /canOperateLifecycle = false/);
  assert.match(dialogSource, /canPurge = false/);
  assert.match(dialogSource, /const canOperate = canOperateLifecycle;/);

  const guardIndex = dialogSource.indexOf("{video && canOperate && (");
  assert.ok(guardIndex > 0, "抽屉写操作必须先过 canOperate 分支");

  for (const trigger of [
    "setShowPatch24h(true)",
    "setShowConfirmRestore(true)",
    "setShowConfirmPurge(true)",
  ]) {
    assert.ok(
      dialogSource.indexOf(trigger) > guardIndex,
      `${trigger} 必须写在 canOperate 分支内`,
    );
  }
});

test("生命周期写入口靠 manage_videos 兜底，组员的服务端写请求仍被拒", () => {
  const lifecycleSource = readFileSync(
    resolve(process.cwd(), "src/app/api/admin/videos/[videoId]/lifecycle/route.ts"),
    "utf8",
  );
  const lifecycleLibSource = readFileSync(
    resolve(process.cwd(), "src/lib/video-lifecycle.ts"),
    "utf8",
  );

  assert.match(lifecycleSource, /performVideoLifecycleAction/);
  assert.match(lifecycleLibSource, /permissions\.manage_videos !== true/);
});
