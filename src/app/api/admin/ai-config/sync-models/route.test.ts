import assert from "node:assert/strict";
import test from "node:test";
import { cleanupStaleModelsForKey, syncModelsForKey } from "./route";

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
  return { from: (table: string) => new FakeQuery(tables, table, beforeExecute) };
}

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
