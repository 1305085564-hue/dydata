import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";

import { buildAiConfigResponse } from "./route";
import { buildSyncModelsResponse } from "./sync-models/route";
import { actor, configTables, request, type Row } from "./ai-config.behavior.fixture";
import { __internal as aiClientInternal } from "@/lib/ai/client";
import { computeAvailability } from "@/lib/ai-config/availability";

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
          canonical_model_id: "target-model",
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
          canonical_model_id: "backup-model",
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
