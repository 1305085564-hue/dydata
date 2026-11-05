import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parse } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { buildAiConfigResponse } from "./route";
import { __internal } from "@/lib/ai/client";

test("第一批真实库：供给独立、模型恢复记忆、四层影响确认与运行解析对账", async t => {
  const env = parse(readFileSync(".env.ai-test.local"));
  assert.match(env.NEXT_PUBLIC_SUPABASE_URL, /^http:\/\/(127\.0\.0\.1|localhost):54321$/);
  const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const provider = randomUUID(), key1 = randomUUID(), key2 = randomUUID();
  const a1 = randomUUID(), a2 = randomUUID(), b = randomUUID(), c = randomUUID();
  const modelA = `plan-a-${a1}`, modelB = `plan-b-${b}`, other = `plan-other-${c}`;
  const previous = await db.from("ai_feature_bindings").select("*").in("feature_key", ["content_tools", "default"]);
  assert.equal(previous.error, null);
  const actor = { createAdminClient: () => db as never, requireSystemActor: async () => ({ supabase: db as never, actor: { userId: env.DYDATA_AI_TEST_USER_ID, role: "owner" } as never }) };
  async function command(action: string, data: Record<string, unknown>, entity?: string) {
    return buildAiConfigResponse(new NextRequest("http://localhost/api/admin/ai-config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, entity, data }) }), actor);
  }
  async function modelRows() {
    const result = await db.from("ai_provider_key_models").select("id,is_enabled,disabled_by_model").in("id", [a1, a2, b, c]).order("id");
    assert.equal(result.error, null); return result.data!;
  }
  try {
    assert.equal((await db.from("ai_providers").insert({ id: provider, name: `plan fixture ${provider}`, base_url: "https://local-fixture.invalid/v1", is_enabled: true })).error, null);
    assert.equal((await db.from("ai_provider_keys").insert([key1, key2].map(id => ({ id, provider_id: provider, label: `plan fixture ${id}`, api_key: "local-only-fixture", is_enabled: true })))).error, null);
    assert.equal((await db.from("ai_provider_key_models").insert([
      { id: a1, key_id: key1, model_id: modelA, is_enabled: true },
      { id: a2, key_id: key2, model_id: modelA, is_enabled: false },
      { id: b, key_id: key2, model_id: modelB, is_enabled: true },
      { id: c, key_id: key1, model_id: other, is_enabled: true },
    ])).error, null);
    assert.equal((await db.from("ai_feature_bindings").upsert([
      { feature_key: "content_tools", label: "内容工具", model_id: modelA, is_enabled: true, lifecycle_state: "active" },
      { feature_key: "default", label: "默认", model_id: modelB, is_enabled: true, lifecycle_state: "active" },
    ], { onConflict: "feature_key" })).error, null);

    await t.test("关闭整渠道再打开不清除原供应勾选", async () => {
      const before = await modelRows();
      assert.equal((await command("update", { id: key1, is_enabled: false }, "key")).status, 200);
      assert.deepEqual(await modelRows(), before);
      assert.equal((await command("update", { id: key1, is_enabled: true }, "key")).status, 200);
      assert.deepEqual(await modelRows(), before);
    });
    await t.test("模型停用恢复只打开曾经开启的供应，业务临时默认顶班", async () => {
      const stopped = await command("set_model_enabled", { model_id: modelA, is_enabled: false });
      assert.equal(stopped.status, 200);
      const body = await stopped.json();
      const business = body.availability.businessAssurances.find((item: { key: string }) => item.key === "content_tools");
      assert.equal(business.routingStatus, "fallback"); assert.equal(business.preferredModelId, modelB);
      assert.equal((await command("set_model_enabled", { model_id: modelA, is_enabled: true })).status, 200);
      const rows = await modelRows();
      assert.equal(rows.find(row => row.id === a1)?.is_enabled, true);
      assert.equal(rows.find(row => row.id === a2)?.is_enabled, false);
      assert.equal(rows.find(row => row.id === a1)?.disabled_by_model, false);
    });
    await t.test("单个供应开关不连坐同渠道其它模型", async () => {
      assert.equal((await command("update", { id: a1, is_enabled: false }, "model")).status, 200);
      assert.equal((await modelRows()).find(row => row.id === c)?.is_enabled, true);
      assert.equal((await command("update", { id: a1, is_enabled: true }, "model")).status, 200);
    });
    await t.test("页面当前优先模型和正式候选一致，不把任意模型当备用", async () => {
      __internal.setServiceClientForTests(db);
      const chain = await __internal.resolveFeatureChannelChainForTests({ featureKey: "content_tools", modelId: modelA, providerKeyModelId: null, systemPrompt: null, isEnabled: true, lifecycleState: "active" });
      assert.deepEqual(chain.map(row => row.model), [modelA, modelB]);
      assert.equal(chain.some(row => row.model === other), false);
      __internal.setServiceClientForTests(null);
    });
    await t.test("接入点、渠道、供应、模型四层都先返回影响名单，确认后允许停摆", async () => {
      assert.equal((await db.from("ai_feature_bindings").update({ model_id: modelA }).eq("feature_key", "default")).error, null);
      for (const [action, entity, data] of [
        ["update", "provider", { id: provider, is_enabled: false }],
        ["update", "key", { id: key1, is_enabled: false }],
        ["update", "model", { id: a1, is_enabled: false }],
        ["set_model_enabled", undefined, { model_id: modelA, is_enabled: false }],
      ] as const) {
        const response = await command(action, data, entity);
        assert.equal(response.status, 409);
        const body = await response.json(); assert.equal(body.requiresConfirmation, true);
        assert.ok(body.affectedBusinesses.some((item: { key: string }) => item.key === "content_tools"));
      }
      const confirmed = await command("set_model_enabled", { model_id: modelA, is_enabled: false, confirm_impact: true });
      assert.equal(confirmed.status, 200);
      const body = await confirmed.json();
      assert.equal(body.availability.businessAssurances.find((item: { key: string }) => item.key === "content_tools").routingStatus, "outage");
      assert.equal((await command("set_model_enabled", { model_id: modelA, is_enabled: true })).status, 200);
    });
  } finally {
    __internal.setServiceClientForTests(null);
    assert.equal((await db.from("ai_feature_bindings").delete().in("feature_key", ["content_tools", "default"])).error, null);
    if (previous.data?.length) assert.equal((await db.from("ai_feature_bindings").insert(previous.data)).error, null);
    assert.equal((await db.from("ai_providers").delete().eq("id", provider)).error, null);
    assert.equal((await db.from("ai_provider_key_models").select("id").in("id", [a1, a2, b, c])).data?.length, 0);
  }
});
