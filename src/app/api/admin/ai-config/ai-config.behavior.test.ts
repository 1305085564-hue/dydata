import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";

import { buildAiConfigResponse, defaultAiConfigDeps, POST as postAiConfig } from "./route";
import { defaultSyncModelsDeps, POST as postSyncModels } from "./sync-models/route";
import { buildCheckDependenciesResponse, defaultCheckDependenciesDeps } from "./check-dependencies/route";
import { actor, configTables, dependencyScenario, request, type Row } from "./ai-config.behavior.fixture";

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
