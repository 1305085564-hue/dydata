import assert from "node:assert/strict";
import test from "node:test";

import {
  CLAIRIC_CANONICAL_MODEL_ID,
  CLAIRIC_UPSTREAM_MODEL_ID,
  getModelScope,
  getProviderProtocolLabel,
  isModelAllowedForFeature,
  normalizeProtocolBaseUrl,
  normalizeProviderProtocol,
  parseProviderProtocol,
  resolveClairicEndpoint,
} from "./provider-protocols";

test("协议解析与默认回退", () => {
  assert.equal(parseProviderProtocol("openai_compatible"), "openai_compatible");
  assert.equal(parseProviderProtocol(" cloudflare_clairic "), "cloudflare_clairic");
  assert.equal(parseProviderProtocol("baidu"), null);
  assert.equal(parseProviderProtocol(null), null);

  assert.equal(normalizeProviderProtocol("cloudflare_clairic"), "cloudflare_clairic");
  assert.equal(normalizeProviderProtocol("invalid"), "openai_compatible");
  assert.equal(getProviderProtocolLabel("cloudflare_clairic"), "Cloudflare Clairic (截图专项)");
  assert.equal(getProviderProtocolLabel("openai_compatible"), "标准对话接口 (OpenAI 兼容)");
});

test("normalizeProtocolBaseUrl 规范化 Clairic 地址与常规地址并拦截非法 URL", () => {
  assert.equal(
    normalizeProtocolBaseUrl("openai_compatible", "https://api.example.com/v1///"),
    "https://api.example.com/v1",
  );
  assert.equal(
    normalizeProtocolBaseUrl(
      "cloudflare_clairic",
      "https://api.cloudflare.com/client/v4/accounts/acc-1/ai/run/@cf/cloudflare/clairic/",
    ),
    "https://api.cloudflare.com/client/v4/accounts/acc-1/ai/run",
  );
  assert.equal(
    normalizeProtocolBaseUrl(
      "cloudflare_clairic",
      "https://gateway.proxy.example.com/cf/@cf/cloudflare/clairic/@cf/cloudflare/clairic",
    ),
    "https://gateway.proxy.example.com/cf",
  );

  assert.throws(
    () => normalizeProtocolBaseUrl("cloudflare_clairic", "ftp://api.cloudflare.com/ai/run"),
    /HTTP\/HTTPS/,
  );
  assert.throws(
    () => normalizeProtocolBaseUrl("openai_compatible", "https://user:pass@api.example.com/v1"),
    /HTTP\/HTTPS/,
  );
  assert.throws(
    () => normalizeProtocolBaseUrl("cloudflare_clairic", "https://api.example.com/ai/run?foo=1"),
    /HTTP\/HTTPS/,
  );
});

test("resolveClairicEndpoint 支持官方地址、网关代理与别名映射", () => {
  assert.equal(
    resolveClairicEndpoint("https://api.cloudflare.com/client/v4/accounts/acc-1/ai/run"),
    `https://api.cloudflare.com/client/v4/accounts/acc-1/ai/run/${CLAIRIC_UPSTREAM_MODEL_ID}`,
  );
  assert.equal(
    resolveClairicEndpoint(
      "https://gateway.proxy.test/workers-ai/@cf/cloudflare/clairic/",
      CLAIRIC_CANONICAL_MODEL_ID,
    ),
    `https://gateway.proxy.test/workers-ai/${CLAIRIC_UPSTREAM_MODEL_ID}`,
  );
});

test("能力隔离：Clairic 为 ocr_only 且仅允许绑定到 ocr_screenshot", () => {
  assert.equal(getModelScope("clairic"), "ocr_only");
  assert.equal(getModelScope("@cf/cloudflare/clairic"), "ocr_only");
  assert.equal(getModelScope("cloudflare/clairic"), "ocr_only");
  assert.equal(getModelScope("claude-haiku-5-5"), "general");
  assert.equal(getModelScope(""), "general");

  assert.deepEqual(isModelAllowedForFeature("ocr_screenshot", "clairic"), { allowed: true });
  assert.deepEqual(isModelAllowedForFeature("ocr_screenshot", "@cf/cloudflare/clairic"), { allowed: true });

  const defaultBlocked = isModelAllowedForFeature("default", "@cf/cloudflare/clairic");
  assert.equal(defaultBlocked.allowed, false);
  if (!defaultBlocked.allowed) assert.match(defaultBlocked.reason, /全局默认/);

  const chatBlocked = isModelAllowedForFeature("content_tools", "clairic");
  assert.equal(chatBlocked.allowed, false);
  if (!chatBlocked.allowed) assert.match(chatBlocked.reason, /仅支持「截图识别」/);

  assert.deepEqual(isModelAllowedForFeature("ocr_screenshot", "claude-haiku-5-5"), { allowed: true });
  assert.deepEqual(isModelAllowedForFeature("default", "claude-haiku-5-5"), { allowed: true });
  assert.deepEqual(isModelAllowedForFeature("content_tools", "deepseek-v3"), { allowed: true });
});
