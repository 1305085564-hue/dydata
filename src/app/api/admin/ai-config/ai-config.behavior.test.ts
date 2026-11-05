import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";

import { buildAiConfigResponse, defaultAiConfigDeps, POST as postAiConfig } from "./route";
import { buildSyncModelsResponse, defaultSyncModelsDeps, POST as postSyncModels, syncModelsForKey } from "./sync-models/route";
import { buildCheckDependenciesResponse, defaultCheckDependenciesDeps } from "./check-dependencies/route";
import { __internal as aiClientInternal } from "@/lib/ai/client";
import { computeAvailability } from "@/lib/ai-config/availability";

type Row = Record<string, unknown>;
type TableName = "ai_providers" | "ai_provider_keys" | "ai_provider_key_models" | "ai_feature_bindings" | "audit_logs";

type MemoryOptions = {
  failUpdateAfterMutation?: TableName;
};

class MemoryQuery implements PromiseLike<{ data: Row[] | Row | null; error: { message: string } | null }> {
  private filters: Array<(row: Row) => boolean> = [];
  private operation: "select" | "insert" | "update" | "delete" = "select";
  private payload: Row | Row[] | null = null;
  private singleMode: "many" | "single" | "maybeSingle" = "many";
  private limitValue: number | null = null;

  constructor(
    private readonly db: MemorySupabase,
    private readonly table: TableName,
  ) {}

  select(columns?: string) {
    this.operation = "select";
    if (columns) this.db.selectCalls.push(`${this.table}:${columns}`);
    return this;
  }

  insert(payload: Row | Row[]) {
    this.operation = "insert";
    this.payload = payload;
    return this;
  }

  update(payload: Row) {
    this.operation = "update";
    this.payload = payload;
    return this;
  }

  delete() {
    this.operation = "delete";
    return this;
  }

  eq(field: string, value: unknown) {
    this.filters.push((row) => row[field] === value);
    return this;
  }

  neq(field: string, value: unknown) {
    this.filters.push((row) => row[field] !== value);
    return this;
  }

  in(field: string, values: unknown[]) {
    this.filters.push((row) => values.includes(row[field]));
    return this;
  }

  or(expression: string) {
    const alternatives = expression.split(",").map((clause) => {
      const [field, operator, rawValue] = clause.split(".");
      if (operator !== "eq") return () => false;
      return (row: Row) => String(row[field]) === rawValue;
    });
    this.filters.push((row) => alternatives.some((match) => match(row)));
    return this;
  }

  order() {
    return this;
  }

  limit(value: number) {
    this.limitValue = value;
    return this;
  }

  single() {
    this.singleMode = "single";
    return this;
  }

  maybeSingle() {
    this.singleMode = "maybeSingle";
    return this;
  }

  then<TResult1 = { data: Row[] | Row | null; error: { message: string } | null }, TResult2 = never>(
    onfulfilled?: ((value: { data: Row[] | Row | null; error: { message: string } | null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    try {
      const result = this.execute();
      return Promise.resolve(result).then(onfulfilled, onrejected);
    } catch (error) {
      return Promise.reject(error).then(onfulfilled, onrejected);
    }
  }

  private execute() {
    const rows = this.db.tables[this.table];
    const matches = () => rows.filter((row) => this.filters.every((filter) => filter(row)));

    if (this.operation === "select") {
      const selected = matches().slice(0, this.limitValue ?? Number.POSITIVE_INFINITY).map((row) => ({ ...row }));
      if (this.singleMode === "single") {
        return { data: selected[0] ?? null, error: selected.length === 1 ? null : { message: "expected one row" } };
      }
      if (this.singleMode === "maybeSingle") return { data: selected[0] ?? null, error: null };
      return { data: selected, error: null };
    }

    if (this.operation === "insert") {
      const input = Array.isArray(this.payload) ? this.payload : [this.payload ?? {}];
      const inserted = input.map((row, index) => ({
        ...row,
        id: row.id ?? `${this.table}-generated-${this.db.nextId++}-${index}`,
      }));
      rows.push(...inserted);
      return { data: inserted.length === 1 ? inserted[0] : inserted, error: null };
    }

    const matchingRows = matches();
    if (this.operation === "update") {
      for (const row of matchingRows) Object.assign(row, this.payload ?? {});
      if (this.db.options.failUpdateAfterMutation === this.table) {
        this.db.options.failUpdateAfterMutation = undefined;
        return { data: null, error: { message: `simulated ${this.table} update failure` } };
      }
      return { data: matchingRows, error: null };
    }

    const deletedIds = new Set(matchingRows.map((row) => row.id));
    this.db.tables[this.table] = rows.filter((row) => !deletedIds.has(row.id));
    this.db.cascade(this.table, matchingRows);
    return { data: null, error: null };
  }
}

class MemorySupabase {
  nextId = 1;
  readonly selectCalls: string[] = [];
  readonly tables: Record<TableName, Row[]>;
  readonly options: MemoryOptions;

  constructor(input: Partial<Record<TableName, Row[]>> = {}, options: MemoryOptions = {}) {
    this.tables = {
      ai_providers: (input.ai_providers ?? []).map((row) => ({ ...row })),
      ai_provider_keys: (input.ai_provider_keys ?? []).map((row) => ({ ...row })),
      ai_provider_key_models: (input.ai_provider_key_models ?? []).map((row) => ({ ...row })),
      ai_feature_bindings: (input.ai_feature_bindings ?? []).map((row) => ({ ...row })),
      audit_logs: (input.audit_logs ?? []).map((row) => ({ ...row })),
    };
    this.options = options;
  }

  from(table: TableName) {
    return new MemoryQuery(this, table);
  }

  cascade(table: TableName, rows: Row[]) {
    if (table === "ai_providers") {
      const providerIds = new Set(rows.map((row) => row.id));
      const keyRows = this.tables.ai_provider_keys.filter((row) => providerIds.has(row.provider_id));
      this.tables.ai_provider_keys = this.tables.ai_provider_keys.filter((row) => !providerIds.has(row.provider_id));
      const keyIds = new Set(keyRows.map((row) => row.id));
      this.tables.ai_provider_key_models = this.tables.ai_provider_key_models.filter((row) => !keyIds.has(row.key_id));
    }
    if (table === "ai_provider_keys") {
      const keyIds = new Set(rows.map((row) => row.id));
      this.tables.ai_provider_key_models = this.tables.ai_provider_key_models.filter((row) => !keyIds.has(row.key_id));
    }
  }
}

function request(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/admin/ai-config", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

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

function actor(db: MemorySupabase) {
  return {
    requireSystemActor: async () => ({
      supabase: db as never,
      actor: { userId: "admin-1", role: "owner" } as never,
    }),
  };
}

function configTables(overrides: Partial<Record<TableName, Row[]>> = {}, options: MemoryOptions = {}) {
  return new MemorySupabase({
    ai_providers: [{ id: "provider-1", name: "Provider 1", base_url: "https://provider.test", priority: 1, is_enabled: true }],
    ai_provider_keys: [{ id: "key-1", provider_id: "provider-1", label: "key-1", api_key: "secret", priority: 1, is_enabled: true }],
    ai_provider_key_models: [],
    ai_feature_bindings: [],
    ...overrides,
  }, options);
}

function dependencyScenario() {
  return configTables({
    ai_provider_key_models: [
      { id: "target-row", key_id: "key-1", model_id: "target-model", display_name: "目标模型", is_enabled: true, disabled_by_model: false },
      { id: "default-row", key_id: "key-1", model_id: "default-model", display_name: "默认模型", is_enabled: false, disabled_by_model: false },
      { id: "unrelated-row", key_id: "key-1", model_id: "unrelated-model", display_name: "其他模型", is_enabled: true, disabled_by_model: false },
    ],
    ai_feature_bindings: [
      { id: "default-binding", feature_key: "default", label: "全局默认", model_id: "default-model", provider_key_model_id: "unrelated-row", is_enabled: true, lifecycle_state: "active" },
      { id: "business-binding", feature_key: "content_analysis", label: "内容分析", model_id: "target-model", provider_key_model_id: "unrelated-row", is_enabled: true, lifecycle_state: "active" },
    ],
  });
}

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

test("B2 模型全局下架部分更新失败时恢复操作前状态", async () => {
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
  }, { failUpdateAfterMutation: "ai_provider_key_models" });

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

test("B8 check_all_in_use 只测已启用业务与默认的开启供应，包含休眠和失效", async () => {
  const sleepUntil = new Date(Date.now() + 30 * 60_000).toISOString();
  const invalidSince = new Date().toISOString();
  const db = configTables({
    ai_providers: [
      { id: "provider-1", name: "Provider 1", base_url: "https://provider.test", priority: 1, is_enabled: true },
      { id: "provider-off", name: "Provider Off", base_url: "https://off.test", priority: 2, is_enabled: false },
    ],
    ai_provider_keys: [
      { id: "key-invalid", provider_id: "provider-1", label: "失效但开启", api_key: "invalid-secret", priority: 1, is_enabled: true, consecutive_failures: 3, invalidated_at: invalidSince },
      { id: "key-sleeping", provider_id: "provider-1", label: "休眠但开启", api_key: "sleep-secret", priority: 2, is_enabled: true, manual_sleep_until: sleepUntil },
      { id: "key-disabled", provider_id: "provider-1", label: "手动停用", api_key: "disabled-secret", priority: 3, is_enabled: false },
      { id: "key-provider-disabled", provider_id: "provider-off", label: "接入点停用", api_key: "provider-off-secret", priority: 4, is_enabled: true },
    ],
    ai_provider_key_models: [
      { id: "selected-invalid", key_id: "key-invalid", model_id: "selected-model", is_enabled: true, invalidated_at: invalidSince, consecutive_failures: 5, last_error_message: "old model failure" },
      { id: "default-sleeping", key_id: "key-sleeping", model_id: "default-model", is_enabled: true, unhealthy_until: sleepUntil },
      { id: "selected-disabled-key", key_id: "key-disabled", model_id: "selected-model", is_enabled: true },
      { id: "default-disabled-provider", key_id: "key-provider-disabled", model_id: "default-model", is_enabled: true },
      { id: "model-off", key_id: "key-invalid", model_id: "selected-model", is_enabled: false },
      { id: "not-selected", key_id: "key-invalid", model_id: "other-model", is_enabled: true, consecutive_failures: 4, last_error_message: "sibling failure" },
      { id: "disabled-feature-model", key_id: "key-invalid", model_id: "paused-model", is_enabled: true },
    ],
    ai_feature_bindings: [
      { id: "default-binding", feature_key: "default", label: "默认模型", model_id: "default-model", is_enabled: true, lifecycle_state: "active" },
      { id: "selected-binding", feature_key: "content_analysis", label: "内容分析", model_id: "selected-model", is_enabled: true, lifecycle_state: "active" },
      { id: "paused-binding", feature_key: "video_tag", label: "已关闭功能", model_id: "paused-model", is_enabled: false, lifecycle_state: "active" },
    ],
  });
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (_input, init) => {
    const payload = JSON.parse(String(init?.body ?? "{}")) as { model?: string };
    return payload.model === "selected-model"
      ? new Response("model_not_found", { status: 404 })
      : new Response("ok", { status: 200 });
  };

  try {
    const response = await buildAiConfigResponse(request({ action: "check_all_in_use" }), actor(db));
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.checkResult.total, 2);
    assert.equal(body.checkResult.successCount, 1);
    assert.equal(body.checkResult.failureCount, 1);
    assert.deepEqual(body.checkResult.results.map((result: Row) => ({
      keyId: result.keyId, modelId: result.modelId, ok: result.ok, latencyMs: result.latencyMs === null,
      message: result.message,
      diagnosticCategory: result.failureDiagnostic ? String((result.failureDiagnostic as { category?: string }).category ?? "") : null,
      diagnosticOwner: result.failureDiagnostic ? String((result.failureDiagnostic as { owner?: string }).owner ?? "") : null,
    })), [
      { keyId: "key-invalid", modelId: "selected-model", ok: false, latencyMs: true, message: "HTTP 404: model_not_found", diagnosticCategory: "model_access", diagnosticOwner: "provider" },
      { keyId: "key-sleeping", modelId: "default-model", ok: true, latencyMs: false, message: null, diagnosticCategory: null, diagnosticOwner: null },
    ]);
    assert.equal(typeof body.checkResult.results[1].latencyMs, "number");
    assert.ok(body.availability);
    assert.equal(db.tables.ai_provider_key_models.find((row) => row.id === "selected-invalid")?.invalidated_at, invalidSince);
    assert.equal(db.tables.ai_provider_key_models.find((row) => row.id === "selected-invalid")?.consecutive_failures, 5);
    assert.equal(db.tables.ai_provider_keys.find((row) => row.id === "key-invalid")?.consecutive_failures, 3);
    assert.equal(db.tables.ai_provider_key_models.find((row) => row.id === "default-sleeping")?.consecutive_failures ?? 0, 0);
    assert.equal(db.tables.ai_provider_keys.find((row) => row.id === "key-sleeping")?.manual_sleep_until, null);
    assert.equal(db.tables.ai_provider_key_models.find((row) => row.id === "not-selected")?.consecutive_failures, 4);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("B9 成功测试只恢复对应Key和实测模型，不清兄弟模型故障", async () => {
  const stale = new Date(Date.now() - 10 * 60_000).toISOString();
  const sleepUntil = new Date(Date.now() + 30 * 60_000).toISOString();
  const db = configTables({
    ai_provider_keys: [{
      id: "key-1",
      provider_id: "provider-1",
      label: "测试 Key",
      api_key: "model-secret",
      priority: 1,
      is_enabled: true,
      consecutive_failures: 4,
      first_failure_at: stale,
      last_failure_at: stale,
      unhealthy_until: sleepUntil,
      manual_sleep_until: sleepUntil,
    }],
    ai_provider_key_models: [
      { id: "model-row", key_id: "key-1", model_id: "model-a", is_enabled: true, consecutive_failures: 5, first_failure_at: stale, last_failure_at: stale, unhealthy_until: sleepUntil, invalidated_at: stale, last_error_message: "current model failure", last_failure_scope: "model" },
      { id: "sibling-row", key_id: "key-1", model_id: "model-b", is_enabled: true, consecutive_failures: 3, first_failure_at: stale, last_failure_at: stale, unhealthy_until: sleepUntil, invalidated_at: stale, last_error_message: "sibling model failure", last_failure_scope: "model" },
    ],
  });
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("ok", { status: 200 });

  try {
    const response = await buildAiConfigResponse(request({
      action: "test_key_model",
      data: { key_id: "key-1", model_id: "model-a" },
    }), actor(db));
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.testResult.ok, true);
    assert.equal(body.testResult.errorScope, null);
    const tested = db.tables.ai_provider_key_models.find((row) => row.id === "model-row");
    const sibling = db.tables.ai_provider_key_models.find((row) => row.id === "sibling-row");
    assert.equal(tested?.last_success_at !== undefined, true);
    assert.equal(tested?.consecutive_failures, 0);
    assert.equal(tested?.first_failure_at, null);
    assert.equal(tested?.unhealthy_until, null);
    assert.equal(tested?.invalidated_at, null);
    assert.equal(db.tables.ai_provider_keys[0].last_success_at !== undefined, true);
    assert.equal(db.tables.ai_provider_keys[0].consecutive_failures, 0);
    assert.equal(db.tables.ai_provider_keys[0].manual_sleep_until, null);
    assert.equal(sibling?.consecutive_failures, 3);
    assert.equal(sibling?.first_failure_at, stale);
    assert.equal(sibling?.invalidated_at, stale);
    assert.equal(sibling?.last_error_message, "sibling model failure");
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("截图功能试跑失败不改健康；成功只恢复实际返回的Key与供应", async () => {
  const stale = new Date(Date.now() - 10 * 60_000).toISOString();
  const sleepUntil = new Date(Date.now() + 30 * 60_000).toISOString();
  const db = configTables({
    ai_provider_keys: [{ id: "key-1", provider_id: "provider-1", label: "测试 Key", api_key: "secret", priority: 1, is_enabled: true, consecutive_failures: 4, first_failure_at: stale, last_failure_at: stale, unhealthy_until: sleepUntil, manual_sleep_until: sleepUntil }],
    ai_provider_key_models: [
      { id: "tested-row", key_id: "key-1", model_id: "haiku-model", is_enabled: true, consecutive_failures: 5, first_failure_at: stale, last_failure_at: stale, unhealthy_until: sleepUntil, invalidated_at: stale, last_error_message: "tested model failure" },
      { id: "sibling-row", key_id: "key-1", model_id: "sibling-model", is_enabled: true, consecutive_failures: 3, first_failure_at: stale, last_failure_at: stale, unhealthy_until: sleepUntil, invalidated_at: stale, last_error_message: "sibling model failure" },
    ],
  });
  let failProbe = true;
  const deps = {
    requireSystemActor: actor(db).requireSystemActor,
    probeAiFeature: async (_feature: string, options: { validateContent?: (content: string) => boolean }) => {
      assert.equal(options.validateContent?.('{"color":"black"}'), true);
      assert.equal(options.validateContent?.('{"color":"white"}'), false);
      if (failProbe) throw new Error("图片识别验证失败：没有识别出黑色测试像素");
      return { content: '{"color":"black"}', model: "haiku-model", channelName: "测试渠道", providerKeyId: "key-1", providerKeyModelId: "tested-row", elapsedMs: 5 };
    },
  };
  const request = () => new NextRequest("http://localhost/api/admin/ai-config", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "test_key", data: { feature_key: "ocr_screenshot" } }),
  });

  const before = JSON.stringify(db.tables);
  const failed = await buildAiConfigResponse(request(), deps);
  assert.equal((await failed.json()).testResult.ok, false);
  assert.equal(JSON.stringify(db.tables), before);

  failProbe = false;
  const success = await buildAiConfigResponse(request(), deps);
  assert.equal((await success.json()).testResult.ok, true);
  assert.equal(db.tables.ai_provider_keys[0].consecutive_failures, 0);
  assert.equal(db.tables.ai_provider_keys[0].manual_sleep_until, null);
  assert.equal(db.tables.ai_provider_key_models.find((row) => row.id === "tested-row")?.consecutive_failures, 0);
  assert.equal(db.tables.ai_provider_key_models.find((row) => row.id === "tested-row")?.invalidated_at, null);
  assert.equal(db.tables.ai_provider_key_models.find((row) => row.id === "sibling-row")?.consecutive_failures, 3);
  assert.equal(db.tables.ai_provider_key_models.find((row) => row.id === "sibling-row")?.invalidated_at, stale);
  assert.equal(db.tables.ai_provider_key_models.find((row) => row.id === "sibling-row")?.last_error_message, "sibling model failure");
});

test("Haiku 5.5 看图探测走原生 Messages API，并校验识别正文", async () => {
  const stale = new Date(Date.now() - 10 * 60_000).toISOString();
  const db = configTables({
    ai_provider_key_models: [{ id: "haiku-row", key_id: "key-1", model_id: "claude-haiku-5-5", is_enabled: true, consecutive_failures: 3, first_failure_at: stale, last_failure_at: stale, invalidated_at: stale }],
    ai_provider_keys: [{ id: "key-1", provider_id: "provider-1", label: "Haiku", api_key: "haiku-secret", priority: 1, is_enabled: true, consecutive_failures: 3, first_failure_at: stale, last_failure_at: stale, manual_sleep_until: new Date(Date.now() + 60_000).toISOString() }],
  });
  const previousFetch = globalThis.fetch;
  let responseText = '{"color":"black"}';
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), "https://provider.test/messages");
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("x-api-key"), "haiku-secret");
    assert.equal(headers.get("anthropic-version"), "2023-06-01");
    assert.equal(headers.get("authorization"), null);
    const payload = JSON.parse(String(init?.body ?? "{}")) as { messages: Array<{ content: Array<{ source?: { type?: string; media_type?: string } }> }>; stream?: boolean };
    assert.equal(payload.stream, false);
    assert.equal(payload.messages[0].content[1].source?.type, "base64");
    assert.equal(payload.messages[0].content[1].source?.media_type, "image/png");
    return Response.json({ model: "claude-haiku-5-5", content: [{ type: "text", text: responseText }], usage: { input_tokens: 10, output_tokens: 3 } });
  };

  const runProbe = () => buildAiConfigResponse(request({
    action: "test_key",
    data: { key_id: "key-1", model_id: "claude-haiku-5-5", test_mode: "vision" },
  }), actor(db));

  try {
    const passed = await runProbe();
    assert.equal((await passed.json()).testResult.ok, true);
    assert.equal(db.tables.ai_provider_key_models[0].consecutive_failures, 0);
    assert.equal(db.tables.ai_provider_key_models[0].invalidated_at, null);
    assert.equal(db.tables.ai_provider_keys[0].manual_sleep_until, null);

    db.tables.ai_provider_key_models[0].consecutive_failures = 2;
    db.tables.ai_provider_key_models[0].invalidated_at = stale;
    db.tables.ai_provider_key_models[0].last_error_message = "retain on failed probe";
    const modelSnapshot = { ...db.tables.ai_provider_key_models[0] };
    const keySnapshot = { ...db.tables.ai_provider_keys[0] };
    responseText = '{"color":"white"}';
    const failed = await runProbe();
    const body = await failed.json();
    assert.equal(body.testResult.ok, false);
    assert.match(body.testResult.message, /没有识别出黑色测试像素/);
    assert.ok(body.testResult.failureDiagnostic);
    assert.deepEqual(db.tables.ai_provider_key_models[0], modelSnapshot);
    assert.deepEqual(db.tables.ai_provider_keys[0], keySnapshot);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("B10 test_key_model 的模型错误只写当前模型，且错误响应不泄露 API Key", async () => {
  const db = configTables({
    ai_provider_keys: [{
      id: "key-1",
      provider_id: "provider-1",
      label: "测试 Key",
      api_key: "model-secret",
      priority: 1,
      is_enabled: true,
      consecutive_failures: 0,
    }],
    ai_provider_key_models: [{
      id: "model-row",
      key_id: "key-1",
      model_id: "model-a",
      is_enabled: true,
      consecutive_failures: 0,
    }],
  });
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(
    JSON.stringify({ error: `model_not_found; Bearer model-secret` }),
    { status: 404 },
  );

  try {
    const response = await buildAiConfigResponse(request({
      action: "test_key_model",
      data: { key_id: "key-1", model_id: "model-a" },
    }), actor(db));
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.testResult.ok, false);
    assert.equal(body.testResult.errorScope, "model");
    assert.match(body.testResult.message, /model_not_found/);
    assert.equal(body.testResult.message.includes("model-secret"), false);
    assert.equal(db.tables.ai_provider_key_models[0].consecutive_failures ?? 0, 0);
    assert.equal(db.tables.ai_provider_keys[0].consecutive_failures ?? 0, 0);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

/**
 * 复现 2026-10-10 的伪修复：ae86a6cb 只删了外层 is_enabled 过滤，
 * 内层 handleTestKeyModel 仍拒绝未勾选与已全站下架的模型，
 * 结果这些模型不是被真测，而是被兜成「该渠道未挂载此模型」的假失败。
 */
test("B11 检测范围含未勾选与已全站下架模型：不得出现假失败，测通必须洗白模型状态", async () => {
  const db = configTables({
    ai_provider_key_models: [
      { id: "row-live", key_id: "key-1", model_id: "model-live", is_enabled: true },
      { id: "row-draft", key_id: "key-1", model_id: "model-draft", is_enabled: false },
      { id: "row-unshelved", key_id: "key-1", model_id: "model-unshelved", is_enabled: true, global_is_enabled: false },
    ],
  });
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("ok", { status: 200 });

  try {
    const response = await buildAiConfigResponse(request({
      action: "test_key_all_models",
      data: { key_id: "key-1" },
    }), actor(db));
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.total, 3, "三个挂载模型都应进入检测");
    assert.equal(body.successCount, 3, "上游全部返回 200，不应有失败");
    assert.equal(body.failureCount, 0);
    assert.deepEqual(body.failedModelIds, []);
    assert.equal(
      db.tables.ai_provider_key_models.filter((row) => row.last_success_at !== undefined).length,
      3,
      "测通后三条模型记录都要被洗白",
    );
    assert.equal(db.tables.ai_provider_keys[0].consecutive_failures, 0);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("test_key_all_models 会检测当前渠道全部挂载模型并返回失败原因", async () => {
  const db = configTables({
    ai_provider_key_models: [
      { id: "model-good-row", key_id: "key-1", model_id: "model-good", is_enabled: true },
      { id: "model-fail-row", key_id: "key-1", model_id: "model-fail", is_enabled: true },
    ],
  });
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (_input, init) => {
    const payload = JSON.parse(String(init?.body ?? "{}")) as { model?: string };
    return payload.model === "model-fail"
      ? new Response("model unavailable", { status: 400 })
      : new Response("ok", { status: 200 });
  };

  try {
    const response = await buildAiConfigResponse(request({
      action: "test_key_all_models",
      data: { key_id: "key-1" },
    }), actor(db));
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.keyId, "key-1");
    assert.equal(body.total, 2);
    assert.equal(body.successCount, 1);
    assert.equal(body.failureCount, 1);
    assert.deepEqual(body.failedModelIds, ["model-fail"]);
    assert.deepEqual(body.results.map((result: Record<string, unknown>) => ({
      modelId: result.modelId,
      ok: result.ok,
      error: result.error,
    })), [
      { modelId: "model-good", ok: true, error: null },
      { modelId: "model-fail", ok: false, error: "HTTP 400: model unavailable" },
    ]);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("test_all_keys 与 test_all_keys_all_models 兼容别名返回同一 checkResult", async () => {
  const db = configTables({
    ai_provider_key_models: [{ id: "default-row", key_id: "key-1", model_id: "default-model", is_enabled: true }],
    ai_feature_bindings: [{ id: "default-binding", feature_key: "default", label: "全局默认", model_id: "default-model", is_enabled: true, lifecycle_state: "active" }],
  });
  const previousFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => { requests += 1; return new Response("ok", { status: 200 }); };

  try {
    for (const action of ["test_all_keys", "test_all_keys_all_models"]) {
      const response = await buildAiConfigResponse(request({ action }), actor(db));
      const body = await response.json();
      assert.equal(response.status, 200);
      assert.deepEqual(body.checkResult.results.map((result: Row) => ({ keyId: result.keyId, modelId: result.modelId, ok: result.ok, message: result.message })), [
        { keyId: "key-1", modelId: "default-model", ok: true, message: null },
      ]);
      assert.equal(body.checkResult.total, 1);
      assert.ok(body.availability);
    }
    assert.equal(requests, 2);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("批量模型检测使用有限并发而不是逐个串行等待", async () => {
  const db = configTables({
    ai_provider_key_models: Array.from({ length: 8 }, (_, index) => ({
      id: `model-row-${index}`,
      key_id: "key-1",
      model_id: `model-${index}`,
      is_enabled: true,
    })),
  });
  const previousFetch = globalThis.fetch;
  let activeRequests = 0;
  let maxActiveRequests = 0;
  globalThis.fetch = async () => {
    activeRequests += 1;
    maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
    await new Promise((resolve) => setTimeout(resolve, 15));
    activeRequests -= 1;
    return new Response("ok", { status: 200 });
  };

  try {
    const response = await buildAiConfigResponse(request({
      action: "test_key_all_models",
      data: { key_id: "key-1" },
    }), actor(db));
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.total, 8);
    assert.ok(maxActiveRequests >= 2, `expected concurrent probes, saw ${maxActiveRequests}`);
    assert.ok(maxActiveRequests <= 4, `expected a concurrency cap, saw ${maxActiveRequests}`);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("模型探测超时返回 15 秒判定线与可读中文原因，不泄露英文 AbortError", async () => {
  const db = configTables({
    ai_provider_key_models: [
      { id: "model-slow-row", key_id: "key-1", model_id: "model-slow", is_enabled: true },
    ],
  });
  const previousFetch = globalThis.fetch;
  const timeoutError = new Error("The operation was aborted due to timeout");
  timeoutError.name = "TimeoutError";
  globalThis.fetch = async () => {
    throw timeoutError;
  };

  try {
    const response = await buildAiConfigResponse(request({
      action: "test_key_all_models",
      data: { key_id: "key-1" },
    }), actor(db));
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.successCount, 0);
    assert.equal(body.failureCount, 1);
    assert.deepEqual(body.results, [{
      modelId: "model-slow",
      ok: false,
      latencyMs: null,
      error: "上游 15 秒内没有返回任何响应（超时）",
      failureDiagnostic: { category: "provider", owner: "provider", technical: { message: "上游 15 秒内没有返回任何响应（超时）", status: null, requestId: null } },
    }]);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("单模型测试与批量检测共用同一条 15 秒判定线与同一句失败原因", async () => {
  const db = configTables({
    ai_provider_key_models: [
      { id: "model-slow-row", key_id: "key-1", model_id: "model-slow", is_enabled: true },
    ],
  });
  const previousFetch = globalThis.fetch;
  const timeoutError = new Error("The operation was aborted due to timeout");
  timeoutError.name = "TimeoutError";
  globalThis.fetch = async () => {
    throw timeoutError;
  };

  try {
    const single = await buildAiConfigResponse(request({
      action: "test_key_model",
      data: { key_id: "key-1", model_id: "model-slow" },
    }), actor(db));
    const singleBody = await single.json();

    const batch = await buildAiConfigResponse(request({
      action: "test_key_all_models",
      data: { key_id: "key-1" },
    }), actor(db));
    const batchBody = await batch.json();

    assert.equal(singleBody.testResult.ok, false);
    assert.equal(singleBody.testResult.message, "上游 15 秒内没有返回任何响应（超时）");
    // 同一个模型、同一时刻的判定结果与原因必须与批量一致
    assert.equal(batchBody.results[0].ok, singleBody.testResult.ok);
    assert.equal(batchBody.results[0].error, singleBody.testResult.message);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("C1 上游清单为空不替代真实业务依赖；无业务受影响可关闭", async () => {
  const db = configTables({
    ai_provider_keys: [{ id: "key-1", provider_id: "provider-1", label: "channel", api_key: "secret", is_enabled: true, available_models: [] }],
    ai_provider_key_models: [{ id: "row", key_id: "key-1", model_id: "model-a", is_enabled: true }],
  });
  const response = await buildAiConfigResponse(request({ action: "update", entity: "key", data: { id: "key-1", is_enabled: false } }), actor(db));
  assert.equal(response.status, 200);
  assert.equal(db.tables.ai_provider_keys[0].is_enabled, false);
  assert.equal(db.tables.ai_provider_key_models[0].is_enabled, true);
});

test("C1 现有供应可重新打开，不因上游清单未知增加第二套开关规则", async () => {
  const db = configTables({ ai_provider_key_models: [{ id: "row", key_id: "key-1", model_id: "model-a", is_enabled: false }] });
  const response = await buildAiConfigResponse(request({ action: "set_key_model_selection", data: { key_id: "key-1", model_ids: ["model-a"] } }), actor(db));
  assert.equal(response.status, 200);
  assert.equal(db.tables.ai_provider_key_models[0].is_enabled, true);
});

test("C2 批量停用恢复只恢复原来打开的供应", async () => {
  const db = configTables({ ai_provider_key_models: [
    { id: "on", key_id: "key-1", model_id: "model-a", is_enabled: true, disabled_by_model: false },
    { id: "off", key_id: "key-1", model_id: "model-a", is_enabled: false, disabled_by_model: false },
  ] });
  for (const isEnabled of [false, true]) {
    const response = await buildAiConfigResponse(request({ action: "set_model_enabled", data: { model_id: "model-a", is_enabled: isEnabled } }), actor(db));
    assert.equal(response.status, 200);
  }
  assert.deepEqual(db.tables.ai_provider_key_models.map(row => row.is_enabled), [true, false]);
  assert.deepEqual(db.tables.ai_provider_key_models.map(row => row.disabled_by_model), [false, false]);
});

test("C3 同一渠道连点五次检测不改变供给或健康计数", async () => {
  const db = configTables({
    ai_provider_key_models: [{ id: "model-row", key_id: "key-1", model_id: "model-a", is_enabled: true, global_is_enabled: true, consecutive_failures: 2 }],
    ai_provider_keys: [{ id: "key-1", provider_id: "provider-1", label: "key-1", api_key: "secret", priority: 1, is_enabled: true, consecutive_failures: 1 }],
  });
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("model unavailable", { status: 400 });
  try {
    const before = JSON.stringify(db.tables);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await buildAiConfigResponse(request({ action: "test_key_all_models", data: { key_id: "key-1" } }), actor(db));
      assert.equal(response.status, 200);
      assert.equal((await response.json()).failureCount, 1);
    }
    assert.equal(JSON.stringify(db.tables), before);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("C4 同步后只把清单缺失且实测 404 的模型列为已核实，其余保持未知", async () => {
  const db = configTables({
    ai_provider_keys: [{ id: "key-1", provider_id: "provider-1", label: "api tang ChatGPT", api_key: "secret", priority: 1, is_enabled: true, available_models: ["model-live"] }],
    ai_provider_key_models: [
      { id: "live-row", key_id: "key-1", model_id: "model-live", is_enabled: true },
      { id: "dead-row", key_id: "key-1", model_id: "model-dead", is_enabled: true },
      { id: "unknown-row", key_id: "key-1", model_id: "model-unknown", is_enabled: true },
    ],
  });
  const result = await syncModelsForKey(db as never, { keyId: "key-1", modelIds: ["model-live"] }, async (_input, init) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { model?: string };
    if (body.model === "model-dead") return new Response("model_not_found", { status: 404 });
    return new Response("upstream unavailable", { status: 500 });
  });
  assert.deepEqual(result.reconciliation.verifiedUnavailableModelIds, ["model-dead"]);
  assert.deepEqual(result.reconciliation.unknownModelIds, ["model-unknown"]);
  assert.equal(result.reconciliation.status, "unknown");
  assert.deepEqual(db.tables.ai_provider_key_models.filter((row) => row.key_id === "key-1").map((row) => row.model_id), ["model-live", "model-dead", "model-unknown"]);
});

test("C-R2 单渠道幽灵比对并发上限为 4 且仍逐条完成", async () => {
  const staleModels = Array.from({ length: 21 }, (_, index) => ({
    id: `stale-row-${index}`,
    key_id: "key-1",
    model_id: `stale-model-${index}`,
    is_enabled: true,
  }));
  const db = configTables({
    ai_provider_keys: [{ id: "key-1", provider_id: "provider-1", label: "api1 default", api_key: "secret", priority: 1, is_enabled: true }],
    ai_provider_key_models: staleModels,
  });
  let activeRequests = 0;
  let maxActiveRequests = 0;
  let requestCount = 0;
  const fetcher = async () => {
    requestCount += 1;
    activeRequests += 1;
    maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
    await new Promise((resolve) => setTimeout(resolve, 10));
    activeRequests -= 1;
    return new Response("model_not_found", { status: 404 });
  };

  const result = await syncModelsForKey(db as never, { keyId: "key-1", modelIds: ["live-model"] }, fetcher);
  assert.equal(requestCount, 21);
  assert.ok(maxActiveRequests >= 2, `expected concurrent probes, saw ${maxActiveRequests}`);
  assert.ok(maxActiveRequests <= 4, `expected a concurrency cap of 4, saw ${maxActiveRequests}`);
  assert.equal(result.reconciliation.verifiedUnavailableModelIds.length, 21);
});

test("C6 收走渠道模型成功后写入操作人、对象和来源审计", async () => {
  const db = configTables({
    ai_provider_keys: [{ id: "key-1", provider_id: "provider-1", label: "api tang ChatGPT", api_key: "secret", priority: 1, is_enabled: true, available_models: ["model-a"] }],
    ai_provider_key_models: [{ id: "model-row", key_id: "key-1", model_id: "model-a", display_name: "模型 A", is_enabled: false, global_is_enabled: true }],
  });
  const response = await buildAiConfigResponse(request({ action: "delete", entity: "model", data: { id: "model-row" } }), actor(db));
  assert.equal(response.status, 200);
  assert.equal(db.tables.ai_provider_key_models.length, 0);
  assert.equal(db.tables.audit_logs.length, 1);
  assert.equal(db.tables.audit_logs[0].user_id, "admin-1");
  assert.equal(db.tables.audit_logs[0].action, "ai_provider_model_remove");
  assert.match(String(db.tables.audit_logs[0].detail), /admin_ai_config/);
});

test("C8 没有正在使用的可检测供应时 checkResult 返回 0/0", async () => {
  const db = configTables();
  const response = await buildAiConfigResponse(request({ action: "check_all_in_use" }), actor(db));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(body.checkResult, { total: 0, successCount: 0, failureCount: 0, results: [] });
  assert.ok(body.availability);
});
