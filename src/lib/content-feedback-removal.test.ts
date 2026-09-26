import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

test("内容反馈专属入口与接口已从应用层移除", () => {
  const removedPaths = [
    "src/app/api/admin/content-feedback-cards/[videoId]/route.ts",
    "src/app/api/admin/content-feedback-cards/[videoId]/previous/route.ts",
    "src/app/api/admin/content-experience-marks/route.ts",
  ];

  for (const path of removedPaths) {
    assert.equal(existsSync(resolve(process.cwd(), path)), false, `${path} 不应继续存在`);
  }

});

test("视频复盘只保留内部分析，不再引用反馈工作流", () => {
  const guardedSources = [
    "src/app/(app)/admin/content/content-page-client.tsx",
    "src/app/(app)/admin/content/content-list.tsx",
    "src/app/(app)/admin/content/content-detail-dialog.tsx",
    "src/lib/loaders/admin-content-page.ts",
    "src/lib/review-queue.ts",
    "src/lib/content-review-readiness.ts",
    "src/lib/content-analysis-service.ts",
  ];

  const forbidden = /content_feedback_cards|content-feedback-cards|feedbackCards|feedback_draft|message_for_member|reusable_experience|ContentFeedbackCard/;
  for (const path of guardedSources) {
    assert.doesNotMatch(source(path), forbidden, `${path} 仍含反馈闭环引用`);
  }

  assert.equal(existsSync(resolve(process.cwd(), "src/app/api/admin/content-analysis/route.ts")), true);
  assert.equal(existsSync(resolve(process.cwd(), "src/app/api/admin/content-analysis/route.ts")), true);
});

test("明确冻结的模块仍完整保留", () => {
  const protectedPaths = [
    "src/app/(app)/admin/collaboration/page.tsx",
    "src/app/api/admin/collaboration/attribution/route.ts",
  ];

  for (const path of protectedPaths) {
    assert.equal(existsSync(resolve(process.cwd(), path)), true, `${path} 不得被本次清理删除`);
  }

  assert.match(source("src/components/nav-bar-items.ts"), /\/admin\/collaboration/);
});

test("排行榜组件与其取数接口脱离原页面后仍完整保留，不得当死代码清理", () => {
  const retainedPaths = [
    "src/components/leaderboard/leaderboard.tsx",
    "src/app/api/dashboard/leaderboard/route.ts",
  ];

  for (const path of retainedPaths) {
    assert.equal(
      existsSync(resolve(process.cwd(), path)),
      true,
      `${path} 是待接入的排行榜功能，不得当死代码清理`,
    );
  }

  // 取数接口的可见范围过滤与榜单类型定义是排行榜的组成部分，一并锁定。
  assert.match(source("src/app/api/dashboard/leaderboard/route.ts"), /filterLeaderboardByVisibleUsers/);
  assert.match(source("src/types/index.ts"), /export interface AccountLeaderboardRow/);
  assert.match(source("src/types/index.ts"), /export type LeaderboardType/);
});
