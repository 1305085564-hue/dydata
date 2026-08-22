import test from "node:test";
import assert from "node:assert/strict";

import type { NextRequest } from "next/server";

import { getCronSecrets, getBearerToken, getRequestSecret, isCronAuthorized } from "./cron-auth";

function createRequest(url: string, headers?: Record<string, string>) {
  return { url, headers: new Headers(headers ?? {}) } as unknown as NextRequest;
}

test("同时兼容 CRON_SECRET 和 REMIND_SECRET", () => {
  process.env.CRON_SECRET = "cron-secret";
  process.env.REMIND_SECRET = "remind-secret";

  assert.deepEqual(getCronSecrets(), ["cron-secret", "remind-secret"]);
  assert.equal(isCronAuthorized(createRequest("https://dydata.cc/api/supabase-keepalive?secret=cron-secret")), true);
  assert.equal(isCronAuthorized(createRequest("https://dydata.cc/api/supabase-keepalive?secret=remind-secret")), true);
});

test("会忽略空白和重复密钥", () => {
  process.env.CRON_SECRET = " same-secret ";
  process.env.REMIND_SECRET = "same-secret";

  assert.deepEqual(getCronSecrets(), ["same-secret"]);
  assert.equal(getRequestSecret(createRequest("https://dydata.cc/api/supabase-keepalive?secret=%20same-secret%20")), "same-secret");
});

test("缺少有效密钥或请求密钥不匹配时拒绝访问", () => {
  delete process.env.CRON_SECRET;
  delete process.env.REMIND_SECRET;
  assert.equal(isCronAuthorized(createRequest("https://dydata.cc/api/supabase-keepalive?secret=anything")), false);

  process.env.CRON_SECRET = "cron-secret";
  delete process.env.REMIND_SECRET;
  assert.equal(isCronAuthorized(createRequest("https://dydata.cc/api/supabase-keepalive?secret=wrong-secret")), false);
  assert.equal(isCronAuthorized(createRequest("https://dydata.cc/api/supabase-keepalive")), false);
});

test("支持 Vercel Cron 的 Authorization Bearer 鉴权", () => {
  process.env.CRON_SECRET = "cron-secret";
  process.env.REMIND_SECRET = "remind-secret";

  try {
    // Vercel cron 标准头
    assert.equal(
      isCronAuthorized(
        createRequest("https://dydata.cc/api/supabase-keepalive", { authorization: "Bearer cron-secret" }),
      ),
      true,
    );
    assert.equal(
      isCronAuthorized(
        createRequest("https://dydata.cc/api/notifications/cleanup", { Authorization: "Bearer remind-secret" }),
      ),
      true,
    );
    // 错误 Bearer 拒绝
    assert.equal(
      isCronAuthorized(
        createRequest("https://dydata.cc/api/supabase-keepalive", { Authorization: "Bearer wrong-secret" }),
      ),
      false,
    );
    // 非 Bearer 格式的 Authorization 拒绝
    assert.equal(
      isCronAuthorized(
        createRequest("https://dydata.cc/api/supabase-keepalive", { Authorization: "Basic cron-secret" }),
      ),
      false,
    );
    // 无环境变量时任何 Bearer 都拒绝
    delete process.env.CRON_SECRET;
    delete process.env.REMIND_SECRET;
    assert.equal(
      isCronAuthorized(
        createRequest("https://dydata.cc/api/supabase-keepalive", { Authorization: "Bearer cron-secret" }),
      ),
      false,
    );
  } finally {
    delete process.env.CRON_SECRET;
    delete process.env.REMIND_SECRET;
  }
});

test("轮换后旧明文密钥立即失效", () => {
  process.env.CRON_SECRET = "rotated-new-secret";
  delete process.env.REMIND_SECRET;

  try {
    // 泄露过的旧值（原 vercel.json 明文），query 和 Bearer 两种方式都必须拒绝
    assert.equal(isCronAuthorized(createRequest("https://dydata.cc/api/supabase-keepalive?secret=dydata-remind-2026")), false);
    assert.equal(
      isCronAuthorized(
        createRequest("https://dydata.cc/api/supabase-keepalive", { Authorization: "Bearer dydata-remind-2026" }),
      ),
      false,
    );
    // 新密钥正常放行
    assert.equal(
      isCronAuthorized(
        createRequest("https://dydata.cc/api/supabase-keepalive", { Authorization: "Bearer rotated-new-secret" }),
      ),
      true,
    );
  } finally {
    delete process.env.CRON_SECRET;
  }
});

test("双变量轮换：两个旧值同时拒绝（Bearer 与 query 均如此），新值分别放行", () => {
  process.env.CRON_SECRET = "rotated-cron-value";
  process.env.REMIND_SECRET = "rotated-remind-value";

  const oldLeakedValues = ["old-leaked-cron-placeholder", "old-leaked-remind-placeholder"];

  try {
    for (const old of oldLeakedValues) {
      assert.equal(
        isCronAuthorized(createRequest("https://dydata.cc/api/x", { Authorization: `Bearer ${old}` })),
        false,
      );
      assert.equal(isCronAuthorized(createRequest(`https://dydata.cc/api/x?secret=${encodeURIComponent(old)}`)), false);
    }

    for (const next of ["rotated-cron-value", "rotated-remind-value"]) {
      assert.equal(
        isCronAuthorized(createRequest("https://dydata.cc/api/x", { Authorization: `Bearer ${next}` })),
        true,
      );
      assert.equal(isCronAuthorized(createRequest(`https://dydata.cc/api/x?secret=${next}`)), true);
    }
  } finally {
    delete process.env.CRON_SECRET;
    delete process.env.REMIND_SECRET;
  }
});

test("错误 Authorization 格式一律拒绝", () => {
  process.env.CRON_SECRET = "cron-secret";

  try {
    assert.equal(
      isCronAuthorized(createRequest("https://dydata.cc/api/x", { Authorization: "Basic cron-secret" })),
      false,
    );
    // 缺少 token 的 Bearer
    assert.equal(
      isCronAuthorized(createRequest("https://dydata.cc/api/x", { Authorization: "Bearer" })),
      false,
    );
    // 空白 token
    assert.equal(
      isCronAuthorized(createRequest("https://dydata.cc/api/x", { Authorization: "Bearer    " })),
      false,
    );
  } finally {
    delete process.env.CRON_SECRET;
  }
});

test("没有任何环境变量时 Bearer 和 query 全部拒绝", () => {
  delete process.env.CRON_SECRET;
  delete process.env.REMIND_SECRET;

  assert.equal(isCronAuthorized(createRequest("https://dydata.cc/api/x", { Authorization: "Bearer anything" })), false);
  assert.equal(isCronAuthorized(createRequest("https://dydata.cc/api/x?secret=anything")), false);
});

test("getBearerToken 解析各种格式", () => {
  const request = createRequest("https://dydata.cc/api/x", { Authorization: "Bearer  spaced-token  " });
  assert.equal(getBearerToken(request), "spaced-token");

  const empty = createRequest("https://dydata.cc/api/x");
  assert.equal(getBearerToken(empty), null);
});
