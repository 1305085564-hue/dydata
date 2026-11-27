import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";

import { buildAiConfigGetResponse, buildAiConfigResponse } from "./route";
import { buildSyncModelsResponse } from "./sync-models/route";
import { buildCheckDependenciesResponse } from "./check-dependencies/route";
import { actor, configTables, request } from "./ai-config.behavior.fixture";

function captureErrorLogs() {
  const lines: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => {
    lines.push(args.map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg))).join(" "));
  };
  return {
    lines,
    restore() {
      console.error = original;
    },
  };
}

test("GET /api/admin/ai-config 数据库失败不回传底层报错，返回中文提示 + requestId + 同编号日志", async () => {
  const logs = captureErrorLogs();
  try {
    const failingSupabase = {
      from() {
        return {
          select() {
            return Promise.resolve({
              data: null,
              error: { message: "permission denied for relation ai_providers (SQLSTATE 42501)" },
            });
          },
        };
      },
    };
    const req = new NextRequest("http://localhost/api/admin/ai-config", {
      headers: { "x-request-id": "ai-get-err-001" },
    });
    const res = await buildAiConfigGetResponse(req, {
      requireSystemActor: async () => ({
        supabase: failingSupabase as never,
        actor: { userId: "admin-1", role: "owner" } as never,
      }),
    });
    assert.equal(res.status, 500);
    assert.equal(res.headers.get("x-dydata-request-id"), "ai-get-err-001");
    const body = await res.json();
    assert.equal(typeof body.error, "string");
    assert.equal(body.requestId, "ai-get-err-001");
    assert.equal(body.error, "读取 AI 配置失败（编号：ai-get-err-001）");
    assert.doesNotMatch(JSON.stringify(body), /permission denied|ai_providers|SQLSTATE/i);
    assert.ok(logs.lines.some((line) => line.includes("ai-get-err-001") && line.includes("/api/admin/ai-config")));
  } finally {
    logs.restore();
  }
});

test("POST /api/admin/ai-config RPC 与上游模型失败不泄露原始报错，日志带同编号 requestId", async () => {
  const logs = captureErrorLogs();
  try {
    const db = configTables(
      {
        ai_provider_key_models: [
          { id: "m1", key_id: "key-1", model_id: "model-a", is_enabled: true },
        ],
      },
      { failRpc: "update_ai_config_key" },
    );
    const req = new NextRequest("http://localhost/api/admin/ai-config", {
      method: "POST",
      headers: { "content-type": "application/json", "x-request-id": "ai-post-rpc-002" },
      body: JSON.stringify({
        action: "update",
        entity: "key",
        data: { id: "key-1", label: "新名" },
      }),
    });
    const res = await buildAiConfigResponse(req, actor(db), "ai-post-rpc-002");
    assert.equal(res.status, 500);
    assert.equal(res.headers.get("x-dydata-request-id"), "ai-post-rpc-002");
    const body = await res.json();
    assert.equal(typeof body.error, "string");
    assert.equal(body.requestId, "ai-post-rpc-002");
    assert.equal(body.error, "保存 AI 配置失败（编号：ai-post-rpc-002）");
    assert.doesNotMatch(JSON.stringify(body), /simulated|update_ai_config_key/i);
    assert.ok(logs.lines.some((line) => line.includes("ai-post-rpc-002")));

    const probeReq = new NextRequest("http://localhost/api/admin/ai-config", {
      method: "POST",
      headers: { "content-type": "application/json", "x-request-id": "ai-probe-err-003" },
      body: JSON.stringify({
        action: "probe_provider_models",
        data: {
          base_url: "https://api.cloudflare.com/client/v4/accounts/acc-1/ai/run",
          protocol: "cloudflare_clairic",
          api_key: "cf-secret-token-xyz",
        },
      }),
    });
    const probeRes = await buildAiConfigResponse(
      probeReq,
      {
        ...actor(db),
        fetcher: async () => new Response("internal cloudflare trace stack=abc123", { status: 500 }),
      },
      "ai-probe-err-003",
    );
    assert.equal(probeRes.status, 502);
    const probeBody = await probeRes.json();
    assert.equal(probeBody.requestId, "ai-probe-err-003");
    assert.match(probeBody.error, /探测 Cloudflare Clairic 失败.*ai-probe-err-003/);
    assert.doesNotMatch(JSON.stringify(probeBody), /trace|stack=abc123|cf-secret-token-xyz/i);
    assert.ok(logs.lines.some((line) => line.includes("ai-probe-err-003")));
  } finally {
    logs.restore();
  }
});

test("POST /api/admin/ai-config/sync-models 库错与上游原始报错收口，返回中文提示 + requestId + 同编号日志", async () => {
  const logs = captureErrorLogs();
  try {
    const dbErrClient = {
      from() {
        return {
          select() { return this; },
          eq() { return this; },
          single() {
            return Promise.resolve({
              data: null,
              error: { message: "relation ai_provider_keys does not exist" },
            });
          },
        };
      },
    };
    const dbReq = new NextRequest("http://localhost/api/admin/ai-config/sync-models", {
      method: "POST",
      headers: { "content-type": "application/json", "x-request-id": "sync-db-err-004" },
      body: JSON.stringify({ keyId: "key-1" }),
    });
    const dbRes = await buildSyncModelsResponse(
      dbReq,
      {
        requireSystemActor: async () => ({ supabase: dbErrClient as never, actor: { userId: "admin-1" } as never }),
        createAdminClient: () => dbErrClient as never,
      },
      "sync-db-err-004",
    );
    assert.equal(dbRes.status, 500);
    assert.equal(dbRes.headers.get("x-dydata-request-id"), "sync-db-err-004");
    const dbBody = await dbRes.json();
    assert.equal(dbBody.requestId, "sync-db-err-004");
    assert.equal(dbBody.error, "同步模型列表失败（编号：sync-db-err-004）");
    assert.doesNotMatch(JSON.stringify(dbBody), /relation|ai_provider_keys/i);
    assert.ok(logs.lines.some((line) => line.includes("sync-db-err-004")));

    const db = configTables();
    const upstreamReq = new NextRequest("http://localhost/api/admin/ai-config/sync-models", {
      method: "POST",
      headers: { "content-type": "application/json", "x-request-id": "sync-up-err-005" },
      body: JSON.stringify({ keyId: "key-1" }),
    });
    const upstreamRes = await buildSyncModelsResponse(
      upstreamReq,
      {
        ...actor(db),
        fetcher: async () => new Response("upstream raw model panic detail 999", { status: 500 }),
      },
      "sync-up-err-005",
    );
    assert.equal(upstreamRes.status, 502);
    const upstreamBody = await upstreamRes.json();
    assert.equal(upstreamBody.requestId, "sync-up-err-005");
    assert.match(upstreamBody.error, /探测模型列表失败.*sync-up-err-005/);
    assert.doesNotMatch(JSON.stringify(upstreamBody), /panic|detail 999|HTTP 500/i);
    assert.ok(logs.lines.some((line) => line.includes("sync-up-err-005")));
  } finally {
    logs.restore();
  }
});

test("POST /api/admin/ai-config/check-dependencies 异常脱敏并记录同编号日志", async () => {
  const logs = captureErrorLogs();
  try {
    const req = new NextRequest("http://localhost/api/admin/ai-config/check-dependencies", {
      method: "POST",
      headers: { "content-type": "application/json", "x-request-id": "dep-err-006" },
      body: JSON.stringify({ scope: "key", id: "key-1" }),
    });
    const res = await buildCheckDependenciesResponse(req, {
      requireSystemActor: async () => ({ supabase: {} as never, actor: {} as never }),
      buildDependencyPreview: async () => {
        throw new Error("column legacy_field does not exist on ai_provider_key_models");
      },
    });
    assert.equal(res.status, 500);
    assert.equal(res.headers.get("x-dydata-request-id"), "dep-err-006");
    const body = await res.json();
    assert.equal(body.requestId, "dep-err-006");
    assert.equal(body.error, "检查依赖失败（编号：dep-err-006）");
    assert.doesNotMatch(JSON.stringify(body), /column|does not exist|ai_provider_key_models/i);
    assert.ok(logs.lines.some((line) => line.includes("dep-err-006")));
  } finally {
    logs.restore();
  }
});

test("POST /api/admin/ai-config 业务确认 409 仍保留 affectedBusinesses 与 requiresConfirmation", async () => {
  const db = configTables({
    ai_provider_key_models: [{ id: "m1", key_id: "key-1", model_id: "model-a", is_enabled: true }],
    ai_feature_bindings: [{
      id: "b1", feature_key: "content_analysis", label: "内容分析", model_id: "model-a",
      is_enabled: true, lifecycle_state: "active",
    }],
  });
  const res = await buildAiConfigResponse(
    request({ action: "delete", entity: "key", data: { id: "key-1" } }),
    actor(db),
    "confirm-409-007",
  );
  assert.equal(res.status, 409);
  const body = await res.json();
  assert.equal(body.requiresConfirmation, true);
  assert.equal(body.requestId, "confirm-409-007");
  assert.equal(body.affectedBusinesses[0]?.key, "content_analysis");
});
