import test from "node:test";
import assert from "node:assert/strict";

import { getVideoReviewTabs } from "./video-review-tabs";

test("video review tabs 关闭默认预取，避免子页一进来整组拉取兄弟路由", () => {
  const tabs = getVideoReviewTabs(true);

  assert.deepEqual(
    tabs.map((tab) => [tab.href, tab.prefetch]),
    [
      ["/video-review", false],
      ["/video-review/submit", false],
      ["/video-review/exemption", false],
      ["/video-review/archive", false],
    ],
  );
});
