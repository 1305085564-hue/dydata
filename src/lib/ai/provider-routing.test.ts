import test from "node:test";
import assert from "node:assert/strict";

import {
  listRankedProviderKeyModels,
  getProviderKeyModelConfig,
  selectHealthyProviderKeyModel,
} from "./provider-routing";

type Row = Record<string, unknown>;

class FakeQuery implements PromiseLike<{ data: unknown; error: { message: string } | null }> {
  private filters: Array<(row: Row) => boolean> = [];
  private singleMode: "many" | "maybeSingle" = "many";

  constructor(private readonly rows: Row[]) {}

  select() {
    return this;
  }

  eq(field: string, value: unknown) {
    this.filters.push((row) => row[field] === value);
    return this;
  }

  maybeSingle() {
    this.singleMode = "maybeSingle";
    return this;
  }

  then<TResult1 = { data: unknown; error: { message: string } | null }, TResult2 = never>(
    onfulfilled?:
      | ((value: { data: unknown; error: { message: string } | null }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    const data = this.rows.filter((row) => this.filters.every((filter) => filter(row)));
    const result =
      this.singleMode === "maybeSingle"
        ? { data: data[0] ?? null, error: null }
        : { data, error: null };
    return Promise.resolve(result).then(onfulfilled, onrejected);
  }
}

function createFakeService(rows: Row[]) {
  return {
    from(table: string) {
      assert.equal(table, "ai_provider_key_models");
      return new FakeQuery(rows);
    },
  };
}

function providerRow(input: {
  id: string;
  modelId: string;
  keyPriority: number;
  providerPriority?: number;
  providerEnabled?: boolean;
  consecutiveFailures?: number;
  unhealthyUntil?: string | null;
}) {
  return {
    id: input.id,
    model_id: input.modelId,
    is_enabled: true,
    consecutive_failures: input.consecutiveFailures ?? 0,
    unhealthy_until: input.unhealthyUntil ?? null,
    key: {
      id: `key-${input.id}`,
      api_key: `secret-${input.id}`,
      is_enabled: true,
      priority: input.keyPriority,
      consecutive_failures: input.consecutiveFailures ?? 0,
      unhealthy_until: input.unhealthyUntil ?? null,
      provider: {
        id: `provider-${input.id}`,
        name: `provider-${input.id}`,
        base_url: `https://provider-${input.id}.test`,
        priority: input.providerPriority ?? 100,
        is_enabled: input.providerEnabled ?? true,
      },
    },
  };
}

test("getProviderKeyModelConfig returns null for unhealthy key model", async () => {
  const service = createFakeService([
    providerRow({
      id: "pkm-1",
      modelId: "claude-sonnet-4-6",
      keyPriority: 10,
      consecutiveFailures: 3,
      unhealthyUntil: new Date(Date.now() + 60_000).toISOString(),
    }),
  ]);

  const config = await getProviderKeyModelConfig(service as never, "pkm-1");
  assert.equal(config, null);
});

test("selectHealthyProviderKeyModel orders by model sort_order then id, ignoring channel priorities", async () => {
  const service = createFakeService([
    { ...providerRow({ id: "pkm-priority-first", modelId: "claude-sonnet-4-6", keyPriority: 1, providerPriority: 1 }), sort_order: 9 },
    { ...providerRow({ id: "pkm-b", modelId: "claude-sonnet-4-6", keyPriority: 100, providerPriority: 100 }), sort_order: 1 },
    { ...providerRow({ id: "pkm-a", modelId: "claude-sonnet-4-6", keyPriority: 100, providerPriority: 100 }), sort_order: 1 },
    providerRow({ id: "pkm-other", modelId: "other-model", keyPriority: 1 }),
  ]);

  const selected = await selectHealthyProviderKeyModel(service as never, "claude-sonnet-4-6");
  assert.equal(selected?.providerKeyModelId, "pkm-a");
  assert.equal(selected?.config.baseUrl, "https://provider-pkm-a.test");
});

test("停用供应商后调度器不会选择其仍启用的 Key 模型", async () => {
  const service = createFakeService([
    providerRow({ id: "pkm-disabled-provider", modelId: "target-model", keyPriority: 1, providerEnabled: false }),
  ]);

  const selected = await selectHealthyProviderKeyModel(service as never, "target-model");
  assert.equal(selected, null);
});

test("模型级熔断只排除当前模型，不影响同一 Key 下的其他模型", async () => {
  const healthy = providerRow({ id: "pkm-model-healthy", modelId: "model-healthy", keyPriority: 1 });
  const unhealthy = providerRow({ id: "pkm-model-unhealthy", modelId: "model-unhealthy", keyPriority: 1 });
  (healthy.key as Row).id = "shared-key";
  (unhealthy.key as Row).id = "shared-key";
  unhealthy.consecutive_failures = 3;
  unhealthy.unhealthy_until = new Date(Date.now() + 60_000).toISOString();

  const service = createFakeService([healthy, unhealthy]);
  const selectedHealthy = await selectHealthyProviderKeyModel(service as never, "model-healthy");
  const selectedUnhealthy = await selectHealthyProviderKeyModel(service as never, "model-unhealthy");

  assert.equal(selectedHealthy?.providerKeyModelId, "pkm-model-healthy");
  assert.equal(selectedUnhealthy, null);
});

test("model-local routing order follows sort_order then id", async () => {
  const first = { ...providerRow({ id: "a", modelId: "model-a", keyPriority: 1 }), sort_order: 2 };
  const second = { ...providerRow({ id: "b", modelId: "model-a", keyPriority: 100 }), sort_order: 1 };
  const tied = { ...providerRow({ id: "aa", modelId: "model-a", keyPriority: 200 }), sort_order: 1 };
  const service = createFakeService([first, second, tied]);
  assert.deepEqual((await listRankedProviderKeyModels(service, "model-a")).map((item) => item.providerKeyModelId), ["aa", "b", "a"]);
});

test("manual sleep and permanent failure exclude mounted models from production candidates", async () => {
  const manual = providerRow({ id: "manual", modelId: "model-a", keyPriority: 1 });
  const invalid = { ...providerRow({ id: "invalid", modelId: "model-a", keyPriority: 2 }), invalidated_at: new Date().toISOString() };
  (manual.key as Row).unhealthy_until = new Date(Date.now() + 60_000).toISOString();
  assert.deepEqual(await listRankedProviderKeyModels(createFakeService([manual, invalid]), "model-a"), []);
});
