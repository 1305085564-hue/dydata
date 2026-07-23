import assert from "node:assert/strict";
import test from "node:test";

import { getClaimToggleRequest } from "./claim-toggle";

test("已认领的选题再次点击时请求放回接口", () => {
  assert.deepEqual(getClaimToggleRequest("sub-topic-1", true), {
    endpoint: "/api/topics/sub-topics/sub-topic-1/return",
    successMessage: "已放回选题池",
  });
});

test("未认领的选题点击时请求认领接口", () => {
  assert.deepEqual(getClaimToggleRequest("sub-topic-1", false), {
    endpoint: "/api/topics/sub-topics/sub-topic-1/claim",
    successMessage: "认领选题成功",
  });
});
