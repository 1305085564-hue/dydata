import assert from "node:assert/strict";
import test from "node:test";

import { validateTopicClaimForSubmission } from "./topic-association";

const TOPIC_ID = "123e4567-e89b-12d3-a456-426614174000";

test("没有选题关联时保持兼容，脚本中选题允许提交", () => {
  assert.deepEqual(validateTopicClaimForSubmission(null, null), { ok: true });
  assert.deepEqual(
    validateTopicClaimForSubmission(TOPIC_ID, { status: "scripting" }),
    { ok: true },
  );
});

test("候选、已放回或不存在的选题不能伪造为提交关联", () => {
  for (const claim of [null, { status: "candidate" }, { status: "returned" }]) {
    assert.deepEqual(validateTopicClaimForSubmission(TOPIC_ID, claim), {
      ok: false,
      status: 403,
      message: "该选题未处于当前用户的脚本中，不能关联提交",
    });
  }
});
