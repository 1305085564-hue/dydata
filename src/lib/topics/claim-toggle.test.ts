import assert from "node:assert/strict";
import test from "node:test";

import { getClaimToggleRequest } from "./claim-toggle";

test("已在写的选题再次点击时请求取消写作接口", () => {
  assert.deepEqual(getClaimToggleRequest("sub-topic-1", true), {
    endpoint: "/api/topics/sub-topics/sub-topic-1/return",
    successMessage: "已取消写作状态",
  });
});

test("未在写的选题点击时请求开始写作接口", () => {
  assert.deepEqual(getClaimToggleRequest("sub-topic-1", false), {
    endpoint: "/api/topics/sub-topics/sub-topic-1/claim",
    successMessage: "已开始写作",
  });
});
