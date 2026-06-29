import test from "node:test";
import assert from "node:assert/strict";

import {
  getProviderKeyModelConfig,
  isProviderKeyHealthy,
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
  consecutiveFailures?: number;
  unhealthyUntil?: string | null;
}) {
  return {
    id: input.id,
    model_id: input.modelId,
    is_enabled: true,
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
        is_enabled: true,
      },
    },
  };
}

test("isProviderKeyHealthy skips keys that are still in circuit breaker window", () => {
  assert.equal(isProviderKeyHealthy({
    isEnabled: true,
    consecutiveFailures: 3,
    unhealthyUntil: new Date(Date.now() + 60_000).toISOString(),
  }), false);

  assert.equal(isProviderKeyHealthy({
    isEnabled: true,
    consecutiveFailures: 3,
    unhealthyUntil: new Date(Date.now() - 60_000).toISOString(),
  }), true);
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
