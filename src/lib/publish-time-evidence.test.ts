import assert from "node:assert/strict";
import test from "node:test";
import { createPublishTimeEvidence, verifyPublishTimeEvidence } from "./publish-time-evidence";

test("发布时间证据绑定本人、图片、真实时间、签名及有效期", () => {
  const env = { SCREENSHOT_GRANT_SECRET: "local-only-test-key" };
  const input = { userId: "user-1", path: "user-1/shot.png", publishedAt: "2026-11-28T01:00:35Z" };
  const now = Date.parse("2026-11-28T02:00:00Z");
  const token = createPublishTimeEvidence(input, env, now);
  assert.equal(verifyPublishTimeEvidence(token, input, env, now), true);
  // 表单 datetime-local 截断秒数后，同一分钟内依然通过验签；差一分钟则拒绝。
  assert.equal(verifyPublishTimeEvidence(token, { ...input, publishedAt: "2026-11-28T01:00:00Z" }, env, now), true);
  assert.equal(verifyPublishTimeEvidence(token, { ...input, publishedAt: "2026-11-28T01:01:00Z" }, env, now), false);
  for (const changed of [
    { ...input, userId: "user-2" },
    { ...input, path: "user-1/other.png" },
    { ...input, publishedAt: "2026-11-28T01:30:00Z" },
  ]) assert.equal(verifyPublishTimeEvidence(token, changed, env, now), false);
  assert.equal(verifyPublishTimeEvidence(token + "x", input, env, now), false);
  assert.equal(verifyPublishTimeEvidence(null, input, env, now), false);
  assert.equal(verifyPublishTimeEvidence(token, input, env, now + 7 * 86400_000), false);
  assert.equal(verifyPublishTimeEvidence(token, input, {}, now), false);
});
