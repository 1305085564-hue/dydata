import assert from "node:assert/strict";
import test from "node:test";

import { getContentReviewOnboardingStepThree } from "./content-review-onboarding";

test("只有拥有 review_content 权限时，视频复盘引导才介绍选题库处理入口", () => {
  const reviewerCopy = getContentReviewOnboardingStepThree(true);
  const viewerCopy = getContentReviewOnboardingStepThree(false);

  assert.match(reviewerCopy, /详情抽屉/);
  assert.match(reviewerCopy, /选题库/);
  assert.match(viewerCopy, /截图和原视频/);
  assert.doesNotMatch(viewerCopy, /选题库|移出|恢复/);
});
