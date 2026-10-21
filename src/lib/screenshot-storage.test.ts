import test from "node:test";
import assert from "node:assert/strict";

import { buildCosAuthorization } from "./cos/sign";
import { DEFAULT_COS_READ_TIMEOUT_MS, findReadableSubmissionScreenshots, resolveCosReadTimeout, resolveScreenshotStorage } from "./screenshot-storage";

test("COS 读取超时支持环境配置并限制范围", () => {
  assert.equal(resolveCosReadTimeout({}), DEFAULT_COS_READ_TIMEOUT_MS);
  assert.equal(resolveCosReadTimeout({ COS_READ_TIMEOUT_MS: "800" }), 800);
  assert.equal(resolveCosReadTimeout({ COS_READ_TIMEOUT_MS: "50" }), 200);
  assert.equal(resolveCosReadTimeout({ COS_READ_TIMEOUT_MS: "20000" }), 10_000);
  assert.equal(resolveCosReadTimeout({ COS_READ_TIMEOUT_MS: "invalid" }), DEFAULT_COS_READ_TIMEOUT_MS);
});

test("COS 配置完整时按环境变量选择 COS，缺配置自动降级 Supabase", () => {
  const complete = resolveScreenshotStorage({
    SCREENSHOT_STORAGE: "cos",
    COS_SECRET_ID: "id",
    COS_SECRET_KEY: "key",
    COS_BUCKET: "bucket",
    COS_REGION: "ap-guangzhou",
  });
  assert.equal(complete.primary, "cos");
  assert.equal(complete.degraded, false);

  const missing = resolveScreenshotStorage({ SCREENSHOT_STORAGE: "cos", COS_BUCKET: "bucket", COS_REGION: "ap-guangzhou" });
  assert.deepEqual({ primary: missing.primary, degraded: missing.degraded, reason: missing.reason }, {
    primary: "supabase",
    degraded: true,
    reason: "missing_cos_config",
  });
});

test("COS 签名包含规范化的 header 列表且不暴露密钥", () => {
  const authorization = buildCosAuthorization(
    { secretId: "secret-id", secretKey: "secret-key" },
    { method: "GET", pathname: "/user-1/a.png", headers: { Host: "bucket.cos.ap-guangzhou.myqcloud.com" }, now: 1_700_000_000 },
  );
  assert.match(authorization, /q-sign-algorithm=sha1/);
  assert.match(authorization, /q-header-list=host/);
  assert.doesNotMatch(authorization, /secret-key/);
});

test("存在性校验：COS 超时/5xx 不判缺失，仅明确 404 才回落 Supabase", async () => {
  const env = {
    SCREENSHOT_STORAGE: "cos",
    COS_SECRET_ID: "id",
    COS_SECRET_KEY: "key",
    COS_BUCKET: "bucket",
    COS_REGION: "ap-singapore",
  };
  let supabaseChecks = 0;
  const checkSupabase = async () => {
    supabaseChecks += 1;
    return false;
  };
  const headWith = (status: number, error?: string) => (async () => ({
    ok: false as const,
    status,
    contentLength: 0,
    contentType: null,
    etag: null,
    sourceSha256: null,
    sourceMd5: null,
    error,
  }));

  const timedOut = await findReadableSubmissionScreenshots(["user-1/a.jpg"], {
    env,
    headObject: headWith(0, "cos_timeout") as never,
    checkSupabase,
  });
  assert.deepEqual(timedOut, { readable: ["user-1/a.jpg"], missing: [] });
  assert.equal(supabaseChecks, 0);

  const serverError = await findReadableSubmissionScreenshots(["user-1/b.jpg"], {
    env,
    headObject: headWith(503, "cos_status_503") as never,
    checkSupabase,
  });
  assert.deepEqual(serverError, { readable: ["user-1/b.jpg"], missing: [] });
  assert.equal(supabaseChecks, 0);

  const notFound = await findReadableSubmissionScreenshots(["user-1/c.jpg"], {
    env,
    headObject: headWith(404, "cos_status_404") as never,
    checkSupabase,
  });
  assert.deepEqual(notFound, { readable: [], missing: ["user-1/c.jpg"] });
  assert.equal(supabaseChecks, 1);

  const legacyHit = await findReadableSubmissionScreenshots(["user-1/d.jpg"], {
    env,
    headObject: headWith(404, "cos_status_404") as never,
    checkSupabase: async () => true,
  });
  assert.deepEqual(legacyHit, { readable: ["user-1/d.jpg"], missing: [] });
});
