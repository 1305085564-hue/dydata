import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { NextRequest } from "next/server";

import { buildHealthResponse, type HealthDeps } from "./route";

const originalBackend = process.env.DYDATA_BACKEND;
before(() => {
  process.env.DYDATA_BACKEND = "supabase";
});
after(() => {
  if (originalBackend === undefined) delete process.env.DYDATA_BACKEND;
  else process.env.DYDATA_BACKEND = originalBackend;
});

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

test("本地故障注入入口让 Supabase 探活进入 down，清除注入后恢复真实探活", async () => {
  const env = process.env as Record<string, string | undefined>;
  const oldNodeEnv = process.env.NODE_ENV;
  const oldVercelEnv = process.env.VERCEL_ENV;
  const oldInjection = process.env.DYDATA_FAULT_INJECTION;
  const oldLocalMarker = process.env.DYDATA_FAULT_INJECTION_LOCAL;
  const oldUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const oldKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  env.NODE_ENV = "test";
  delete env.VERCEL_ENV;
  delete env.DYDATA_FAULT_INJECTION_LOCAL;
  process.env.DYDATA_FAULT_INJECTION = "health:supabase-down";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
  try {
    const injected = await buildHealthResponse(
      new NextRequest("https://dydata.cc/api/health?check=supabase"),
      makeDeps({
        probeSupabase: async () => ({ table: "profiles", rowCount: 1, checkedAt: new Date().toISOString() }),
      }),
    );
    assert.equal(injected.status, 503);
    assert.equal((await injected.json()).checks.supabase, "down");

    delete process.env.DYDATA_FAULT_INJECTION;
    const recovered = await buildHealthResponse(
      new NextRequest("https://dydata.cc/api/health?check=supabase"),
      makeDeps(),
    );
    assert.equal(recovered.status, 200);
    assert.equal((await recovered.json()).checks.supabase, "up");
  } finally {
    if (oldNodeEnv === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = oldNodeEnv;
    if (oldVercelEnv === undefined) delete env.VERCEL_ENV;
    else env.VERCEL_ENV = oldVercelEnv;
    if (oldInjection === undefined) delete process.env.DYDATA_FAULT_INJECTION;
    else process.env.DYDATA_FAULT_INJECTION = oldInjection;
    if (oldLocalMarker === undefined) delete process.env.DYDATA_FAULT_INJECTION_LOCAL;
    else process.env.DYDATA_FAULT_INJECTION_LOCAL = oldLocalMarker;
    if (oldUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = oldKey;
  }
});

test("假守卫回归：本地运行时但连的是远端库（错构建内联生产 URL）不得注入", async () => {
  const env = process.env as Record<string, string | undefined>;
  const oldNodeEnv = process.env.NODE_ENV;
  const oldVercelEnv = process.env.VERCEL_ENV;
  const oldInjection = process.env.DYDATA_FAULT_INJECTION;
  const oldLocalMarker = process.env.DYDATA_FAULT_INJECTION_LOCAL;
  const oldUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const oldKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  env.NODE_ENV = "production";
  delete env.VERCEL_ENV;
  process.env.DYDATA_FAULT_INJECTION_LOCAL = "1";
  process.env.DYDATA_FAULT_INJECTION = "health:supabase-down";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://gcrhhxaopomtposmahsw.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
  try {
    const response = await buildHealthResponse(
      new NextRequest("https://dydata.cc/api/health?check=supabase"),
      makeDeps(),
    );
    assert.equal(response.status, 200);
    assert.equal((await response.json()).checks.supabase, "up");
  } finally {
    if (oldNodeEnv === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = oldNodeEnv;
    if (oldVercelEnv === undefined) delete env.VERCEL_ENV;
    else env.VERCEL_ENV = oldVercelEnv;
    if (oldInjection === undefined) delete process.env.DYDATA_FAULT_INJECTION;
    else process.env.DYDATA_FAULT_INJECTION = oldInjection;
    if (oldLocalMarker === undefined) delete process.env.DYDATA_FAULT_INJECTION_LOCAL;
    else process.env.DYDATA_FAULT_INJECTION_LOCAL = oldLocalMarker;
    if (oldUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = oldKey;
  }
});

test("生产运行时不会接受故障注入环境变量", async () => {
  const env = process.env as Record<string, string | undefined>;
  const oldNodeEnv = process.env.NODE_ENV;
  const oldVercelEnv = process.env.VERCEL_ENV;
  const oldInjection = process.env.DYDATA_FAULT_INJECTION;
  const oldLocalMarker = process.env.DYDATA_FAULT_INJECTION_LOCAL;
  const oldUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const oldKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  env.NODE_ENV = "production";
  env.VERCEL_ENV = "production";
  process.env.DYDATA_FAULT_INJECTION = "health:supabase-down";
  process.env.DYDATA_FAULT_INJECTION_LOCAL = "1";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
  try {
    const response = await buildHealthResponse(
      new NextRequest("https://dydata.cc/api/health?check=supabase"),
      makeDeps(),
    );
    assert.equal(response.status, 200);
    assert.equal((await response.json()).checks.supabase, "up");
  } finally {
    if (oldNodeEnv === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = oldNodeEnv;
    if (oldVercelEnv === undefined) delete env.VERCEL_ENV;
    else env.VERCEL_ENV = oldVercelEnv;
    if (oldInjection === undefined) delete process.env.DYDATA_FAULT_INJECTION;
    else process.env.DYDATA_FAULT_INJECTION = oldInjection;
    if (oldLocalMarker === undefined) delete process.env.DYDATA_FAULT_INJECTION_LOCAL;
    else process.env.DYDATA_FAULT_INJECTION_LOCAL = oldLocalMarker;
    if (oldUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = oldKey;
  }
});

async function withCloudBaseEnvironment<T>(run: () => Promise<T>): Promise<T> {
  const keys = [
    "DYDATA_BACKEND",
    "NEXT_PUBLIC_DYDATA_BACKEND",
    "CLOUDBASE_ENV_ID",
    "NEXT_PUBLIC_CLOUDBASE_ENV_ID",
    "CLOUDBASE_SERVICE_API_KEY",
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
  ];
  const oldValues = new Map(keys.map((key) => [key, process.env[key]]));
  process.env.DYDATA_BACKEND = "cloudbase";
  process.env.CLOUDBASE_ENV_ID = "health-test-env";
  process.env.CLOUDBASE_SERVICE_API_KEY = "cloudbase-test-service-key";
  delete process.env.NEXT_PUBLIC_CLOUDBASE_ENV_ID;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    return await run();
  } finally {
    for (const [key, value] of oldValues) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("CloudBase health alias probes the target database and identifies it as CloudBase", async () => {
  let cloudBaseProbes = 0;
  let supabaseProbes = 0;
  await withCloudBaseEnvironment(async () => {
    const response = await buildHealthResponse(
      new NextRequest("https://dydata.cc/api/health?check=cloudbase"),
      makeDeps({
        probeSupabase: async () => {
          supabaseProbes += 1;
          return { table: "profiles", rowCount: 1, checkedAt: "supabase-should-not-run" };
        },
        probeCloudBase: async () => {
          cloudBaseProbes += 1;
          return { table: "profiles", rowCount: 1, checkedAt: "2026-11-01T00:00:00.000Z" };
        },
      }),
    );
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.status, "ok");
    assert.equal(payload.checks.cloudbase.status, "up");
    assert.equal(payload.checks.cloudbase.backend, "cloudbase");
    assert.equal(payload.checks.cloudbase.table, "profiles");
    assert.equal(payload.checks.cloudbase.rowCount, 1);
    assert.equal("supabase" in payload.checks, false);
    assert.equal(cloudBaseProbes, 1);
    assert.equal(supabaseProbes, 0);
  });
});

test("CloudBase database alias probes target DB without Supabase env and reports backend fields", async () => {
  let cloudBaseProbes = 0;
  await withCloudBaseEnvironment(async () => {
    const response = await buildHealthResponse(
      new NextRequest("https://dydata.cc/api/health?check=database"),
      makeDeps({
        probeCloudBase: async () => {
          cloudBaseProbes += 1;
          return { table: "profiles", rowCount: 0, checkedAt: "2026-11-01T00:00:00.000Z" };
        },
      }),
    );
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.checks.cloudbase.status, "up");
    assert.equal(payload.checks.cloudbase.backend, "cloudbase");
    assert.equal(cloudBaseProbes, 1);
  });
});

test("CloudBase health reports unconfigured without requiring Supabase variables", async () => {
  let cloudBaseProbes = 0;
  await withCloudBaseEnvironment(async () => {
    delete process.env.CLOUDBASE_SERVICE_API_KEY;
    delete process.env.CLOUDBASE_ENV_ID;
    const response = await buildHealthResponse(
      new NextRequest("https://dydata.cc/api/health?check=database"),
      makeDeps({
        probeCloudBase: async () => {
          cloudBaseProbes += 1;
          return { table: "profiles", rowCount: 1, checkedAt: new Date().toISOString() };
        },
      }),
    );
    const payload = await response.json();

    assert.equal(response.status, 503);
    assert.equal(payload.checks.cloudbase.status, "unconfigured");
    assert.equal(payload.checks.cloudbase.backend, "cloudbase");
    assert.equal("supabase" in payload.checks, false);
    assert.equal(cloudBaseProbes, 0);
  });
});

test("CloudBase probe failure returns a redacted down status", async () => {
  await withCloudBaseEnvironment(async () => {
    const response = await buildHealthResponse(
      new NextRequest("https://dydata.cc/api/health?check=database"),
      makeDeps({
        probeCloudBase: async () => {
          throw new Error("CloudBase credential or row data must not leak");
        },
      }),
    );
    const payload = await response.json();

    assert.equal(response.status, 503);
    assert.equal(payload.checks.cloudbase.status, "down");
    assert.equal(JSON.stringify(payload).includes("credential"), false);
    assert.equal(JSON.stringify(payload).includes("row data"), false);
  });
});

test("CloudBase mode never reports its database as Supabase up", async () => {
  let probed = false;
  await withCloudBaseEnvironment(async () => {
    const response = await buildHealthResponse(
      new NextRequest("https://dydata.cc/api/health?check=supabase"),
      makeDeps({
        probeSupabase: async () => {
          probed = true;
          return { table: "profiles", rowCount: 1, checkedAt: new Date().toISOString() };
        },
      }),
    );
    const payload = await response.json();

    assert.equal(response.status, 503);
    assert.equal(payload.checks.supabase, "unconfigured");
    assert.equal(probed, false);
  });
});

test("public-only backend selection probes CloudBase consistently with the central selector", async () => {
  await withCloudBaseEnvironment(async () => {
    delete process.env.DYDATA_BACKEND;
    process.env.NEXT_PUBLIC_DYDATA_BACKEND = "cloudbase";
    let calls = 0;
    const response = await buildHealthResponse(new NextRequest("https://dydata.cc/api/health?check=database"), makeDeps({
      probeSupabase: async () => { throw new Error("Wrong backend selected"); },
      probeCloudBase: async () => { calls++; return { table: "profiles", rowCount: 1, checkedAt: "test" }; },
    }));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).checks.cloudbase.status, "up");
    assert.equal(calls, 1);
  });
});
