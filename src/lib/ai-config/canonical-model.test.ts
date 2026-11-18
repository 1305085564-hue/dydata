import assert from "node:assert/strict";
import test from "node:test";

import { toCanonicalModelId } from "./canonical-model";

test("canonical model id removes only the prefix before the last slash", () => {
  assert.equal(toCanonicalModelId("gemini-2.5-flash"), "gemini-2.5-flash");
  assert.equal(toCanonicalModelId("google/gemini-2.5-flash"), "gemini-2.5-flash");
  assert.equal(toCanonicalModelId("models/google/gemini-2.5-flash"), "gemini-2.5-flash");
  assert.equal(toCanonicalModelId("claude-3-5-sonnet-20241022"), "claude-3-5-sonnet-20241022");
  assert.equal(toCanonicalModelId("google/gemini-2.5-flash-thinking"), "gemini-2.5-flash-thinking");
});

test("canonical model id rejects empty values after trimming", () => {
  assert.throws(() => toCanonicalModelId("   "), /模型 ID 不能为空/);
  assert.throws(() => toCanonicalModelId("models/"), /模型 ID 不能为空/);
});
