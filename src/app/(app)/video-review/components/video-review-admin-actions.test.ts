import test from "node:test";
import assert from "node:assert/strict";

import { getVideoReviewAdminActions } from "./video-review-admin-actions";

test("视频审核管理入口只保留产量看板，不再暴露旧审核台或重复审批入口", () => {
  const actions = getVideoReviewAdminActions();

  assert.deepEqual(
    actions.map((item) => item.label),
    ["产量看板"],
  );
});
