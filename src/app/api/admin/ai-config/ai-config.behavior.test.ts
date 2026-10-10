import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";

import { buildAiConfigResponse, defaultAiConfigDeps, POST as postAiConfig } from "./route";
import { buildSyncModelsResponse, syncModelsForKey } from "./sync-models/route";
import { buildCheckDependenciesResponse } from "./check-dependencies/route";
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

  select() {
    this.operation = "select";
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
      checkKeyDependencies: async () => { throw new Error("依赖查询失败"); },
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

test("B2 模型全局下架会拦截无备用渠道的业务绑定", async () => {
  const db = configTables({
    ai_provider_key_models: [{ id: "target-row", key_id: "key-1", model_id: "target-model", is_enabled: true }],
    ai_feature_bindings: [{ id: "binding-1", feature_key: "feature-a", label: "功能 A", model_id: "target-model", provider_key_model_id: "target-row", is_enabled: true, lifecycle_state: "active" }],
  });

  const response = await buildAiConfigResponse(request({
    action: "set_global_model_shelf_state",
    data: { modelId: "target-model", is_enabled: false },
  }), actor(db));

  assert.equal(response.status, 409);
  assert.match((await response.json()).error, /功能 A/);
  assert.equal(db.tables.ai_provider_key_models[0].is_enabled, true);
});

test("B2 模型全局下架有其他健康模型时放行且全库熄灭目标模型", async () => {
  const db = configTables({
    ai_provider_key_models: [
      { id: "target-row", key_id: "key-1", model_id: "target-model", is_enabled: true },
      { id: "backup-row", key_id: "key-1", model_id: "backup-model", is_enabled: true },
    ],
    ai_feature_bindings: [{ id: "binding-1", feature_key: "feature-a", label: "功能 A", model_id: "target-model", provider_key_model_id: "target-row", is_enabled: true, lifecycle_state: "active" }],
  });

  const response = await buildAiConfigResponse(request({
    action: "set_global_model_shelf_state",
    data: { modelId: "target-model", is_enabled: false },
  }), actor(db));

  assert.equal(response.status, 200);
  assert.equal(db.tables.ai_provider_key_models.find((row) => row.id === "target-row")?.is_enabled, true);
  assert.equal(db.tables.ai_provider_key_models.find((row) => row.id === "target-row")?.global_is_enabled, false);
  assert.equal(db.tables.ai_provider_key_models.find((row) => row.id === "backup-row")?.is_enabled, true);
});

test("B2 模型全局下架部分更新失败时恢复操作前状态", async () => {
  const db = configTables({
    ai_provider_key_models: [
      { id: "target-a", key_id: "key-1", model_id: "target-model", is_enabled: true },
      { id: "target-b", key_id: "key-2", model_id: "target-model", is_enabled: true },
      { id: "backup-row", key_id: "key-1", model_id: "backup-model", is_enabled: true },
    ],
    ai_provider_keys: [
      { id: "key-1", provider_id: "provider-1", label: "key-1", api_key: "secret", priority: 1, is_enabled: true },
      { id: "key-2", provider_id: "provider-1", label: "key-2", api_key: "secret", priority: 2, is_enabled: true },
    ],
  }, { failUpdateAfterMutation: "ai_provider_key_models" });

  const before = db.tables.ai_provider_key_models.map((row) => ({ id: row.id, is_enabled: row.is_enabled }));
  const response = await buildAiConfigResponse(request({
    action: "set_global_model_shelf_state",
    data: { modelId: "target-model", is_enabled: false },
  }), actor(db));

  assert.equal(response.status, 400);
  assert.deepEqual(db.tables.ai_provider_key_models.map((row) => ({ id: row.id, is_enabled: row.is_enabled })), before);
});

test("S2 下架目标模型后运行时顺位切到健康备用渠道", async () => {
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

test("B4 删除服务商时独占业务绑定返回 409 且资产保持不变", async () => {
  const db = configTables({
    ai_provider_key_models: [{ id: "model-row", key_id: "key-1", model_id: "model-a", is_enabled: true }],
    ai_feature_bindings: [{ id: "binding-1", feature_key: "feature-a", label: "功能 A", model_id: "model-a", provider_key_model_id: "model-row", is_enabled: true, lifecycle_state: "active" }],
  });

  const response = await buildAiConfigResponse(request({ action: "delete", entity: "provider", data: { id: "provider-1" } }), actor(db));
  assert.equal(response.status, 409);
  assert.match((await response.json()).error, /功能 A/);
  assert.equal(db.tables.ai_providers.length, 1);
  assert.equal(db.tables.ai_provider_keys.length, 1);
  assert.equal(db.tables.ai_provider_key_models.length, 1);
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

test("C-R1 全站下架后新增渠道勾选模型不得复活全站供给", async () => {
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
    assert.equal(newModel?.global_is_enabled, false);

    const availability = computeAvailability({
      providers: [{ id: "provider-1", name: "Provider 1", is_enabled: true }],
      keys: [{ id: newKey.id as string, provider_id: "provider-1", label: "new-key-after-shelf", is_enabled: true, consecutive_failures: 0, last_success_at: new Date().toISOString() }],
      models: [{ id: newModel?.id as string, key_id: newKey.id as string, model_id: "shelved-model", is_enabled: true, global_is_enabled: newModel?.global_is_enabled as boolean }],
      featureControls: [{ key: "content_tools", label: "内容工具", group: "business", isEnabled: true, lifecycleState: "active", modelId: "shelved-model", providerKeyModelId: null }],
      defaultBinding: null,
    });
    assert.equal(availability.modelFamilies.find((family) => family.modelId === "shelved-model")?.schedulableChannelCount, 0);
    assert.equal(availability.businessAssurances.find((item) => item.key === "content_tools")?.status, "outage");
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

test("B8 全池连通测试按 Key 返回成功、失败与超时的真实结果层级", async () => {
  const db = configTables({
    ai_provider_keys: [
      { id: "key-success", provider_id: "provider-1", label: "成功 Key", api_key: "success-secret", priority: 1, is_enabled: true },
      { id: "key-failure", provider_id: "provider-1", label: "失败 Key", api_key: "failure-secret", priority: 2, is_enabled: true },
      { id: "key-timeout", provider_id: "provider-1", label: "超时 Key", api_key: "timeout-secret", priority: 3, is_enabled: true },
    ],
  });
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (_input, init) => {
    const authorization = new Headers(init?.headers).get("authorization");
    if (authorization?.includes("failure-secret")) return new Response("bad", { status: 500 });
    if (authorization?.includes("timeout-secret")) throw new Error("模拟超时");
    return new Response("ok", { status: 200 });
  };

  try {
    const response = await buildAiConfigResponse(request({ action: "test_all_keys" }), actor(db));
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.total, 3);
    assert.deepEqual(body.results.map((result: Record<string, unknown>) => ({
      keyId: result.keyId,
      keyName: result.keyName,
      ok: result.ok,
      error: result.error ?? null,
      latencyIsNull: result.latencyMs === null,
    })), [
      { keyId: "key-success", keyName: "成功 Key", ok: true, error: null, latencyIsNull: false },
      { keyId: "key-failure", keyName: "失败 Key", ok: false, error: "HTTP 500: bad", latencyIsNull: true },
      { keyId: "key-timeout", keyName: "超时 Key", ok: false, error: "模拟超时", latencyIsNull: true },
    ]);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("B9 test_key_model 只写模型级成功状态，不把模型成功误写成 Key 成功", async () => {
  const db = configTables({
    ai_provider_keys: [{
      id: "key-1",
      provider_id: "provider-1",
      label: "测试 Key",
      api_key: "model-secret",
      priority: 1,
      is_enabled: true,
    }],
    ai_provider_key_models: [{
      id: "model-row",
      key_id: "key-1",
      model_id: "model-a",
      is_enabled: true,
    }],
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
    assert.equal(db.tables.ai_provider_key_models[0].last_success_at !== undefined, true);
    assert.equal(db.tables.ai_provider_keys[0].last_success_at !== undefined, true);
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

test("test_all_keys_all_models 会统计全部渠道和挂载模型并列出可读失败", async () => {
  const db = configTables({
    ai_provider_keys: [
      { id: "key-1", provider_id: "provider-1", label: "渠道一", api_key: "secret-1", priority: 1, is_enabled: true },
      { id: "key-2", provider_id: "provider-1", label: "渠道二", api_key: "secret-2", priority: 2, is_enabled: false },
    ],
    ai_provider_key_models: [
      { id: "model-good-row", key_id: "key-1", model_id: "model-good", is_enabled: true },
      { id: "model-fail-row", key_id: "key-2", model_id: "model-fail", is_enabled: true },
      { id: "model-other-row", key_id: "key-2", model_id: "model-other", is_enabled: true },
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
    const response = await buildAiConfigResponse(request({ action: "test_all_keys_all_models" }), actor(db));
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.totalKeys, 2);
    assert.equal(body.totalModels, 1);
    assert.equal(body.successCount, 1);
    assert.equal(body.failureCount, 0);
    assert.deepEqual(body.failures, []);
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

test("C1 依赖名单不完整时危险动作默认拒绝且不写入", async () => {
  const db = configTables({
    ai_provider_keys: [{ id: "key-1", provider_id: "provider-1", label: "api1 default", api_key: "secret", priority: 1, is_enabled: true, available_models: [] }],
    ai_provider_key_models: [{ id: "model-row", key_id: "key-1", model_id: "model-a", is_enabled: true }],
  });
  const response = await buildAiConfigResponse(request({
    action: "update",
    entity: "key",
    data: { id: "key-1", is_enabled: false },
  }), actor(db));
  assert.equal(response.status, 409);
  assert.match((await response.json()).error, /从未成功同步|空清单/);
  assert.equal(db.tables.ai_provider_keys[0].is_enabled, true);
});

test("C1 跨渠道批量启用在供给未知时也必须先拒绝", async () => {
  const db = configTables({
    ai_provider_keys: [{ id: "key-1", provider_id: "provider-1", label: "api1 default", api_key: "secret", priority: 1, is_enabled: true, available_models: [] }],
    ai_provider_key_models: [{ id: "model-row", key_id: "key-1", model_id: "model-a", is_enabled: false }],
  });
  const response = await buildAiConfigResponse(request({
    action: "set_key_model_selection",
    data: { key_id: "key-1", model_ids: ["model-a"] },
  }), actor(db));
  assert.equal(response.status, 409);
  assert.match((await response.json()).error, /从未成功同步|空清单/);
  assert.equal(db.tables.ai_provider_key_models[0].is_enabled, false);
});

test("C2 全站下架再上架只改全站状态，逐条渠道状态原样保留", async () => {
  const db = configTables({
    ai_provider_key_models: [
      { id: "model-on", key_id: "key-1", model_id: "model-a", is_enabled: true, global_is_enabled: true },
      { id: "model-off", key_id: "key-1", model_id: "model-a", is_enabled: false, global_is_enabled: true },
    ],
  });
  const before = db.tables.ai_provider_key_models.map((row) => ({ id: row.id, is_enabled: row.is_enabled }));
  for (const isEnabled of [false, true]) {
    const response = await buildAiConfigResponse(request({
      action: "set_global_model_shelf_state",
      data: { modelId: "model-a", is_enabled: isEnabled },
    }), actor(db));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).shelfResult.channelStatesUnchanged, true);
  }
  assert.deepEqual(db.tables.ai_provider_key_models.map((row) => ({ id: row.id, is_enabled: row.is_enabled })), before);
  assert.deepEqual(db.tables.ai_provider_key_models.map((row) => row.global_is_enabled), [true, true]);
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

test("C8 全池没有可检测模型时返回 0/0 且 allPassed=false", async () => {
  const db = configTables();
  const response = await buildAiConfigResponse(request({ action: "test_all_keys_all_models" }), actor(db));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.totalModels, 0);
  assert.equal(body.successCount, 0);
  assert.equal(body.failureCount, 0);
  assert.equal(body.emptyResult, true);
  assert.equal(body.allPassed, false);
});
