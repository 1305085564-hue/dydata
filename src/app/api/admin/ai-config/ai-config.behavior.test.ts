import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";

import { buildAiConfigResponse, defaultAiConfigDeps, POST as postAiConfig } from "./route";
import { buildSyncModelsResponse, defaultSyncModelsDeps, POST as postSyncModels } from "./sync-models/route";
import { buildCheckDependenciesResponse, defaultCheckDependenciesDeps } from "./check-dependencies/route";
import { actor, configTables, dependencyScenario, request, type Row } from "./ai-config.behavior.fixture";
import { __internal as aiClientInternal } from "@/lib/ai/client";
import { computeAvailability } from "@/lib/ai-config/availability";

const LAYER_FIELDS = [
  "businessSucceeded",
  "permissionChecked",
  "auditStatus",
  "employeeNotificationStatus",
  "todoStatus",
  "compensationRequired",
] as const;

test("ai-config 真 handler：鉴权失败返回明确失败和完整分层字段", async () => {
  const original = defaultAiConfigDeps.requireSystemActor;
  defaultAiConfigDeps.requireSystemActor = async () => ({
    error: "未登录",
    status: 401,
  }) as never;
  try {
    const logged: string[] = [];
    const originalInfo = console.info;
    console.info = (...args: unknown[]) => logged.push(args.map(String).join(" "));
    try {
      const response = await postAiConfig(request({ action: "delete", entity: "key", data: { id: "k" } }));
      assert.equal(response.status, 401);
      const body = await response.json();
      for (const field of LAYER_FIELDS) assert.ok(field in body, `缺少 ${field}`);
      assert.equal(body.businessSucceeded, false);
      assert.equal(body.permissionChecked, false);
      assert.equal(body.error, "未登录");
      assert.equal(logged.filter((line) => line.includes("/api/admin/ai-config")).length, 1);
    } finally {
      console.info = originalInfo;
    }
  } finally {
    defaultAiConfigDeps.requireSystemActor = original;
  }
});

test("sync-models 无系统权限时不触达外部模型服务", async () => {
  const originalRequireSystemActor = defaultSyncModelsDeps.requireSystemActor;
  const originalFetch = globalThis.fetch;
  let outboundStubCalls = 0;
  defaultSyncModelsDeps.requireSystemActor = async () => ({ error: "无权限", status: 403 }) as never;
  globalThis.fetch = async () => {
    outboundStubCalls += 1;
    return Response.json({ data: [{ id: "must-not-be-requested" }] });
  };

  try {
    const response = await postSyncModels(new NextRequest("http://localhost/api/admin/ai-config/sync-models", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ keyId: "synthetic-key" }),
    }));
    assert.equal(response.status, 403);
    assert.equal(outboundStubCalls, 0);
  } finally {
    defaultSyncModelsDeps.requireSystemActor = originalRequireSystemActor;
    globalThis.fetch = originalFetch;
  }
});

test("ai-config build handler：依赖失败不静默成功", async () => {
  const response = await buildAiConfigResponse(
    request({ action: "delete", entity: "key", data: { id: "k" } }),
    { requireSystemActor: async () => ({ error: "配置服务不可用", status: 503 }) as never },
  );
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, "配置服务不可用");
});

test("check-dependencies 真 handler：依赖抛错返回 500 且保留分层字段", async () => {
  const response = await buildCheckDependenciesResponse(
    new NextRequest("http://localhost/api/admin/ai-config/check-dependencies", {
      method: "POST",
      body: JSON.stringify({ keyId: "key-1" }),
      headers: { "content-type": "application/json" },
    }),
    {
      requireSystemActor: async () => ({ supabase: {} as never, actor: {} as never }),
      buildDependencyPreview: async () => { throw new Error("依赖查询失败"); },
    },
  );
  assert.equal(response.status, 500);
  const body = await response.json();
  assert.equal(body.businessSucceeded, false);
  assert.equal(body.error, "依赖查询失败");
  for (const field of LAYER_FIELDS) assert.ok(field in body, `缺少 ${field}`);
});

test("依赖预览只模拟关闭目标供应；没有可用默认时，不会拿任意模型兜底", async () => {
  const db = dependencyScenario();
  const response = await buildCheckDependenciesResponse(
    new NextRequest("http://localhost/api/admin/ai-config/check-dependencies", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scope: "supply", id: "target-row" }),
    }),
    { ...defaultCheckDependenciesDeps, requireSystemActor: actor(db).requireSystemActor },
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.requiresConfirmation, true);
  assert.deepEqual(body.affectedBusinesses.map((item: Row) => item.key), ["content_analysis"]);
  assert.deepEqual(body.businessFunctions.map((item: Row) => item.key), ["content_analysis"]);
  assert.equal(body.criticalBindings.length, 0);
});

test("配置响应不读废弃列，旧 UI 字段由新开关状态派生", async () => {
  const db = configTables({
    ai_provider_key_models: [{ id: "model-row", key_id: "key-1", model_id: "model-a", is_enabled: true, global_is_enabled: false }],
    ai_feature_bindings: [{
      id: "binding-1", feature_key: "content_analysis", label: "内容分析", model_id: "model-a",
      provider_key_model_id: "model-row", system_prompt: null, output_token_limit: 3600, context_message_limit: 30,
      is_enabled: true, lifecycle_state: "active", archived_at: null, archived_reason: null,
    }],
  });
  const response = await buildAiConfigResponse(request({
    action: "update", entity: "key", data: { id: "key-1", label: "新渠道名" },
  }), actor(db));

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.providers[0].priority, 0);
  assert.equal(body.keys[0].priority, 0);
  assert.equal(body.models[0].global_is_enabled, true);
  assert.equal(body.featureBindings[0].provider_key_model_id, null);
  assert.equal(body.featureControls.find((item: Row) => item.key === "content_analysis").providerKeyModelId, null);
  assert.equal(db.selectCalls.some((call) => /global_is_enabled|provider_key_model_id|priority/.test(call)), false);
  assert.deepEqual(db.rpcCalls.find((call) => call.fn === "update_ai_config_key")?.args, {
    p_key_id: "key-1", p_patch: { label: "新渠道名" }, p_base_url: null,
  });
});

test("模型 ID 不可通过更新改写；旧渠道顺位参数被接受但不落库", async () => {
  const db = configTables({
    ai_provider_key_models: [{ id: "model-row", key_id: "key-1", model_id: "model-a", is_enabled: true }],
  });
  const rename = await buildAiConfigResponse(request({
    action: "update", entity: "model", data: { id: "model-row", model_id: "model-b" },
  }), actor(db));
  assert.equal(rename.status, 400);
  assert.equal(db.tables.ai_provider_key_models[0].model_id, "model-a");

  const priority = await buildAiConfigResponse(request({
    action: "update", entity: "key", data: { id: "key-1", priority: 1 },
  }), actor(db));
  assert.equal(priority.status, 200);
  assert.equal(db.tables.ai_provider_keys[0].priority, 1);
});

test("关闭单条供应需要确认；确认后只关该供应并清掉模型停用标记", async () => {
  const db = dependencyScenario();
  const makeRequest = (confirm: boolean) => request({
    action: "update", entity: "model",
    data: { id: "target-row", is_enabled: false, confirm_impact: confirm },
  });

  const preview = await buildAiConfigResponse(makeRequest(false), actor(db));
  assert.equal(preview.status, 409);
  const previewBody = await preview.json();
  assert.equal(previewBody.requiresConfirmation, true);
  assert.deepEqual(previewBody.affectedBusinesses.map((item: Row) => item.key), ["content_analysis"]);
  assert.equal(db.tables.ai_provider_key_models.find((row) => row.id === "target-row")?.is_enabled, true);

  const confirmed = await buildAiConfigResponse(makeRequest(true), actor(db));
  assert.equal(confirmed.status, 200);
  assert.equal(db.tables.ai_provider_key_models.find((row) => row.id === "target-row")?.is_enabled, false);
  assert.equal(db.tables.ai_provider_key_models.find((row) => row.id === "target-row")?.disabled_by_model, false);
  assert.equal(db.tables.ai_provider_key_models.find((row) => row.id === "unrelated-row")?.is_enabled, true);
});

test("关渠道需要确认；确认后不级联清零渠道内模型开关", async () => {
  const db = dependencyScenario();
  const response = await buildAiConfigResponse(request({
    action: "update", entity: "key",
    data: { id: "key-1", is_enabled: false, confirm_impact: true },
  }), actor(db));

  assert.equal(response.status, 200);
  assert.equal(db.tables.ai_provider_keys.find((row) => row.id === "key-1")?.is_enabled, false);
  assert.equal(db.tables.ai_provider_key_models.find((row) => row.id === "target-row")?.is_enabled, true);
  assert.equal(db.tables.ai_provider_key_models.find((row) => row.id === "unrelated-row")?.is_enabled, true);
});

test("模型停用只标记并关闭原来开启的供应；恢复只恢复标记供应", async () => {
  const db = dependencyScenario();
  db.tables.ai_provider_key_models.push({
    id: "manual-off-row", key_id: "key-1", model_id: "target-model", display_name: "目标模型",
    is_enabled: false, disabled_by_model: false,
  });
  const disable = await buildAiConfigResponse(request({
    action: "set_model_enabled", data: { model_id: "target-model", is_enabled: false, confirm_impact: true },
  }), actor(db));
  assert.equal(disable.status, 200);
  assert.equal(db.tables.ai_provider_key_models.find((row) => row.id === "target-row")?.is_enabled, false);
  assert.equal(db.tables.ai_provider_key_models.find((row) => row.id === "target-row")?.disabled_by_model, true);
  assert.equal(db.tables.ai_provider_key_models.find((row) => row.id === "manual-off-row")?.disabled_by_model, false);

  const userToggle = await buildAiConfigResponse(request({
    action: "update", entity: "model", data: { id: "target-row", is_enabled: false },
  }), actor(db));
  assert.equal(userToggle.status, 200);
  assert.equal(db.tables.ai_provider_key_models.find((row) => row.id === "target-row")?.disabled_by_model, false);

  const restore = await buildAiConfigResponse(request({
    action: "set_model_enabled", data: { model_id: "target-model", is_enabled: true },
  }), actor(db));
  assert.equal(restore.status, 200);
  assert.equal(db.tables.ai_provider_key_models.find((row) => row.id === "target-row")?.is_enabled, false);
  assert.equal(db.tables.ai_provider_key_models.find((row) => row.id === "manual-off-row")?.is_enabled, false);
});

test("服务端模型探测只返回模型清单，不把临时 API Key 写入数据库", async () => {
  const db = configTables();
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), "https://provider.test/models");
    assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer temporary-secret");
    return new Response(JSON.stringify({ data: [{ id: "model-a" }, { id: "model-b" }] }), { status: 200 });
  };
  try {
    const response = await buildAiConfigResponse(request({
      action: "probe_provider_models",
      data: { provider_id: "provider-1", api_key: "temporary-secret" },
    }), actor(db));
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).modelIds, ["model-a", "model-b"]);
    assert.equal(db.tables.ai_provider_keys[0].api_key, "secret");
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("sync-models 合成授权正对照只命中本地 provider stub", async () => {
  const db = configTables();
  const previousFetch = globalThis.fetch;
  let outboundStubCalls = 0;
  globalThis.fetch = async (input) => {
    outboundStubCalls += 1;
    assert.equal(String(input), "https://provider.test/models");
    return Response.json({ data: [{ id: "synthetic-model" }] });
  };

  try {
    const response = await buildSyncModelsResponse(
      new NextRequest("http://localhost/api/admin/ai-config/sync-models", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ keyId: "key-1" }),
      }),
      actor(db),
    );
    assert.equal(response.status, 200);
    assert.equal(outboundStubCalls, 1);
    assert.equal(db.tables.ai_provider_keys[0].available_models instanceof Array, true);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("B1 同步只新增未上架模型并保留既有上下架状态", async () => {
  const db = configTables({
    ai_provider_keys: [
      { id: "key-1", provider_id: "provider-1", label: "key-1", api_key: "secret", priority: 1, is_enabled: true },
      { id: "key-2", provider_id: "provider-1", label: "key-2", api_key: "secret", priority: 2, is_enabled: true },
    ],
    ai_provider_key_models: [
      { id: "model-old", key_id: "key-1", model_id: "old-model", display_name: "Old", is_enabled: false },
      { id: "model-live", key_id: "key-1", model_id: "live-model", display_name: "Live", is_enabled: true },
      { id: "model-old-other-key", key_id: "key-2", model_id: "old-model", display_name: "Old (other key)", is_enabled: true },
    ],
  });

  const response = await buildSyncModelsResponse(
    new NextRequest("http://localhost/api/admin/ai-config/sync-models", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ keyId: "key-1", modelIds: ["old-model", "live-model", "new-model"] }),
    }),
    actor(db),
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.keyId, "key-1");
  assert.equal(body.newCount, 1);
  assert.deepEqual(body.allModels, [
    { modelId: "old-model", displayName: "Old", isEnabled: false, isGlobalActive: true, isNewlyDiscovered: false },
    { modelId: "live-model", displayName: "Live", isEnabled: true, isGlobalActive: true, isNewlyDiscovered: false },
    { modelId: "new-model", displayName: "New Model", isEnabled: false, isGlobalActive: false, isNewlyDiscovered: true },
  ]);
  assert.deepEqual(
    db.tables.ai_provider_key_models.filter((row) => row.key_id === "key-1").map((row) => ({ model_id: row.model_id, is_enabled: row.is_enabled })),
    [
      { model_id: "old-model", is_enabled: false },
      { model_id: "live-model", is_enabled: true },
      { model_id: "new-model", is_enabled: false },
    ],
  );
});

test("sync_key_models 动作返回当前渠道全量模型分类", async () => {
  const db = configTables({
    ai_provider_key_models: [{ id: "existing-row", key_id: "key-1", model_id: "existing-model", display_name: "已有模型", is_enabled: true }],
  });
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ data: [{ id: "existing-model" }, { id: "new-model" }] }), { status: 200 });

  try {
    const response = await buildAiConfigResponse(request({ action: "sync_key_models", data: { key_id: "key-1" } }), actor(db));
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.syncResult.keyId, "key-1");
    assert.equal(body.syncResult.allModels.length, 2);
    assert.equal(body.syncResult.newCount, 1);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("B2 模型停用需要确认；无可用默认时返回受影响业务", async () => {
  const db = configTables({
    ai_provider_key_models: [{ id: "target-row", key_id: "key-1", model_id: "target-model", is_enabled: true }],
    ai_feature_bindings: [{ id: "binding-1", feature_key: "content_analysis", label: "内容分析", model_id: "target-model", provider_key_model_id: "target-row", is_enabled: true, lifecycle_state: "active" }],
  });

  const response = await buildAiConfigResponse(request({
    action: "set_model_enabled",
    data: { modelId: "target-model", is_enabled: false },
  }), actor(db));

  assert.equal(response.status, 409);
  const body = await response.json();
  assert.equal(body.requiresConfirmation, true);
  assert.deepEqual(body.affectedBusinesses.map((item: Row) => item.key), ["content_analysis"]);
  assert.equal(db.tables.ai_provider_key_models[0].is_enabled, true);
});

test("B2 其他模型不会越过全局默认成为随机兜底", async () => {
  const db = configTables({
    ai_provider_key_models: [
      { id: "target-row", key_id: "key-1", model_id: "target-model", is_enabled: true },
      { id: "backup-row", key_id: "key-1", model_id: "backup-model", is_enabled: true },
    ],
    ai_feature_bindings: [
      { id: "binding-1", feature_key: "content_analysis", label: "内容分析", model_id: "target-model", provider_key_model_id: "backup-row", is_enabled: true, lifecycle_state: "active" },
      { id: "default-binding", feature_key: "default", label: "默认模型", model_id: "missing-default", is_enabled: true, lifecycle_state: "active" },
    ],
  });

  const response = await buildAiConfigResponse(request({
    action: "set_model_enabled",
    data: { modelId: "target-model", is_enabled: false },
  }), actor(db));

  assert.equal(response.status, 409);
  assert.equal((await response.json()).requiresConfirmation, true);
  assert.equal(db.tables.ai_provider_key_models.find((row) => row.id === "target-row")?.is_enabled, true);
  assert.equal(db.tables.ai_provider_key_models.find((row) => row.id === "backup-row")?.is_enabled, true);
});

test("B2 模型全局下架单次更新报错时状态保持不变", async () => {
  const db = configTables({
    ai_provider_key_models: [
      { id: "target-a", key_id: "key-1", model_id: "target-model", is_enabled: true, disabled_by_model: false },
      { id: "target-b", key_id: "key-2", model_id: "target-model", is_enabled: true, disabled_by_model: false },
      { id: "backup-row", key_id: "key-1", model_id: "backup-model", is_enabled: true, disabled_by_model: false },
    ],
    ai_provider_keys: [
      { id: "key-1", provider_id: "provider-1", label: "key-1", api_key: "secret", priority: 1, is_enabled: true },
      { id: "key-2", provider_id: "provider-1", label: "key-2", api_key: "secret", priority: 2, is_enabled: true },
    ],
  }, { failUpdate: "ai_provider_key_models" });

  const before = db.tables.ai_provider_key_models.map((row) => ({ id: row.id, is_enabled: row.is_enabled }));
  const response = await buildAiConfigResponse(request({
    action: "set_model_enabled",
    data: { modelId: "target-model", is_enabled: false, confirm_impact: true },
  }), actor(db));

  assert.equal(response.status, 400);
  assert.deepEqual(db.tables.ai_provider_key_models.map((row) => ({ id: row.id, is_enabled: row.is_enabled })), before);
});

test("S2 停用目标模型后运行时只切到明确的全局默认", async () => {
  const db = configTables({
    ai_provider_key_models: [
      { id: "target-row", key_id: "key-1", model_id: "target-model", is_enabled: true },
      { id: "backup-row", key_id: "key-1", model_id: "backup-model", is_enabled: true },
    ],
  });
  const response = await buildAiConfigResponse(request({
    action: "set_global_model_shelf_state",
    data: { modelId: "target-model", is_enabled: false },
  }), actor(db));
  assert.equal(response.status, 200);

  class RuntimeQuery implements PromiseLike<{ data: Row[]; error: null }> {
    private filters: Array<(row: Row) => boolean> = [];
    constructor(private readonly rows: Row[]) {}
    select() { return this; }
    eq(field: string, value: unknown) {
      this.filters.push((row) => row[field] === value);
      return this;
    }
    then<TResult1 = { data: Row[]; error: null }, TResult2 = never>(
      onfulfilled?: ((value: { data: Row[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) {
      return Promise.resolve({ data: this.rows.filter((row) => this.filters.every((filter) => filter(row))), error: null }).then(onfulfilled, onrejected);
    }
  }

  const runtimeService = {
    from(table: string) {
      if (table === "ai_feature_bindings") return new RuntimeQuery([{ feature_key: "default", model_id: "backup-model", is_enabled: true }]);
      if (table !== "ai_provider_key_models") throw new Error(`unexpected runtime table ${table}`);
      const rows = [
        {
          id: "target-row",
          model_id: "target-model",
          is_enabled: false,
          key: {
            id: "key-1",
            api_key: "target-secret",
            is_enabled: true,
            priority: 1,
            consecutive_failures: 0,
            unhealthy_until: null,
            provider: { id: "provider-1", name: "target", base_url: "https://target.test", priority: 1, is_enabled: true },
          },
        },
        {
          id: "backup-row",
          model_id: "backup-model",
          is_enabled: true,
          key: {
            id: "key-1",
            api_key: "backup-secret",
            is_enabled: true,
            priority: 2,
            consecutive_failures: 0,
            unhealthy_until: null,
            provider: { id: "provider-1", name: "backup", base_url: "https://backup.test", priority: 1, is_enabled: true },
          },
        },
      ];
      return new RuntimeQuery(rows);
    },
  };

  aiClientInternal.setServiceClientForTests(runtimeService);
  try {
    const channels = await aiClientInternal.resolveFeatureChannelChainForTests({
      featureKey: "feature-a",
      providerKeyModelId: null,
      modelId: "target-model",
      systemPrompt: null,
      isEnabled: true,
      lifecycleState: "active",
    });
    assert.equal(channels[0]?.providerKeyModelId, "backup-row");
    assert.equal(channels[0]?.model, "backup-model");
  } finally {
    aiClientInternal.setServiceClientForTests(null);
  }
});

test("B3 取消勾选停用模型记录，重新勾选恢复启用", async () => {
  const db = configTables({
    ai_provider_key_models: [
      { id: "old-row", key_id: "key-1", model_id: "old-model", display_name: "Old", is_enabled: true },
      { id: "keep-row", key_id: "key-1", model_id: "keep-model", display_name: "Keep", is_enabled: true },
    ],
  });

  let response = await buildAiConfigResponse(request({ action: "set_key_model_selection", data: { key_id: "key-1", model_ids: ["keep-model"] } }), actor(db));
  assert.equal(response.status, 200);
  assert.equal(db.tables.ai_provider_key_models.find((row) => row.id === "old-row")?.is_enabled, false);
  assert.deepEqual(db.rpcCalls[0], {
    fn: "set_ai_channel_model_selection",
    args: { p_key_id: "key-1", p_model_ids: ["keep-model"], p_display_names: { "keep-model": "Keep Model" } },
  });

  response = await buildAiConfigResponse(request({ action: "set_key_model_selection", data: { key_id: "key-1", model_ids: ["old-model", "keep-model"] } }), actor(db));
  assert.equal(response.status, 200);
  assert.equal(db.tables.ai_provider_key_models.find((row) => row.id === "old-row")?.is_enabled, true);
});

test("B4 删除服务商返回级联数量并由数据库级联清理资产", async () => {
  const db = configTables({
    ai_provider_key_models: [{ id: "model-row", key_id: "key-1", model_id: "model-a", is_enabled: false }],
  });

  const response = await buildAiConfigResponse(request({ action: "delete", entity: "provider", data: { id: "provider-1" } }), actor(db));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body.cascade, { keyCount: 1, modelCount: 1 });
  assert.equal(db.tables.ai_providers.length, 0);
  assert.equal(db.tables.ai_provider_keys.length, 0);
  assert.equal(db.tables.ai_provider_key_models.length, 0);
});

test("B4 删除服务商先返回影响确认；确认后允许执行", async () => {
  const db = configTables({
    ai_provider_key_models: [{ id: "model-row", key_id: "key-1", model_id: "model-a", is_enabled: true }],
    ai_feature_bindings: [{ id: "binding-1", feature_key: "content_analysis", label: "内容分析", model_id: "model-a", provider_key_model_id: "model-row", is_enabled: true, lifecycle_state: "active" }],
  });

  const unconfirmed = await buildAiConfigResponse(request({ action: "delete", entity: "provider", data: { id: "provider-1" } }), actor(db));
  assert.equal(unconfirmed.status, 409);
  assert.equal((await unconfirmed.json()).requiresConfirmation, true);
  assert.equal(db.tables.ai_providers.length, 1);
  assert.equal(db.tables.ai_provider_keys.length, 1);
  assert.equal(db.tables.ai_provider_key_models.length, 1);

  const confirmed = await buildAiConfigResponse(request({
    action: "delete", entity: "provider", data: { id: "provider-1", confirm_impact: true },
  }), actor(db));
  assert.equal(confirmed.status, 200);
  assert.equal(db.tables.ai_providers.length, 0);
  assert.equal(db.tables.ai_provider_keys.length, 0);
});

test("B5 模型改名同步到同 model_id 的所有 Key 记录", async () => {
  const db = configTables({
    ai_provider_key_models: [
      { id: "model-a", key_id: "key-1", model_id: "same-model", display_name: "旧名", is_enabled: true },
      { id: "model-b", key_id: "key-2", model_id: "same-model", display_name: "旧名", is_enabled: false },
    ],
    ai_provider_keys: [{ id: "key-2", provider_id: "provider-1", label: "key-2", api_key: "secret", priority: 2, is_enabled: true }],
  });

  const response = await buildAiConfigResponse(request({ action: "update", entity: "model", data: { id: "model-a", display_name: "新名" } }), actor(db));
  assert.equal(response.status, 200);
  assert.deepEqual(db.tables.ai_provider_key_models.map((row) => row.display_name), ["新名", "新名"]);
  assert.deepEqual(db.rpcCalls.find((call) => call.fn === "update_ai_config_model")?.args, {
    p_supply_id: "model-a", p_patch: { display_name: "新名" },
  });
});

test("B6 新增 Key 按 selectedModelIds 上架当前渠道且不污染其他渠道", async () => {
  const db = configTables({
    ai_provider_key_models: [{ id: "existing-active", key_id: "key-1", model_id: "selected-model", is_enabled: false }],
  });
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ data: [{ id: "selected-model" }, { id: "discovered-only" }] }), { status: 200 });

  try {
    const response = await buildAiConfigResponse(request({
      action: "create",
      entity: "key",
      data: { provider_id: "provider-1", label: "new-key", api_key: "new-secret", selectedModelIds: ["selected-model"] },
    }), actor(db));

    assert.equal(response.status, 200);
    const newKey = db.tables.ai_provider_keys.find((row) => row.label === "new-key");
    assert.ok(newKey);
    assert.equal(db.tables.ai_provider_key_models.find((row) => row.key_id === newKey.id && row.model_id === "selected-model")?.is_enabled, true);
    assert.equal(db.tables.ai_provider_key_models.find((row) => row.key_id === newKey.id && row.model_id === "discovered-only")?.is_enabled, false);
    assert.equal(db.tables.ai_provider_key_models.find((row) => row.id === "existing-active")?.is_enabled, false);
    const createCall = db.rpcCalls.find((call) => call.fn === "create_ai_config_channel");
    assert.ok(createCall);
    assert.deepEqual(createCall.args.p_available_models, ["selected-model", "discovered-only"]);
    assert.deepEqual(createCall.args.p_models, [
      { model_id: "selected-model", display_name: "Selected Model", is_enabled: true },
      { model_id: "discovered-only", display_name: "Discovered Only", is_enabled: false },
    ]);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("C-R1 新渠道勾选只写单渠道供应开关，不再读写旧全局字段", async () => {
  const db = configTables({
    ai_provider_key_models: [
      { id: "shelved-row", key_id: "key-1", model_id: "shelved-model", is_enabled: true, global_is_enabled: false },
    ],
  });
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ data: [{ id: "shelved-model" }] }), { status: 200 });

  try {
    const response = await buildAiConfigResponse(request({
      action: "create",
      entity: "key",
      data: { provider_id: "provider-1", label: "new-key-after-shelf", api_key: "new-secret", selectedModelIds: ["shelved-model"] },
    }), actor(db));
    assert.equal(response.status, 200);
    const newKey = db.tables.ai_provider_keys.find((row) => row.label === "new-key-after-shelf");
    assert.ok(newKey);
    const newModel = db.tables.ai_provider_key_models.find((row) => row.key_id === newKey.id && row.model_id === "shelved-model");
    assert.equal(newModel?.is_enabled, true);
    assert.equal(Object.prototype.hasOwnProperty.call(newModel, "global_is_enabled"), false);

    const availability = computeAvailability({
      providers: [{ id: "provider-1", name: "Provider 1", is_enabled: true }],
      keys: [{ id: newKey.id as string, provider_id: "provider-1", label: "new-key-after-shelf", is_enabled: true, consecutive_failures: 0, last_success_at: new Date().toISOString() }],
      models: [{ id: newModel?.id as string, key_id: newKey.id as string, model_id: "shelved-model", is_enabled: true }],
      featureControls: [],
      defaultBinding: null,
    });
    assert.equal(availability.modelFamilies.find((family) => family.modelId === "shelved-model")?.schedulableChannelCount, 1);
    assert.equal(availability.modelFamilies.find((family) => family.modelId === "shelved-model")?.isSelectable, true);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("B7 全池同步隔离单 Key 探测失败并按增量规则沉淀新模型", async () => {
  const db = configTables({
    ai_provider_keys: [
      { id: "key-ok", provider_id: "provider-1", label: "正常 Key", api_key: "ok-secret", priority: 1, is_enabled: true },
      { id: "key-fail", provider_id: "provider-1", label: "失效 Key", api_key: "fail-secret", priority: 2, is_enabled: true },
      { id: "key-new", provider_id: "provider-1", label: "新模型 Key", api_key: "new-secret", priority: 3, is_enabled: true },
    ],
    ai_provider_key_models: [{ id: "existing-row", key_id: "key-ok", model_id: "existing-model", is_enabled: true }],
  });
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (_input, init) => {
    const authorization = new Headers(init?.headers).get("authorization");
    if (authorization?.includes("fail-secret")) throw new Error("上游网络失败");
    if (authorization?.includes("new-secret")) {
      return new Response(JSON.stringify({ data: [{ id: "new-model" }] }), { status: 200 });
    }
    return new Response(JSON.stringify({ data: [{ id: "existing-model" }] }), { status: 200 });
  };

  try {
    const response = await buildAiConfigResponse(request({ action: "sync_all_keys" }), actor(db));
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.total, 3);
    assert.equal(body.succeeded, 2);
    assert.deepEqual(body.failed, [{ keyId: "key-fail", keyName: "失效 Key", error: "探测模型列表失败：上游网络失败" }]);
    assert.equal(body.reconciled.length, 2);
    assert.equal(db.tables.ai_provider_key_models.find((row) => row.key_id === "key-new" && row.model_id === "new-model")?.is_enabled, false);
    assert.equal(db.tables.ai_provider_key_models.find((row) => row.id === "existing-row")?.is_enabled, true);
  } finally {
    globalThis.fetch = previousFetch;
  }
});
