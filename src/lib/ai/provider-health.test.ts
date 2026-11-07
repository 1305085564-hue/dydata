import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyProviderFailure,
  providerFailureKind,
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
  assert.equal(isPermanentProviderFailure({ status: 403, message: "invalid_api_key" }), true);
  assert.equal(isPermanentProviderFailure({ status: 403, message: "Forbidden" }), false);
  assert.equal(isPermanentProviderFailure({ status: 403, message: "unauthorized" }), true);
});


test("408属于模型超时，明确403鉴权拒绝优先于暂时拦截词", () => {
  assert.equal(classifyProviderFailure({errorType:"http_408"}),"model");
  assert.equal(providerFailureKind("http_408"),"timeout");
  assert.equal(isPermanentProviderFailure({status:403,message:"invalid api key: access denied"}),true);
  assert.equal(isPermanentProviderFailure({status:403,message:"unauthorized: access denied"}),true);
});


test("临时故障的状态码优先于错误正文中的鉴权或模型字样",()=>{
  assert.equal(classifyProviderFailure({status:503,message:"api_key upstream service failed"}),"model");
  assert.equal(classifyProviderFailure({status:429,message:"model_not_found in rate limit bucket"}),"model");
  assert.equal(isPermanentProviderFailure({status:429,message:"model_not_found in rate limit bucket"}),false);
});

test("R3 模型级 404/503/超时只进入可恢复故障，不永久失效", () => {
  assert.equal(isPermanentProviderFailure({ status: 404, message: "model_not_found" }), false);
  assert.equal(isPermanentProviderFailure({ status: 400, message: "unsupported model: claude-haiku" }), false);
  assert.equal(isPermanentProviderFailure({ status: 503, message: "model unavailable" }), false);
  assert.equal(isPermanentProviderFailure({ status: 503, message: "api_key upstream service failed" }), false);
  assert.equal(isPermanentProviderFailure({ errorType: "timeout" }), false);
  assert.equal(isPermanentProviderFailure({ errorType: "network", message: "connection reset" }), false);
  assert.equal(isPermanentProviderFailure({ errorType: "http_404", message: "model_not_found" }), false);
});

test("R3 Key 级明确鉴权失败仍永久，额度、限流和临时拦截不升格", () => {
  assert.equal(isPermanentProviderFailure({ status: 401, message: "invalid api key" }), true);
  assert.equal(isPermanentProviderFailure({ status: 403, message: "invalid api key" }), true);
  assert.equal(isPermanentProviderFailure({ status: 403, message: "unauthorized" }), true);
  assert.equal(isPermanentProviderFailure({ status: 400, message: "invalid api key" }), true);
  assert.equal(isPermanentProviderFailure({ status: 403, message: "invalid api key: access denied" }), true);
  assert.equal(isPermanentProviderFailure({ status: 402, message: "insufficient quota" }), false);
  assert.equal(isPermanentProviderFailure({ status: 403, message: "insufficient_user_quota" }), false);
  assert.equal(isPermanentProviderFailure({ status: 403, message: "Cloudflare 1010" }), false);
  assert.equal(isPermanentProviderFailure({ status: 403, message: "Forbidden" }), false);
});
