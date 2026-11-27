import assert from "node:assert/strict";
import test from "node:test";
import { createPublishTimeEvidence, verifyPublishTimeEvidence } from "./publish-time-evidence";

test("发布时间证据绑定本人、图片、真实时间、签名及有效期", () => {
  const env = { SCREENSHOT_GRANT_SECRET: "local-only-test-key" };
  const input = { userId: "user-1", path: "user-1/shot.png", publishedAt: "2026-11-28T01:00:00Z" };
  const now = Date.parse("2026-11-28T02:00:00Z");
  const token = createPublishTimeEvidence(input, env, now);
  assert.equal(verifyPublishTimeEvidence(token, input, env, now), true);
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
