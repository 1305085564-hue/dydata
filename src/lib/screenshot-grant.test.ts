import test from "node:test";
import assert from "node:assert/strict";

import {
  GRANT_MAX_COOKIE_BYTES,
  GRANT_MAX_ALLOW_ENTRIES,
  buildGrantValue,
  buildGrantValueResult,
  grantAllowsOwner,
  readGrantCookie,
  verifyGrantValue,
} from "./screenshot-grant";

const env = { SCREENSHOT_GRANT_SECRET: "test-secret" };
const payload = {
  v: 1 as const,
  u: "viewer-1",
  allow: ["viewer-1", "member-1"],
  exp: 2_000_000_000,
};

test("截图票据可以签发、校验并按 owner 授权", () => {
  const value = buildGrantValue(payload, env);
  assert.ok(value);
  const result = verifyGrantValue(value, { env, now: 1_900_000_000 });
  assert.deepEqual(result.payload, payload);
  assert.equal(result.reason, null);
  assert.equal(grantAllowsOwner(result.payload!, "member-1"), true);
  assert.equal(grantAllowsOwner(result.payload!, "member-2"), false);
});

test("篡改一个字符会拒绝票据", () => {
  const value = buildGrantValue(payload, env)!;
  const [data, signature] = value.split(".");
  const tampered = `${data.slice(0, -1)}${data.endsWith("A") ? "B" : "A"}.${signature}`;
  assert.equal(verifyGrantValue(tampered, { env, now: 1_900_000_000 }).reason, "signature_invalid");
});

test("过期票据落慢路径，且不会抛错", () => {
  const value = buildGrantValue(payload, env)!;
  assert.equal(verifyGrantValue(value, { env, now: 2_000_000_001 }).reason, "expired");
});

test("票据缺失、密钥错误和超大 Cookie 都可识别", () => {
  assert.equal(verifyGrantValue(null, { env }).reason, "missing");
  const value = buildGrantValue(payload, env)!;
  assert.equal(verifyGrantValue(value, { env: { SCREENSHOT_GRANT_SECRET: "other" } }).reason, "signature_invalid");
  assert.equal(verifyGrantValue("x".repeat(GRANT_MAX_COOKIE_BYTES + 1), { env }).reason, "oversize");
});

test("签名密钥缺失明确归类为配置故障，不伪装成容量超限", () => {
  assert.deepEqual(buildGrantValueResult(payload, {}), {
    value: null,
    reason: "secret_missing",
  });
});

test("120 条 owner 的票据遵守 Cookie 上限，超出条目不签发", () => {
  const allow = Array.from({ length: GRANT_MAX_ALLOW_ENTRIES }, (_, index) => `owner-${index}`);
  const value = buildGrantValue({ ...payload, allow }, env);
  if (value) assert.ok(Buffer.byteLength(value) <= GRANT_MAX_COOKIE_BYTES);
  assert.equal(buildGrantValue({ ...payload, allow: [...allow, "owner-120"] }, env), null);
});

test("Cookie 读取只取 shot_grant，不把其他 Cookie 当票据", () => {
  const request = new Request("https://dydata.cc/api/submission-screenshots/file", {
    headers: { cookie: "sb-test=abc; shot_grant=abc.def; other=value" },
  });
  assert.equal(readGrantCookie(request), "abc.def");
});
