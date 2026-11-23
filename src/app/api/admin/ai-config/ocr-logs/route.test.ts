import assert from "node:assert/strict";
import test from "node:test";
import { buildOcrLogsResponse, type OcrLogsDependencies } from "./route-core";

const request = () => new Request("https://example.test/api/admin/ai-config/ocr-logs", {
  headers: { "x-request-id": "ocr-logs-test" },
});

const log = {
  id: "log-1",
  created_at: "2026-11-22T00:00:00.000Z",
  duration_ms: 1200,
  ocr_ms: 1000,
  download_ms: 200,
  channel_name: "测试渠道",
  model_id: "test-ocr",
  screenshot_type: "data",
  is_success: true,
  error_code: null,
  fallback_detail: { reason: "ocr_missing_fields", missing_fields: ["likes"] },
};

function createDatabase(options: {
  totalCount?: number;
  totalError?: { message: string } | null;
  recentError?: { message: string } | null;
} = {}) {
  const calls: Array<{ operation: string; args: unknown[] }> = [];
  const query = {
    from(...args: unknown[]) { calls.push({ operation: "from", args }); return query; },
    select(...args: unknown[]) { calls.push({ operation: "select", args }); return query; },
    gte(...args: unknown[]) {
      calls.push({ operation: "gte", args });
      return Promise.resolve({ count: options.totalCount ?? 18, error: options.totalError ?? null });
    },
    order(...args: unknown[]) { calls.push({ operation: "order", args }); return query; },
    limit(...args: unknown[]) {
      calls.push({ operation: "limit", args });
      return Promise.resolve({ data: options.recentError ? null : [log], error: options.recentError ?? null });
    },
  };
  return { client: query as unknown as ReturnType<OcrLogsDependencies["createAdminClient"]>, calls };
}

function authorized(): ReturnType<OcrLogsDependencies["requireSystemActor"]> {
  return Promise.resolve({
    supabase: {} as never,
    actor: {
      userId: "admin-1", role: "admin", name: "管理员",
      permissions: { manage_system: true }, dataScope: "team", teamId: "team-1",
      activeVisibleUserIds: ["admin-1"],
    },
    context: {} as never,
  });
}

for (const auth of [{ status: 401, error: "未登录" }, { status: 403, error: "无权限" }] as const) {
  const { status, error } = auth;
  test("ocr-logs 鉴权返回 " + status + " 时原样拒绝，且不创建管理员连接或查库", async () => {
    const database = createDatabase();
    let adminClients = 0;
    const response = await buildOcrLogsResponse(request(), {
      requireSystemActor: async () => auth,
      createAdminClient: () => { adminClients += 1; return database.client; },
    });
    assert.equal(response.status, status);
    assert.deepEqual(await response.json(), { error });
    assert.equal(adminClients, 0);
    assert.deepEqual(database.calls, []);
  });
}

test("ocr-logs 管理员通过鉴权后查询 90 天统计与最近记录，并返回 fallback_detail", async () => {
  const database = createDatabase();
  let authCalls = 0;
  const response = await buildOcrLogsResponse(request(), {
    requireSystemActor: () => { authCalls += 1; return authorized(); },
    createAdminClient: () => { assert.equal(authCalls, 1); return database.client; },
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), {
    summary: {
      total_count_90d: 18, recent_sample_size: 1, recent_1000_avg_ms: 1200,
      recent_1000_fastest_ms: 1200, recent_1000_slowest_ms: 1200, recent_1000_success_rate: 1,
    },
    logs: [log],
  });
  assert.deepEqual(database.calls.filter((call) => call.operation === "from").map((call) => call.args), [["ocr_recognition_logs"], ["ocr_recognition_logs"]]);
  assert.deepEqual(database.calls.find((call) => call.operation === "limit")?.args, [1000]);
  assert.ok(database.calls.some((call) => call.operation === "select" && String(call.args[0]).includes("fallback_detail")));
  assert.equal(database.calls.find((call) => call.operation === "gte")?.args[0], "created_at");
});

test("ocr-logs 内部异常返回带请求编号的中文 500，不泄露底层错误", async () => {
  const response = await buildOcrLogsResponse(request(), {
    requireSystemActor: authorized,
    createAdminClient: () => { throw new Error("database connection failed at private-host:5432"); },
  });
  assert.equal(response.status, 500);
  const body = await response.json();
  assert.equal(body.error, "刚才出了点问题，重试一下（编号：ocr-logs-test）");
  assert.equal(body.requestId, "ocr-logs-test");
  assert.equal(response.headers.get("x-dydata-request-id"), "ocr-logs-test");
  assert.doesNotMatch(JSON.stringify(body), /database|private-host|5432/);
});

test("ocr-logs 90 天计数查询失败时返回脱敏 500，不把失败伪装成 0", async () => {
  const database = createDatabase({ totalError: { message: "permission denied for relation ocr_recognition_logs" } });
  const response = await buildOcrLogsResponse(request(), {
    requireSystemActor: authorized,
    createAdminClient: () => database.client,
  });

  assert.equal(response.status, 500);
  const body = await response.json();
  assert.equal(body.error, "后台服务暂时不可用，稍后重试（编号：ocr-logs-test）");
  assert.equal(body.requestId, "ocr-logs-test");
  assert.doesNotMatch(JSON.stringify(body), /permission denied|ocr_recognition_logs/);
  assert.equal(database.calls.filter((call) => call.operation === "from").length, 1);
});

test("ocr-logs 最近明细查询失败时返回脱敏 500", async () => {
  const database = createDatabase({ recentError: { message: "column fallback_detail does not exist" } });
  const response = await buildOcrLogsResponse(request(), {
    requireSystemActor: authorized,
    createAdminClient: () => database.client,
  });

  assert.equal(response.status, 500);
  const body = await response.json();
  assert.equal(body.error, "后台服务暂时不可用，稍后重试（编号：ocr-logs-test）");
  assert.equal(body.requestId, "ocr-logs-test");
  assert.doesNotMatch(JSON.stringify(body), /fallback_detail|column/);
});
