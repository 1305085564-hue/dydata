import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { buildSyncModelsResponse, cleanupStaleModelsForKey, syncModelsForKey } from "./route";

type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;

class FakeQuery implements PromiseLike<{ data: unknown; error: null }> {
  private operation: "select" | "insert" | "update" | "delete" = "select";
  private payload: Row | Row[] = {};
  private filters: Array<(row: Row) => boolean> = [];
  private one = false;
  private returning = false;
  private rowLimit = Number.POSITIVE_INFINITY;

  constructor(
    private readonly tables: Tables,
    private readonly table: string,
    private readonly beforeExecute?: (table: string, operation: string) => void,
  ) {}

  select() {
    if (this.operation === "select") return this;
    this.returning = true;
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

  in(field: string, values: unknown[]) {
    this.filters.push((row) => values.includes(row[field]));
    return this;
  }

  limit(value: number) {
    this.rowLimit = value;
    return this;
  }

  single() {
    this.one = true;
    return this;
  }

  then<TResult1 = { data: unknown; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    try {
      this.beforeExecute?.(this.table, this.operation);
      const rows = this.tables[this.table] ?? (this.tables[this.table] = []);
      const matches = rows.filter((row) => this.filters.every((filter) => filter(row))).slice(0, this.rowLimit);
      let data: unknown;
      if (this.operation === "select") {
        data = this.one ? matches[0] ?? null : matches;
      } else if (this.operation === "insert") {
        const inserted = (Array.isArray(this.payload) ? this.payload : [this.payload]).map((row, index) => ({
          ...row,
          id: row.id ?? `${this.table}-inserted-${index}`,
        }));
        rows.push(...inserted);
        data = inserted;
      } else if (this.operation === "update") {
        for (const row of matches) Object.assign(row, this.payload);
        data = this.returning ? matches : null;
      } else {
        const removed = new Set(matches);
        this.tables[this.table] = rows.filter((row) => !removed.has(row));
        data = this.returning ? matches : null;
      }
      return Promise.resolve({ data, error: null }).then(onfulfilled, onrejected);
    } catch (error) {
      return Promise.reject(error).then(onfulfilled, onrejected);
    }
  }
}

function fakeSupabase(tables: Tables, beforeExecute?: (table: string, operation: string) => void) {
  const rpcCalls: Array<{ name: string; parameters: Record<string, unknown> }> = [];
  return {
    rpcCalls,
    from: (table: string) => new FakeQuery(tables, table, beforeExecute),
    async rpc(name: string, parameters: Record<string, unknown>) {
      rpcCalls.push({ name, parameters });
      if (name !== "sync_ai_config_models") return { data: null, error: { message: `unexpected RPC ${name}` } };
      const keyId = String(parameters.p_key_id);
      const key = tables.ai_provider_keys?.find((row) => row.id === keyId);
      if (!key) return { data: null, error: { message: "key missing" } };
      const modelIds = (parameters.p_available_models ?? []) as string[];
      const models = (parameters.p_models ?? []) as Array<{ model_id: string; display_name: string }>;
      const verified = parameters.p_verified === true;
      key.available_models = modelIds;
      if (verified) {
        key.invalidated_at = null;
        key.unhealthy_until = null;
      }
      for (const model of models) {
        let existing = tables.ai_provider_key_models?.find((row) => row.key_id === keyId && row.model_id === model.model_id);
        if (!existing) {
          existing = {
            id: `rpc-created-${tables.ai_provider_key_models?.length ?? 0}`,
            key_id: keyId,
            model_id: model.model_id,
            display_name: model.display_name,
            is_enabled: false,
          };
          (tables.ai_provider_key_models ?? (tables.ai_provider_key_models = [])).push(existing);
        } else if (existing.display_name === model.model_id) {
          existing.display_name = model.display_name;
        }
        if (verified && modelIds.includes(model.model_id)) {
          existing.invalidated_at = null;
          existing.unhealthy_until = null;
        }
      }
      return { data: null, error: null };
    },
  };
}

test("服务端真实同步可解除永久封禁，但不伪造成功或清除失败计数", async () => {
  const priorSuccessAt = "2026-11-04T10:00:00.000Z";
  const tables: Tables = {
    ai_provider_keys: [{
      id: "key-verified",
      api_key: "test-only",
      provider_id: "provider-1",
      provider: { name: "provider", base_url: "https://provider.test/v1" },
      invalidated_at: "2026-11-05T01:00:00.000Z",
      unhealthy_until: "2026-11-05T02:00:00.000Z",
      consecutive_failures: 4,
      last_success_at: priorSuccessAt,
    }],
    ai_provider_key_models: [{
      id: "model-verified",
      key_id: "key-verified",
      model_id: "model-returned-by-upstream",
      display_name: "model-returned-by-upstream",
      is_enabled: true,
      invalidated_at: "2026-11-05T01:00:00.000Z",
      unhealthy_until: "2026-11-05T02:00:00.000Z",
      consecutive_failures: 7,
      last_success_at: priorSuccessAt,
    }],
  };
  const db = fakeSupabase(tables);
  const result = await syncModelsForKey(db as never, { keyId: "key-verified" }, async (input) => {
    assert.equal(String(input), "https://provider.test/v1/models");
    return Response.json({ data: [{ id: "model-returned-by-upstream" }, { id: "new-model" }] });
  });

  assert.equal(db.rpcCalls.length, 1);
  assert.equal(db.rpcCalls[0]?.name, "sync_ai_config_models");
  assert.equal(db.rpcCalls[0]?.parameters.p_verified, true);
  assert.deepEqual(db.rpcCalls[0]?.parameters.p_available_models, ["model-returned-by-upstream", "new-model"]);
  assert.deepEqual((db.rpcCalls[0]?.parameters.p_models as Array<{ model_id: string }>).map((model) => model.model_id), [
    "model-returned-by-upstream", "new-model",
  ]);
  assert.equal(tables.ai_provider_keys[0]?.invalidated_at, null);
  assert.equal(tables.ai_provider_keys[0]?.unhealthy_until, null);
  assert.equal(tables.ai_provider_keys[0]?.consecutive_failures, 4);
  assert.equal(tables.ai_provider_keys[0]?.last_success_at, priorSuccessAt);
  assert.equal(tables.ai_provider_key_models[0]?.invalidated_at, null);
  assert.equal(tables.ai_provider_key_models[0]?.unhealthy_until, null);
  assert.equal(tables.ai_provider_key_models[0]?.consecutive_failures, 7);
  assert.equal(tables.ai_provider_key_models[0]?.last_success_at, priorSuccessAt);
  assert.equal(tables.ai_provider_key_models[1]?.is_enabled, false);
  assert.equal(result.allModels.find((model) => model.modelId === "new-model")?.isEnabled, false);
});

test("客户端提供的模型清单不会解除永久封禁", async () => {
  const timestamp = "2026-11-05T01:00:00.000Z";
  const tables: Tables = {
    ai_provider_keys: [{
      id: "key-client-list",
      api_key: "test-only",
      provider_id: "provider-1",
      provider: { name: "provider", base_url: "https://provider.test/v1" },
      invalidated_at: timestamp,
      unhealthy_until: timestamp,
      consecutive_failures: 4,
    }],
    ai_provider_key_models: [{
      id: "model-client-list",
      key_id: "key-client-list",
      model_id: "client-model",
      display_name: "client-model",
      is_enabled: true,
      invalidated_at: timestamp,
      unhealthy_until: timestamp,
    }],
  };
  const db = fakeSupabase(tables);
  const result = await syncModelsForKey(db as never, { keyId: "key-client-list", modelIds: ["client-model", "new-client-model"] }, async () => {
    throw new Error("客户端清单不能触发上游发现");
  });

  assert.equal(db.rpcCalls[0]?.parameters.p_verified, false);
  assert.equal(tables.ai_provider_keys[0]?.invalidated_at, timestamp);
  assert.equal(tables.ai_provider_keys[0]?.unhealthy_until, timestamp);
  assert.equal(tables.ai_provider_keys[0]?.consecutive_failures, 4);
  assert.equal(tables.ai_provider_key_models[0]?.invalidated_at, timestamp);
  assert.equal(tables.ai_provider_key_models[0]?.unhealthy_until, timestamp);
  assert.equal(tables.ai_provider_key_models[1]?.is_enabled, false);
  assert.equal(result.allModels.find((model) => model.modelId === "new-client-model")?.isEnabled, false);
});

test("同步鉴权通过后使用注入的服务端客户端，拒绝时不创建服务端客户端", async () => {
  const serviceTables: Tables = {
    ai_provider_keys: [{
      id: "key-service",
      api_key: "test-only",
      provider_id: "provider-1",
      provider: { name: "provider", base_url: "https://provider.test/v1" },
    }],
    ai_provider_key_models: [],
  };
  const serviceDb = fakeSupabase(serviceTables);
  const userDb = fakeSupabase({ ai_provider_keys: [], ai_provider_key_models: [] });
  let serviceClientCalls = 0;
  const request = new NextRequest("http://localhost/api/admin/ai-config/sync-models", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ keyId: "key-service", modelIds: ["client-model"] }),
  });
  const response = await buildSyncModelsResponse(request, {
    requireSystemActor: async () => ({ supabase: userDb as never, actor: { userId: "test", role: "owner" } as never }),
    createAdminClient: () => {
      serviceClientCalls += 1;
      return serviceDb as never;
    },
  });
  assert.equal(response.status, 200);
  assert.equal(serviceClientCalls, 1);
  assert.equal(serviceDb.rpcCalls.length, 1);
  assert.equal(userDb.rpcCalls.length, 0);

  let deniedServiceClientCalls = 0;
  const deniedResponse = await buildSyncModelsResponse(request, {
    requireSystemActor: async () => ({ error: "forbidden", status: 403 } as never),
    createAdminClient: () => {
      deniedServiceClientCalls += 1;
      return serviceDb as never;
    },
  });
  assert.equal(deniedResponse.status, 403);
  assert.equal(deniedServiceClientCalls, 0);
});

test("同步按真实 model_id 返回别名展示组，自动名可更新而人工名保留", async () => {
  const tables: Tables = {
    ai_provider_keys: [{
      id: "key-1",
      api_key: "test-only",
      provider_id: "provider-1",
      provider: { name: "provider", base_url: "https://provider.test/v1" },
    }],
    ai_provider_key_models: [
      { id: "raw", key_id: "key-1", model_id: "claude-haiku-5-5", display_name: "claude-haiku-5-5", is_enabled: false },
      { id: "custom", key_id: "key-1", model_id: "claude-haiku-5.5", display_name: "人工名", is_enabled: false },
    ],
    ai_provider_keys_cache: [],
  };

  const result = await syncModelsForKey(fakeSupabase(tables) as never, {
    keyId: "key-1",
    modelIds: ["claude-haiku-5-5", "claude-haiku-5.5"],
  }, async () => {
    throw new Error("同步现有模型不应请求上游");
  });

  assert.deepEqual(tables.ai_provider_key_models.map((row) => row.display_name), ["Claude Haiku 5.5", "人工名"]);
  assert.deepEqual(result.allModels.map((row) => row.modelId), ["claude-haiku-5-5", "claude-haiku-5.5"]);
  assert.deepEqual(result.modelGroups, [{
    displayName: "Claude Haiku 5.5",
    recommendedModelId: "claude-haiku-5-5",
    modelIds: ["claude-haiku-5-5", "claude-haiku-5.5"],
  }]);
});

test("同步将 429 和参数错误保留为未知，不标为上游已下线", async () => {
  const tables: Tables = {
    ai_provider_keys: [{
      id: "key-1",
      api_key: "test-only",
      provider_id: "provider-1",
      provider: { name: "provider", base_url: "https://provider.test/v1" },
    }],
    ai_provider_key_models: [{ id: "stale", key_id: "key-1", model_id: "model-stale", display_name: "Model", is_enabled: false }],
  };
  const result = await syncModelsForKey(fakeSupabase(tables) as never, { keyId: "key-1", modelIds: ["model-live"] }, async () => (
    new Response(JSON.stringify({ error: { message: "invalid model parameter" } }), { status: 429 })
  ));

  assert.deepEqual(result.reconciliation.verifiedUnavailableModelIds, []);
  assert.deepEqual(result.reconciliation.unknownModelIds, ["model-stale"]);
  assert.equal(result.reconciliation.status, "unknown");
});

test("陈旧清理只删已关闭、无业务引用且复验明确不存在的模型", async () => {
  const tables: Tables = {
    ai_provider_keys: [{
      id: "key-1",
      api_key: "test-only",
      provider_id: "provider-1",
      provider: { name: "provider", base_url: "https://provider.test/v1" },
    }],
    ai_provider_key_models: [
      { id: "dead", key_id: "key-1", model_id: "model-dead", is_enabled: false },
      { id: "enabled", key_id: "key-1", model_id: "model-enabled", is_enabled: true },
      { id: "referenced", key_id: "key-1", model_id: "model-referenced", is_enabled: false },
      { id: "available", key_id: "key-1", model_id: "model-available", is_enabled: false },
      { id: "limited", key_id: "key-1", model_id: "model-limited", is_enabled: false },
    ],
    ai_feature_bindings: [{ id: "binding", model_id: "model-referenced" }],
  };
  const fetcher = async (_input: RequestInfo | URL, init?: RequestInit) => {
    const modelId = (JSON.parse(String(init?.body ?? "{}")) as { model: string }).model;
    if (modelId === "model-dead" || modelId === "model-enabled" || modelId === "model-referenced") {
      return new Response("model_not_found", { status: 404 });
    }
    if (modelId === "model-available") return new Response("{}", { status: 200 });
    return new Response("rate limit", { status: 429 });
  };

  const results = await cleanupStaleModelsForKey(fakeSupabase(tables) as never, {
    keyId: "key-1",
    modelIds: ["model-dead", "model-enabled", "model-referenced", "model-available", "model-limited"],
  }, fetcher);

  assert.deepEqual(results.map(({ modelId, status }) => ({ modelId, status })), [
    { modelId: "model-dead", status: "removed" },
    { modelId: "model-enabled", status: "still_enabled" },
    { modelId: "model-referenced", status: "business_referenced" },
    { modelId: "model-available", status: "still_available" },
    { modelId: "model-limited", status: "unknown" },
  ]);
  assert.deepEqual(tables.ai_provider_key_models.map((row) => row.model_id), [
    "model-enabled", "model-referenced", "model-available", "model-limited",
  ]);
});

test("上游复验期间新出现业务引用时，服务端二次检查会阻止删除", async () => {
  const tables: Tables = {
    ai_provider_keys: [{
      id: "key-1",
      api_key: "test-only",
      provider_id: "provider-1",
      provider: { name: "provider", base_url: "https://provider.test/v1" },
    }],
    ai_provider_key_models: [{ id: "race", key_id: "key-1", model_id: "model-race", is_enabled: false }],
    ai_feature_bindings: [],
  };
  let bindingChecks = 0;
  const db = fakeSupabase(tables, (table, operation) => {
    if (table === "ai_feature_bindings" && operation === "select" && ++bindingChecks === 2) {
      tables.ai_feature_bindings.push({ id: "new-binding", model_id: "model-race" });
    }
  });

  const results = await cleanupStaleModelsForKey(db as never, { keyId: "key-1", modelIds: ["model-race"] }, async () => (
    new Response("model_not_found", { status: 404 })
  ));

  assert.deepEqual(results, [{ modelId: "model-race", status: "business_referenced" }]);
  assert.equal(tables.ai_provider_key_models.length, 1);
});
