import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { buildSyncModelsResponse, syncModelsForKey } from "./route";

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
      }
      if (verified && modelIds.length > 0) {
        tables.ai_provider_key_models = (tables.ai_provider_key_models ?? []).filter((row) => (
          !(row.key_id === keyId && !modelIds.includes(String(row.model_id)))
        ));
      }
      return { data: null, error: null };
    },
  };
}

test("服务端真实同步只对齐清单，不解除永久封禁或清冷却", async () => {
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
  assert.equal(tables.ai_provider_keys[0]?.invalidated_at, "2026-11-05T01:00:00.000Z");
  assert.equal(tables.ai_provider_keys[0]?.unhealthy_until, "2026-11-05T02:00:00.000Z");
  assert.equal(tables.ai_provider_keys[0]?.consecutive_failures, 4);
  assert.equal(tables.ai_provider_keys[0]?.last_success_at, priorSuccessAt);
  assert.equal(tables.ai_provider_key_models[0]?.invalidated_at, "2026-11-05T01:00:00.000Z");
  assert.equal(tables.ai_provider_key_models[0]?.unhealthy_until, "2026-11-05T02:00:00.000Z");
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

test("服务端真实同步按上游清单撤下旧记录，并如实报告撤下数量", async () => {
  const tables: Tables = {
    ai_provider_keys: [{
      id: "key-1",
      api_key: "test-only",
      provider_id: "provider-1",
      provider: { name: "provider", base_url: "https://provider.test/v1" },
    }],
    ai_provider_key_models: [
      { id: "live", key_id: "key-1", model_id: "model-live", display_name: "Live", is_enabled: true },
      { id: "ghost-enabled", key_id: "key-1", model_id: "model-ghost-enabled", display_name: "Ghost", is_enabled: true },
      { id: "ghost-disabled", key_id: "key-1", model_id: "model-ghost-disabled", display_name: "Ghost 2", is_enabled: false },
    ],
  };
  const result = await syncModelsForKey(fakeSupabase(tables) as never, { keyId: "key-1" }, async () => (
    Response.json({ data: [{ id: "model-live" }, { id: "model-new" }] })
  ));

  assert.equal(result.removedCount, 2);
  assert.deepEqual(result.removedModelIds, ["model-ghost-enabled", "model-ghost-disabled"]);
  assert.equal(result.removedEnabledCount, 1);
  assert.deepEqual(result.removedEnabledModelIds, ["model-ghost-enabled"]);
  assert.deepEqual(tables.ai_provider_key_models.map((row) => row.model_id), ["model-live", "model-new"]);
  assert.equal(result.allModels.find((model) => model.modelId === "model-new")?.isEnabled, false);
});

test("客户端清单不触发撤下，旧记录保持原样", async () => {
  const tables: Tables = {
    ai_provider_keys: [{
      id: "key-1",
      api_key: "test-only",
      provider_id: "provider-1",
      provider: { name: "provider", base_url: "https://provider.test/v1" },
    }],
    ai_provider_key_models: [
      { id: "old", key_id: "key-1", model_id: "model-old", display_name: "Old", is_enabled: true },
    ],
  };
  const result = await syncModelsForKey(fakeSupabase(tables) as never, {
    keyId: "key-1",
    modelIds: ["model-old", "model-new"],
  }, async () => {
    throw new Error("客户端清单不应请求上游");
  });

  assert.equal(result.removedCount, 0);
  assert.deepEqual(tables.ai_provider_key_models.map((row) => row.model_id), ["model-old", "model-new"]);
});

test("上游清单为空时不撤下任何记录", async () => {
  const tables: Tables = {
    ai_provider_keys: [{
      id: "key-1",
      api_key: "test-only",
      provider_id: "provider-1",
      provider: { name: "provider", base_url: "https://provider.test/v1" },
      unhealthy_until: "2026-11-08T01:00:00.000Z",
      consecutive_failures: 2,
    }],
    ai_provider_key_models: [{ id: "old", key_id: "key-1", model_id: "model-old", display_name: "Old", is_enabled: true, unhealthy_until: "2026-11-08T01:00:00.000Z", consecutive_failures: 1 }],
  };
  await assert.rejects(
    () => syncModelsForKey(fakeSupabase(tables) as never, { keyId: "key-1" }, async () => Response.json({ data: [] })),
    /上游未返回可用模型/,
  );
  assert.deepEqual(tables.ai_provider_key_models.map((row) => row.model_id), ["model-old"]);
  assert.equal(tables.ai_provider_keys[0]?.unhealthy_until, "2026-11-08T01:00:00.000Z");
  assert.equal(tables.ai_provider_keys[0]?.consecutive_failures, 2);
  assert.equal(tables.ai_provider_key_models[0]?.unhealthy_until, "2026-11-08T01:00:00.000Z");
  assert.equal(tables.ai_provider_key_models[0]?.consecutive_failures, 1);
});

test("R2 同步清单不解除调用故障：清单仍含目标时冷却和失效标记保持", async () => {
  const unhealthyUntil = "2026-11-08T01:00:00.000Z";
  const invalidatedAt = "2026-11-07T20:00:00.000Z";
  const tables: Tables = {
    ai_provider_keys: [{
      id: "key-1",
      api_key: "test-only",
      provider_id: "provider-1",
      provider: { name: "provider", base_url: "https://provider.test/v1" },
      invalidated_at: invalidatedAt,
      unhealthy_until: unhealthyUntil,
      consecutive_failures: 3,
      last_error_message: "key failure",
    }],
    ai_provider_key_models: [{
      id: "row-a",
      key_id: "key-1",
      model_id: "model-a",
      display_name: "人工名",
      is_enabled: true,
      sort_order: 7,
      invalidated_at: invalidatedAt,
      unhealthy_until: unhealthyUntil,
      consecutive_failures: 2,
      last_error_message: "model failure",
    }],
  };

  const result = await syncModelsForKey(fakeSupabase(tables) as never, { keyId: "key-1" }, async () => (
    Response.json({ data: [{ id: "model-a" }, { id: "model-new" }] })
  ));

  const key = tables.ai_provider_keys[0]!;
  const row = tables.ai_provider_key_models.find((item) => item.id === "row-a")!;
  assert.equal(result.removedCount, 0);
  assert.equal(key.invalidated_at, invalidatedAt);
  assert.equal(key.unhealthy_until, unhealthyUntil);
  assert.equal(key.consecutive_failures, 3);
  assert.equal(key.last_error_message, "key failure");
  assert.equal(row.invalidated_at, invalidatedAt);
  assert.equal(row.unhealthy_until, unhealthyUntil);
  assert.equal(row.consecutive_failures, 2);
  assert.equal(row.last_error_message, "model failure");
  assert.equal(row.is_enabled, true);
  assert.equal(row.display_name, "人工名");
  assert.equal(row.sort_order, 7);
});

test("R2 上游清单超时或报错时，不删挂载、不动健康", async () => {
  const unhealthyUntil = "2026-11-08T01:00:00.000Z";
  const tables: Tables = {
    ai_provider_keys: [{
      id: "key-1",
      api_key: "test-only",
      provider_id: "provider-1",
      provider: { name: "provider", base_url: "https://provider.test/v1" },
      unhealthy_until: unhealthyUntil,
      consecutive_failures: 2,
    }],
    ai_provider_key_models: [{ id: "row-a", key_id: "key-1", model_id: "model-a", is_enabled: true, unhealthy_until: unhealthyUntil, consecutive_failures: 1 }],
  };
  await assert.rejects(
    () => syncModelsForKey(fakeSupabase(tables) as never, { keyId: "key-1" }, async () => {
      throw new Error("上游请求超时");
    }),
    /探测模型列表失败/,
  );
  assert.equal(tables.ai_provider_keys[0]?.unhealthy_until, unhealthyUntil);
  assert.equal(tables.ai_provider_keys[0]?.consecutive_failures, 2);
  assert.equal(tables.ai_provider_key_models[0]?.unhealthy_until, unhealthyUntil);
  assert.equal(tables.ai_provider_key_models[0]?.consecutive_failures, 1);
  assert.deepEqual(tables.ai_provider_key_models.map((row) => row.model_id), ["model-a"]);
});
