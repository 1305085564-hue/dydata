import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { parse } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { buildAiConfigResponse } from "./route";
import { listRankedProviderKeyModels } from "@/lib/ai/provider-routing";

// Explicit opt-in: never fall back to a production URL or silently skip a requested run.
const url = process.env.AI_GOVERNANCE_TEST_URL;
test("渠道治理：真实本地库与管理接口闭环", { skip: !url }, async (t) => {
  assert.match(url!, /^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/);
  const env = parse(readFileSync(".env.ai-test.local"));
  const db = createClient(url!, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const actor = { createAdminClient: () => db as never, requireSystemActor: async () => ({ supabase: db as never, actor: { userId: "local-governance-test", role: "owner" } as never }) };
  const providerId = randomUUID();
  const keyIds = [randomUUID(), randomUUID(), randomUUID()];
  const modelA = `governance-a-${randomUUID()}`;
  const modelB = `governance-b-${randomUUID()}`;
  const featureKey = `governance-${randomUUID()}`;
  let upstreamStatus = 503;
  const server = createServer((_req, res) => {
    res.writeHead(upstreamStatus, { "content-type": "application/json", "x-request-id": "local-governance-probe" });
    res.end(JSON.stringify({ error: "service unavailable" }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  async function action(action: string, data: Record<string, unknown>) {
    return buildAiConfigResponse(new NextRequest("http://localhost/api/admin/ai-config", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, data }),
    }), actor);
  }
  async function keys() {
    const result = await db.from("ai_provider_keys").select("*").in("id", keyIds).order("id");
    assert.equal(result.error, null); return result.data!;
  }
  async function ordered(modelId: string) {
    const result = await db.from("ai_provider_key_models").select("id, sort_order, key_id").eq("model_id", modelId).order("sort_order");
    assert.equal(result.error, null); return result.data!;
  }
  async function updateKey(patch: Record<string, unknown>) {
    const result = await db.from("ai_provider_keys").update(patch).eq("id", keyIds[0]); assert.equal(result.error, null);
  }
  try {
    assert.equal((await db.from("ai_providers").insert({ id: providerId, name: "本地渠道治理验收", base_url: `http://127.0.0.1:${port}/v1`, is_enabled: true, priority: 0 })).error, null);
    assert.equal((await db.from("ai_provider_keys").insert(keyIds.map((id) => ({ id, provider_id: providerId, label: `本地验收-${id}`, api_key: "local-only-fixture", priority: 55, available_models: [modelA, modelB], is_enabled: true })))).error, null);
    assert.equal((await db.from("ai_provider_key_models").insert([modelA, modelB].flatMap((model_id) => keyIds.map((key_id) => ({ key_id, model_id, is_enabled: true, global_is_enabled: true }))))).error, null);

    await t.test("相邻互换再反向完全还原，另一个模型与全局顺位不变", async () => {
      const before = await ordered(modelA); const other = await ordered(modelB); const keyBefore = await keys();
      const data = { model_id: modelA, key_model_id: before[0].id, target_key_model_id: before[1].id };
      assert.equal((await action("swap_model_channel_order", data)).status, 200);
      assert.deepEqual((await ordered(modelA)).map((r) => r.id), [before[1].id, before[0].id, before[2].id]);
      assert.deepEqual((await listRankedProviderKeyModels(db, modelA)).map((r) => r.providerKeyModelId), [before[1].id, before[0].id, before[2].id]);
      assert.equal((await action("swap_model_channel_order", data)).status, 200);
      assert.deepEqual(await ordered(modelA), before); assert.deepEqual(await ordered(modelB), other); assert.deepEqual(await keys(), keyBefore);
      assert.equal((await action("swap_model_channel_order", { ...data, target_key_model_id: before[2].id })).status, 409);
      assert.deepEqual(await ordered(modelA), before);
    });
    await t.test("临时休眠持久化且不污染自动健康，恢复只解除手动限制", async () => {
      const now = Date.now(); const before = await keys();
      const response = await action("sleep_key", { key_id: keyIds[0] }); assert.equal(response.status, 200);
      const body = await response.json(); const summary = body.availability.keys.find((k: { keyId: string }) => k.keyId === keyIds[0]);
      assert.equal(summary.identity, "sleeping"); assert.equal(summary.sleepSource, "manual");
      const sleeping = (await keys()).find((k) => k.id === keyIds[0])!;
      assert.ok(Date.parse(sleeping.manual_sleep_until) >= now + 29 * 60_000);
      const automatic = ["consecutive_failures", "first_failure_at", "last_failure_at", "last_success_at", "unhealthy_until", "invalidated_at"];
      for (const field of automatic) assert.equal(sleeping[field], before.find((k) => k.id === keyIds[0])![field]);
      assert.equal((await listRankedProviderKeyModels(db, modelA)).length, 2);
      await updateKey({ consecutive_failures: 3, unhealthy_until: new Date(Date.now() + 300_000).toISOString() });
      assert.equal((await action("resume_key", { key_id: keyIds[0] })).status, 200);
      assert.equal((await listRankedProviderKeyModels(db, modelA)).length, 2);
      assert.equal((await keys()).find((k) => k.id === keyIds[0])!.manual_sleep_until, null);
    });
    await t.test("失败测试只返回事实，不改健康；成功复测才恢复失效", async () => {
      const before = await keys();
      const response = await action("test_key_model", { key_id: keyIds[0], model_id: modelA });
      assert.equal(response.status, 200); const body = await response.json();
      assert.equal(body.testResult.ok, false); assert.equal(body.testResult.failureDiagnostic.owner, "provider");
      assert.equal(body.testResult.failureDiagnostic.technical.requestId, "local-governance-probe");
      assert.deepEqual(await keys(), before);
      await updateKey({ consecutive_failures: 8, first_failure_at: new Date(Date.now() - 25 * 3600_000).toISOString(), last_failure_at: new Date().toISOString(), unhealthy_until: new Date(Date.now() - 1000).toISOString() });
      assert.equal((await listRankedProviderKeyModels(db, modelA)).length, 2);
      upstreamStatus = 200;
      assert.equal((await action("test_key_model", { key_id: keyIds[0], model_id: modelA })).status, 200);
      const restored = (await keys()).find((k) => k.id === keyIds[0])!;
      assert.equal(restored.first_failure_at, null); assert.equal(restored.invalidated_at, null); assert.equal(restored.consecutive_failures, 0);
      assert.equal((await listRankedProviderKeyModels(db, modelA)).length, 3);
    });
    await t.test("真实失败记录递增冷却，旧应用参数仍可调用", async () => {
      const cooldowns: number[] = [];
      for (let count = 1; count <= 5; count++) {
        assert.equal((await db.rpc("bump_provider_key_failure", { key_id: keyIds[0], error_message: "local fixture" })).error, null);
        const row = (await keys()).find((k) => k.id === keyIds[0])!;
        assert.equal(row.consecutive_failures, count);
        if (count >= 3) cooldowns.push(Math.round((Date.parse(row.unhealthy_until) - Date.parse(row.last_failure_at)) / 60_000));
      }
      assert.deepEqual(cooldowns, [5, 15, 30]);
    });
    await t.test("休眠渠道不能充当删除最后在岗渠道的备用", async () => {
      const models = await ordered(modelA);
      assert.equal((await db.from("ai_feature_bindings").insert({ feature_key: featureKey, label: "验收业务", model_id: modelA, provider_key_model_id: models.find((r) => r.key_id === keyIds[2])!.id, is_enabled: true, lifecycle_state: "active" })).error, null);
      assert.equal((await action("sleep_key", { key_id: keyIds[1] })).status, 200);
      const response = await buildAiConfigResponse(new NextRequest("http://localhost/api/admin/ai-config", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "delete", entity: "key", data: { id: keyIds[2] } }),
      }), actor);
      assert.equal(response.status, 409); assert.match((await response.json()).error, /无备用模型/);
      assert.equal((await keys()).length, 3);
    });
    await t.test("收走最后在岗模型渠道被阻止，审计失败恢复完整顺位与健康记录", async () => {
      const live = (await ordered(modelA)).find((r) => r.key_id === keyIds[2])!;
      const blocked = await action("remove_key_model", { key_model_id: live.id });
      assert.equal(blocked.status, 409); assert.match((await blocked.json()).error, /唯一可用线路/);
      const target = (await ordered(modelB))[0];
      assert.equal((await db.from("ai_provider_key_models").update({ consecutive_failures: 4, first_failure_at: new Date(Date.now() - 9000).toISOString(), invalidated_at: new Date().toISOString(), last_error_message: "local fixture model failure" }).eq("id", target.id)).error, null);
      const snapshot = (await db.from("ai_provider_key_models").select("*").eq("id", target.id).single()).data;
      // The deliberately invalid actor UUID makes the real audit insert fail.
      const response = await action("remove_key_model", { key_model_id: target.id });
      assert.equal(response.status, 500);
      const restored = (await db.from("ai_provider_key_models").select("*").eq("id", target.id).single()).data;
      assert.deepEqual(restored, snapshot);
    });

  } finally {
    assert.equal((await db.from("ai_feature_bindings").delete().eq("feature_key", featureKey)).error, null);
    assert.equal((await db.from("ai_providers").delete().eq("id", providerId)).error, null);
    assert.equal((await db.from("ai_provider_keys").select("id").in("id", keyIds)).data?.length, 0);
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
