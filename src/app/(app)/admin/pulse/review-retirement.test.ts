import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

test("每日大盘与工作台不再提供复盘工单，同时保留大盘和上传入口", () => {
  const root = process.cwd();
  for (const file of [
    "src/app/(app)/admin/pulse/pulse-video-list.tsx",
    "src/app/(app)/admin/pulse/pulse-data-container.tsx",
    "src/app/(app)/dashboard/dashboard-data-container.tsx",
    "src/app/(app)/dashboard/production-control-system.tsx",
  ]) {
    assert.doesNotMatch(readFileSync(resolve(root, file), "utf8"), /review-tickets|video_review_tickets|ReviewTodoPanel|派发复盘/);
  }
  assert.equal(existsSync(resolve(root, "src/app/api/admin/pulse/review-tickets/route.ts")), false);
  assert.equal(existsSync(resolve(root, "src/app/(app)/admin/pulse/page.tsx")), true);
  assert.equal(existsSync(resolve(root, "src/app/(app)/dashboard/video-submit-form-v2.tsx")), true);
});
