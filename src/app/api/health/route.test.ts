import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";

import { buildHealthResponse, type HealthDeps } from "./route";

function makeDeps(overrides: Partial<HealthDeps> = {}): HealthDeps {
  return {
    probeCloudBase: async () => ({
      table: "profiles",
      rowCount: 1,
      checkedAt: new Date().toISOString(),
    }),
    ...overrides,
  };
}

async function withCloudBaseEnvironment<T>(run: () => Promise<T>): Promise<T> {
  const keys = [
    "CLOUDBASE_ENV_ID",
    "NEXT_PUBLIC_CLOUDBASE_ENV_ID",
    "CLOUDBASE_SERVICE_API_KEY",
  ];
  const oldValues = new Map(keys.map((key) => [key, process.env[key]]));
  process.env.CLOUDBASE_ENV_ID = "health-test-env";
  process.env.CLOUDBASE_SERVICE_API_KEY = "cloudbase-test-service-key";
  delete process.env.NEXT_PUBLIC_CLOUDBASE_ENV_ID;
  try {
    return await run();
  } finally {
    for (const [key, value] of oldValues) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("基础存活检查不探测依赖，恒为 200", async () => {
  let probed = false;
  const response = await buildHealthResponse(
    new NextRequest("https://dydata.cc/api/health"),
    makeDeps({
      probeCloudBase: async () => {
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

test("CloudBase health alias probes the target database and identifies it as CloudBase", async () => {
  let cloudBaseProbes = 0;
  await withCloudBaseEnvironment(async () => {
    const response = await buildHealthResponse(
      new NextRequest("https://dydata.cc/api/health?check=cloudbase"),
      makeDeps({
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
  });
});

test("CloudBase database alias probes target DB and reports backend fields", async () => {
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

test("CloudBase health reports unconfigured when env is missing", async () => {
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

test("已移除 check=supabase 分支，不再探活 Supabase 也不再返回 503", async () => {
  let probed = false;
  await withCloudBaseEnvironment(async () => {
    const response = await buildHealthResponse(
      new NextRequest("https://dydata.cc/api/health?check=supabase"),
      makeDeps({
        probeCloudBase: async () => {
          probed = true;
          return { table: "profiles", rowCount: 1, checkedAt: new Date().toISOString() };
        },
      }),
    );
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.status, "ok");
    assert.deepEqual(payload.checks, { server: "up" });
    assert.equal(probed, false);
  });
});
