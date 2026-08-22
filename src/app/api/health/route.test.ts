import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";

import { buildHealthResponse, type HealthDeps } from "./route";

function makeDeps(overrides: Partial<HealthDeps> = {}): HealthDeps {
  return {
    probeSupabase: async () => ({
      table: "profiles",
      rowCount: 1,
      checkedAt: new Date().toISOString(),
    }),
    ...overrides,
  };
}

test("基础存活检查不探测依赖，恒为 200", async () => {
  let probed = false;
  const response = await buildHealthResponse(
    new NextRequest("https://dydata.cc/api/health"),
    makeDeps({
      probeSupabase: async () => {
        probed = true;
        throw new Error("should not be called");
      },
    }),
  );

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.status, "ok");
  assert.equal(payload.checks.server, "up");
  assert.equal(probed, false);
});

test("Supabase 探活成功返回 200", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
  try {
    const response = await buildHealthResponse(
      new NextRequest("https://dydata.cc/api/health?check=supabase"),
      makeDeps(),
    );

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.status, "ok");
    assert.equal(payload.checks.supabase, "up");
  } finally {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  }
});

test("Supabase 探活失败返回 503 且不泄露数据库错误", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
  try {
    const response = await buildHealthResponse(
      new NextRequest("https://dydata.cc/api/health?check=supabase"),
      makeDeps({
        probeSupabase: async () => {
          throw new Error('relation "profiles" does not exist / 密码错误');
        },
      }),
    );

    assert.equal(response.status, 503);
    const payload = await response.json();
    assert.equal(payload.status, "degraded");
    assert.equal(payload.checks.supabase, "down");
    // 响应体不得包含任何数据库错误信息
    assert.ok(!JSON.stringify(payload).includes("relation"));
    assert.ok(!JSON.stringify(payload).includes("密码"));
  } finally {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  }
});

test("依赖配置缺失时标记 unconfigured 并返回 503", async () => {
  const hadUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const hadKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    const response = await buildHealthResponse(
      new NextRequest("https://dydata.cc/api/health?check=supabase"),
      makeDeps(),
    );

    assert.equal(response.status, 503);
    const payload = await response.json();
    assert.equal(payload.checks.supabase, "unconfigured");
  } finally {
    if (hadUrl) process.env.NEXT_PUBLIC_SUPABASE_URL = hadUrl;
    if (hadKey) process.env.SUPABASE_SERVICE_ROLE_KEY = hadKey;
  }
});
