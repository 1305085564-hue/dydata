import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyProviderFailure,
  isPermanentProviderFailure,
  sanitizeProviderErrorMessage,
  type ProviderFailureScope,
} from "./provider-health";

test("provider failure classification keeps auth at Key scope and transient failures at model scope", () => {
  const cases: Array<{ input: Parameters<typeof classifyProviderFailure>[0]; expected: ProviderFailureScope }> = [
    { input: { status: 401, message: "invalid api key" }, expected: "key" },
    { input: { status: 402, message: "insufficient quota" }, expected: "key" },
    { input: { status: 500, message: "upstream failed" }, expected: "model" },
    { input: { errorType: "timeout", message: "request timed out" }, expected: "model" },
    { input: { errorType: "network", message: "connection reset" }, expected: "model" },
  ];

  for (const { input, expected } of cases) {
    assert.equal(classifyProviderFailure(input), expected);
  }
});

test("provider failure classification keeps model-specific errors at model scope", () => {
  assert.equal(classifyProviderFailure({ status: 404, message: "model_not_found" }), "model");
  assert.equal(classifyProviderFailure({ status: 400, message: "unsupported model: claude-haiku" }), "model");
  assert.equal(classifyProviderFailure({ status: 422, message: "invalid_model" }), "model");
  assert.equal(classifyProviderFailure({ status: 403, message: "unsupported model: vision" }), "model");
});

test("unknown provider failures do not expand to the whole Key", () => {
  assert.equal(classifyProviderFailure({ status: 400, message: "provider returned an opaque error" }), "unknown");
});

test("probe error sanitization removes API keys and bearer credentials", () => {
  const message = sanitizeProviderErrorMessage(
    "Bearer model-secret leaked by upstream; api_key=model-secret",
    ["model-secret"],
  );

  assert.equal(message.includes("model-secret"), false);
  assert.equal(message.includes("Bearer"), false);
  assert.match(message, /已隐藏/);
});


test("403 的临时拦截和额度故障不永久失效，明确凭据拒绝才失效", () => {
  assert.equal(isPermanentProviderFailure({ status: 403, message: "Cloudflare 1010" }), false);
  assert.equal(isPermanentProviderFailure({ status: 403, message: "insufficient_user_quota" }), false);
  assert.equal(isPermanentProviderFailure({ status: 403, message: "invalid api key" }), true);
  assert.equal(isPermanentProviderFailure({ status: 403, message: "Forbidden" }), false);
});
