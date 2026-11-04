import test from "node:test";
import assert from "node:assert/strict";

import {
  listRankedProviderKeyModels,
  getProviderKeyModelConfig,
  getProviderKeyHealthStatus,
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

test("provider key health status keeps untested keys out of the healthy state", () => {
  assert.equal(getProviderKeyHealthStatus({ isEnabled: true }), "untested");
});

test("provider key health status marks a single failed test as unhealthy", () => {
  const now = Date.parse("2026-07-31T12:00:00.000Z");

  assert.equal(getProviderKeyHealthStatus({
    isEnabled: true,
    lastFailureAt: "2026-07-31T11:59:00.000Z",
    now,
  }), "unhealthy");
});

test("provider key health status becomes healthy only after a later successful test", () => {
  const now = Date.parse("2026-07-31T12:00:00.000Z");

  assert.equal(getProviderKeyHealthStatus({
    isEnabled: true,
    lastFailureAt: "2026-07-31T11:59:00.000Z",
    lastSuccessAt: "2026-07-31T12:00:00.000Z",
    now,
  }), "healthy");
});

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

test("selectHealthyProviderKeyModel selects the lowest priority healthy candidate", async () => {
  const service = createFakeService([
    providerRow({ id: "pkm-slow", modelId: "claude-sonnet-4-6", keyPriority: 50 }),
    providerRow({ id: "pkm-fast", modelId: "claude-sonnet-4-6", keyPriority: 10 }),
    providerRow({ id: "pkm-other", modelId: "other-model", keyPriority: 1 }),
  ]);

  const selected = await selectHealthyProviderKeyModel(service as never, "claude-sonnet-4-6");
  assert.equal(selected?.providerKeyModelId, "pkm-fast");
  assert.equal(selected?.config.baseUrl, "https://provider-pkm-fast.test");
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

test("model-local order applies to selected-model and full fallback chains", async () => {
  const first = { ...providerRow({ id: "a", modelId: "model-a", keyPriority: 1 }), sort_order: 2 };
  const second = { ...providerRow({ id: "b", modelId: "model-a", keyPriority: 100 }), sort_order: 1 };
  const other = { ...providerRow({ id: "c", modelId: "model-b", keyPriority: 2 }), sort_order: 1 };
  const service = createFakeService([first, second, other]);
  assert.deepEqual((await listRankedProviderKeyModels(service, "model-a")).map((item) => item.providerKeyModelId), ["b", "a"]);
  assert.deepEqual((await listRankedProviderKeyModels(service)).map((item) => item.providerKeyModelId), ["b", "c", "a"]);
});

test("manual sleep and permanent failure exclude mounted models from production candidates", async () => {
  const manual = providerRow({ id: "manual", modelId: "model-a", keyPriority: 1 });
  const invalid = { ...providerRow({ id: "invalid", modelId: "model-a", keyPriority: 2 }), invalidated_at: new Date().toISOString() };
  (manual.key as Row).manual_sleep_until = new Date(Date.now() + 60_000).toISOString();
  assert.deepEqual(await listRankedProviderKeyModels(createFakeService([manual, invalid]), "model-a"), []);
});


test("全量兜底保留跨模型位置并尊重每个模型的独立顺位", async () => {
  const rows = [
    { ...providerRow({ id: "a1", modelId: "a", keyPriority: 1 }), sort_order: 2 },
    { ...providerRow({ id: "b1", modelId: "b", keyPriority: 2 }), sort_order: 1 },
    { ...providerRow({ id: "a2", modelId: "a", keyPriority: 3 }), sort_order: 1 },
    { ...providerRow({ id: "b2", modelId: "b", keyPriority: 4 }), sort_order: 2 },
  ];
  const ranked = await listRankedProviderKeyModels(createFakeService(rows));
  assert.deepEqual(ranked.map((r) => r.providerKeyModelId), ["a2", "b1", "a1", "b2"]);
});
