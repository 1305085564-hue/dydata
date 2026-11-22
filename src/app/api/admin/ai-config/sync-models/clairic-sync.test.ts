import assert from "node:assert/strict";
import test from "node:test";
import { syncModelsForKey } from "@/lib/ai-config/sync-models";
import { toCanonicalModelId } from "@/lib/ai-config/canonical-model";

type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;

function fakeClairicSyncDb(tables: Tables) {
  const rpcCalls: Array<{ name: string; parameters: Record<string, unknown> }> = [];
  return {
    rpcCalls,
    from(table: string) {
      const filters: Array<(row: Row) => boolean> = [];
      let single = false;
      const q = {
        select() { return q; },
        eq(field: string, value: unknown) { filters.push((row) => row[field] === value); return q; },
        in(field: string, values: unknown[]) { filters.push((row) => values.includes(row[field])); return q; },
        single() { single = true; return q; },
        then<T1, T2>(
          onfulfilled?: ((v: { data: unknown; error: null }) => T1 | PromiseLike<T1>) | null,
          onrejected?: ((r: unknown) => T2 | PromiseLike<T2>) | null,
        ) {
          const rows = (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
          return Promise.resolve({ data: single ? rows[0] ?? null : rows, error: null }).then(onfulfilled, onrejected);
        },
      };
      return q;
    },
    async rpc(name: string, parameters: Record<string, unknown>) {
      rpcCalls.push({ name, parameters });
      const keyId = String(parameters.p_key_id);
      const key = tables.ai_provider_keys?.find((row) => row.id === keyId);
      if (!key) return { data: null, error: { message: "key missing" } };
      const modelIds = (parameters.p_available_models ?? []) as string[];
      const models = (parameters.p_models ?? []) as Array<{ model_id: string; display_name: string }>;
      key.available_models = modelIds;
      for (const model of models) {
        const canonical = toCanonicalModelId(model.model_id);
        let existing = tables.ai_provider_key_models?.find((r) => r.key_id === keyId && toCanonicalModelId(String(r.model_id)) === canonical);
        if (!existing) {
          existing = { id: `rpc-created-${tables.ai_provider_key_models?.length ?? 0}`, key_id: keyId, model_id: model.model_id, canonical_model_id: canonical, display_name: model.display_name, is_enabled: false };
          (tables.ai_provider_key_models ??= []).push(existing);
        }
      }
      return { data: null, error: null };
    },
  };
}

test("Clairic 协议渠道同步走 probeClairicOcr 探针而非 /models，并保持故障标记不变", async () => {
  const tables: Tables = {
    ai_provider_keys: [{
      id: "key-clairic",
      api_key: "cf-tok",
      provider_id: "provider-cf",
      provider: {
        name: "Cloudflare",
        base_url: "https://api.cloudflare.com/client/v4/accounts/acc-1/ai/run",
        protocol: "cloudflare_clairic",
      },
      unhealthy_until: "2026-11-05T02:00:00.000Z",
      consecutive_failures: 2,
    }],
    ai_provider_key_models: [],
  };
  const db = fakeClairicSyncDb(tables);
  const result = await syncModelsForKey(db as never, { keyId: "key-clairic" }, async (input, init) => {
    assert.equal(
      String(input),
      "https://api.cloudflare.com/client/v4/accounts/acc-1/ai/run/@cf/cloudflare/clairic",
    );
    assert.equal(init?.method, "POST");
    return Response.json({ success: true, result: { answers: { probe_text: { value: null, confidence: 0.99, p_null: 0.99 } } } });
  });

  assert.deepEqual(db.rpcCalls[0]?.parameters.p_available_models, ["@cf/cloudflare/clairic"]);
  assert.equal(tables.ai_provider_key_models[0]?.model_id, "@cf/cloudflare/clairic");
  assert.equal(result.allModels.length, 1);
  assert.equal(result.allModels[0]?.modelId, "clairic");
  assert.equal(result.allModels[0]?.displayName, "Cloudflare Clairic");
  assert.equal(tables.ai_provider_keys[0]?.consecutive_failures, 2);
});
