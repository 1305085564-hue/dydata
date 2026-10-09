import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import test, { type TestContext } from "node:test";
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { buildAiConfigResponse } from "./route";
import { buildSyncModelsResponse } from "./sync-models/route";
import { selectHealthyProviderKeyModel } from "@/lib/ai/provider-routing";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;
type Row = Record<string, unknown>;

function readLocalEnv() {
  const file = ".env.ai-test.local";
  if (!existsSync(file)) return {};
  return Object.fromEntries(
    readFileSync(file, "utf8")
      .split(/\r?\n/)
      .map((line) => line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/))
      .filter((match): match is RegExpMatchArray => Boolean(match))
      .map((match) => [match[1], match[2].trim().replace(/^['"]|['"]$/g, "")]),
  ) as Record<string, string>;
}

const localEnv = readLocalEnv();
const localUrl = localEnv.NEXT_PUBLIC_SUPABASE_URL ?? "";
const localServiceRoleKey = localEnv.SUPABASE_SERVICE_ROLE_KEY ?? "";
const localDb = localUrl && localServiceRoleKey
  ? createClient(localUrl, localServiceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })
  : null;

async function canReachLocalDb() {
  if (!localDb || !/^https?:\/\/(127\.0\.0\.1|localhost)(?::\d+)?$/.test(localUrl)) return false;
  const { error } = await localDb.from("ai_providers").select("id").limit(1);
  return !error;
}

async function getRealDb(t: TestContext): Promise<Db | null> {
  if (!localDb || !(await canReachLocalDb())) {
    t.skip("需要运行本地隔离 Supabase；未连接时跳过真实库行为测试");
    return null;
  }
  return localDb;
}

function request(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/admin/ai-config", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function actor(db: Db) {
  return {
    requireSystemActor: async () => ({
      supabase: db as never,
      actor: { userId: "ai-config-real-db-test", role: "owner" } as never,
    }),
  };
}

function id(): string {
  return randomUUID();
}

function scopeKeys(db: Db, keyIds: string[]): Db {
  return {
    from(table: string) {
      const query = db.from(table);
      if (table !== "ai_provider_keys") return query;
      const select = query.select.bind(query);
      query.select = (...args: unknown[]) => select(...args).in("id", keyIds);
      return query;
    },
  };
}

async function suspendExistingModels(db: Db) {
  const { data, error } = await db.from("ai_provider_key_models").select("id, is_enabled");
  if (error) throw new Error(error.message);
  const snapshot = (data ?? []) as Array<{ id: string; is_enabled: boolean }>;
  for (const row of snapshot) {
    const result = await db.from("ai_provider_key_models").update({ is_enabled: false }).eq("id", row.id);
    if (result.error) throw new Error(result.error.message);
  }
  return async () => {
    for (const row of snapshot) {
      const result = await db.from("ai_provider_key_models").update({ is_enabled: row.is_enabled }).eq("id", row.id);
      if (result.error) throw new Error(result.error.message);
    }
  };
}

async function insert<T extends Row>(db: Db, table: string, row: T) {
  const { data, error } = await db.from(table).insert(row).select("*").single();
  if (error || !data) throw new Error(error?.message ?? `插入 ${table} 失败`);
  return data as T & { id: string };
}

async function deleteById(db: Db, table: string, value: string) {
  const { error } = await db.from(table).delete().eq("id", value);
  if (error) throw new Error(`清理 ${table} 失败：${error.message}`);
}

async function createProvider(db: Db, baseUrl: string) {
  const providerId = id();
  const provider = await insert(db, "ai_providers", {
    id: providerId,
    name: `ai-config-real-${providerId}`,
    base_url: baseUrl,
    priority: 1,
    is_enabled: true,
  });
  return provider;
}

async function createKey(db: Db, providerId: string, label = id()) {
  return insert(db, "ai_provider_keys", {
    id: id(),
    provider_id: providerId,
    label: `real-${label}`,
    api_key: `real-secret-${label}`,
    priority: 1,
    is_enabled: true,
  });
}

async function readModels(db: Db, keyId: string) {
  const { data, error } = await db
    .from("ai_provider_key_models")
    .select("id, key_id, model_id, display_name, is_enabled")
    .eq("key_id", keyId)
    .order("model_id");
  if (error) throw new Error(error.message);
  return (data ?? []) as Array<{ id: string; key_id: string; model_id: string; display_name: string | null; is_enabled: boolean }>;
}

async function startUpstream(
  handler: (request: { authorization: string; pathname: string }, response: import("node:http").ServerResponse) => void,
) {
  const server = createServer((req, res) => {
    handler({
      authorization: typeof req.headers.authorization === "string" ? req.headers.authorization : "",
      pathname: req.url ?? "/",
    }, res);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("测试上游未分配端口");
  return { server, baseUrl: `http://127.0.0.1:${address.port}/v1` };
}

async function closeServer(server: Server) {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

test("真实库 B1：同步只插入新模型且保留已有上下架状态", async (t) => {
  const db = await getRealDb(t);
  if (!db) return;
  const provider = await createProvider(db, "https://unused.invalid");
  const key = await createKey(db, provider.id, "b1");
  try {
    await insert(db, "ai_provider_key_models", { id: id(), key_id: key.id, model_id: "real-b1-old", display_name: "旧", is_enabled: false });
    await insert(db, "ai_provider_key_models", { id: id(), key_id: key.id, model_id: "real-b1-live", display_name: "在架", is_enabled: true });

    const response = await buildSyncModelsResponse(
      new NextRequest("http://localhost/api/admin/ai-config/sync-models", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ keyId: key.id, modelIds: ["real-b1-old", "real-b1-live", "real-b1-new"] }),
      }),
      actor(db),
    );
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.keyId, key.id);
    assert.equal(body.newCount, 1);
    assert.deepEqual(body.allModels.map((model: { modelId: string; isEnabled: boolean; isNewlyDiscovered: boolean }) => ({
      modelId: model.modelId,
      isEnabled: model.isEnabled,
      isNewlyDiscovered: model.isNewlyDiscovered,
    })), [
      { modelId: "real-b1-old", isEnabled: false, isNewlyDiscovered: false },
      { modelId: "real-b1-live", isEnabled: true, isNewlyDiscovered: false },
      { modelId: "real-b1-new", isEnabled: false, isNewlyDiscovered: true },
    ]);
    assert.deepEqual((await readModels(db, key.id)).map((row) => ({ model_id: row.model_id, is_enabled: row.is_enabled })), [
      { model_id: "real-b1-live", is_enabled: true },
      { model_id: "real-b1-new", is_enabled: false },
      { model_id: "real-b1-old", is_enabled: false },
    ]);
  } finally {
    await deleteById(db, "ai_providers", provider.id);
  }
});

test("真实库 B2：独占模型下架返回 409，存在其它健康渠道时全库更新", async (t) => {
  const db = await getRealDb(t);
  if (!db) return;
  const restoreExistingModels = await suspendExistingModels(db);
  const provider = await createProvider(db, "https://unused.invalid");
  const key = await createKey(db, provider.id, "b2");
  const featureKey = `real_b2_${id()}`;
  try {
    const target = await insert(db, "ai_provider_key_models", { id: id(), key_id: key.id, model_id: "real-b2-target", display_name: "目标", is_enabled: true });
    await insert(db, "ai_feature_bindings", {
      id: id(), feature_key: featureKey, label: "真实库独占业务", model_id: "real-b2-target", provider_key_model_id: target.id,
      is_enabled: true, lifecycle_state: "active",
    });

    let response = await buildAiConfigResponse(request({
      action: "set_global_model_shelf_state", data: { modelId: "real-b2-target", is_enabled: false },
    }), actor(db));
    assert.equal(response.status, 409);
    assert.equal((await readModels(db, key.id))[0]?.is_enabled, true);

    const backupKey = await createKey(db, provider.id, "b2-backup");
    await insert(db, "ai_provider_key_models", { id: id(), key_id: backupKey.id, model_id: "real-b2-backup", display_name: "备用", is_enabled: true });
    response = await buildAiConfigResponse(request({
      action: "set_global_model_shelf_state", data: { modelId: "real-b2-target", is_enabled: false },
    }), actor(db));
    assert.equal(response.status, 200);
    assert.equal((await readModels(db, key.id))[0]?.is_enabled, false);
    await deleteById(db, "ai_provider_keys", backupKey.id);
  } finally {
    await db.from("ai_feature_bindings").delete().eq("feature_key", featureKey);
    await deleteById(db, "ai_providers", provider.id);
    await restoreExistingModels();
  }
});

test("真实库 B3：取消勾选保留记录并停用，重新勾选恢复启用", async (t) => {
  const db = await getRealDb(t);
  if (!db) return;
  const provider = await createProvider(db, "https://unused.invalid");
  const key = await createKey(db, provider.id, "b3");
  try {
    await insert(db, "ai_provider_key_models", { id: id(), key_id: key.id, model_id: "real-b3-model", display_name: "模型", is_enabled: true });
    let response = await buildAiConfigResponse(request({ action: "set_key_model_selection", data: { key_id: key.id, model_ids: [] } }), actor(db));
    assert.equal(response.status, 200);
    assert.equal((await readModels(db, key.id))[0]?.is_enabled, false);
    response = await buildAiConfigResponse(request({ action: "set_key_model_selection", data: { key_id: key.id, model_ids: ["real-b3-model"] } }), actor(db));
    assert.equal(response.status, 200);
    assert.equal((await readModels(db, key.id))[0]?.is_enabled, true);
  } finally {
    await deleteById(db, "ai_providers", provider.id);
  }
});

test("真实库 B4：停用供应商后运行时选不到其 Key", async (t) => {
  const db = await getRealDb(t);
  if (!db) return;
  const provider = await createProvider(db, "https://unused.invalid");
  const key = await createKey(db, provider.id, "b4");
  try {
    await insert(db, "ai_provider_key_models", { id: id(), key_id: key.id, model_id: "real-b4-model", display_name: "模型", is_enabled: true });
    const response = await buildAiConfigResponse(request({ action: "update", entity: "provider", data: { id: provider.id, is_enabled: false } }), actor(db));
    assert.equal(response.status, 200);
    assert.equal(await selectHealthyProviderKeyModel(db as never, "real-b4-model"), null);
  } finally {
    await deleteById(db, "ai_providers", provider.id);
  }
});

test("真实库 B5：模型改名同步所有 Key 记录", async (t) => {
  const db = await getRealDb(t);
  if (!db) return;
  const provider = await createProvider(db, "https://unused.invalid");
  const keyA = await createKey(db, provider.id, "b5-a");
  const keyB = await createKey(db, provider.id, "b5-b");
  try {
    const modelA = await insert(db, "ai_provider_key_models", { id: id(), key_id: keyA.id, model_id: "real-b5-model", display_name: "旧名", is_enabled: true });
    await insert(db, "ai_provider_key_models", { id: id(), key_id: keyB.id, model_id: "real-b5-model", display_name: "旧名", is_enabled: false });
    const response = await buildAiConfigResponse(request({ action: "update", entity: "model", data: { id: modelA.id, display_name: "新名" } }), actor(db));
    assert.equal(response.status, 200);
    const renamed = await db.from("ai_provider_key_models").select("display_name").eq("model_id", "real-b5-model");
    assert.deepEqual((renamed.data as Array<{ display_name: string | null }>).map((row) => row.display_name), ["新名", "新名"]);
  } finally {
    await deleteById(db, "ai_providers", provider.id);
  }
});

test("真实库 B6：新增 Key 探测模型只在当前渠道上架", async (t) => {
  const db = await getRealDb(t);
  if (!db) return;
  const upstream = await startUpstream((_request, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ data: [{ id: "real-b6-selected" }, { id: "real-b6-discovered" }] }));
  });
  const provider = await createProvider(db, upstream.baseUrl);
  const existingKey = await createKey(db, provider.id, "b6-existing");
  try {
    await insert(db, "ai_provider_key_models", { id: id(), key_id: existingKey.id, model_id: "real-b6-selected", display_name: "选择模型", is_enabled: false });
    const response = await buildAiConfigResponse(request({
      action: "create", entity: "key", data: { provider_id: provider.id, label: `real-b6-new-${id()}`, api_key: "b6-secret", selectedModelIds: ["real-b6-selected"] },
    }), actor(db));
    assert.equal(response.status, 200);
    const { data: createdKey, error } = await db.from("ai_provider_keys").select("id").eq("provider_id", provider.id).neq("id", existingKey.id).single();
    if (error || !createdKey) throw new Error(error?.message ?? "新增 Key 未落库");
    const models = await readModels(db, createdKey.id);
    assert.equal(models.find((row) => row.model_id === "real-b6-selected")?.is_enabled, true);
    assert.equal(models.find((row) => row.model_id === "real-b6-discovered")?.is_enabled, false);
    assert.equal((await readModels(db, existingKey.id)).find((row) => row.model_id === "real-b6-selected")?.is_enabled, false);
  } finally {
    await deleteById(db, "ai_providers", provider.id);
    await closeServer(upstream.server);
  }
});

test("真实库 B7：全池同步隔离失败 Key，并把新模型按未上架写入", async (t) => {
  const db = await getRealDb(t);
  if (!db) return;
  const upstream = await startUpstream((request, response) => {
    if (request.authorization.includes("fail-secret")) {
      response.writeHead(502); response.end("upstream failed"); return;
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ data: [{ id: request.authorization.includes("new-secret") ? "real-b7-new" : "real-b7-existing" }] }));
  });
  const provider = await createProvider(db, upstream.baseUrl);
  const keys = await Promise.all([createKey(db, provider.id, "b7-ok"), createKey(db, provider.id, "b7-fail"), createKey(db, provider.id, "b7-new")]);
  try {
    await insert(db, "ai_provider_key_models", { id: id(), key_id: keys[0].id, model_id: "real-b7-existing", display_name: "已存在", is_enabled: true });
    await db.from("ai_provider_keys").update({ api_key: "ok-secret" }).eq("id", keys[0].id);
    await db.from("ai_provider_keys").update({ api_key: "fail-secret" }).eq("id", keys[1].id);
    await db.from("ai_provider_keys").update({ api_key: "new-secret" }).eq("id", keys[2].id);
    const response = await buildAiConfigResponse(request({ action: "sync_all_keys" }), actor(scopeKeys(db, keys.map((key) => key.id))));
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.total, 3);
    assert.equal(body.succeeded, 2);
    assert.equal(body.failed.length, 1);
    assert.equal(body.failed[0].keyId, keys[1].id);
    assert.deepEqual(await readModels(db, keys[1].id), []);
    assert.equal((await readModels(db, keys[2].id)).find((row) => row.model_id === "real-b7-new")?.is_enabled, false);
    assert.equal((await readModels(db, keys[0].id)).find((row) => row.model_id === "real-b7-existing")?.is_enabled, true);
  } finally {
    await deleteById(db, "ai_providers", provider.id);
    await closeServer(upstream.server);
  }
});

test("真实库 B8：全池连通测试返回成功、失败和超时三态", async (t) => {
  const db = await getRealDb(t);
  if (!db) return;
  const upstream = await startUpstream((request, response) => {
    if (request.pathname.endsWith("/chat/completions") && request.authorization.includes("timeout-secret")) {
      const timer = setTimeout(() => { response.writeHead(200); response.end("ok"); }, 16_000);
      response.on("close", () => clearTimeout(timer));
      return;
    }
    if (request.authorization.includes("failure-secret")) {
      response.writeHead(500); response.end("bad"); return;
    }
    response.writeHead(200); response.end("ok");
  });
  const provider = await createProvider(db, upstream.baseUrl);
  const successKey = await createKey(db, provider.id, "b8-success");
  const failureKey = await createKey(db, provider.id, "b8-failure");
  const timeoutKey = await createKey(db, provider.id, "b8-timeout");
  const disabledKey = await createKey(db, provider.id, "b8-disabled");
  try {
    await db.from("ai_provider_keys").update({ api_key: "success-secret" }).eq("id", successKey.id);
    await db.from("ai_provider_keys").update({ api_key: "failure-secret" }).eq("id", failureKey.id);
    await db.from("ai_provider_keys").update({ api_key: "timeout-secret" }).eq("id", timeoutKey.id);
    await db.from("ai_provider_keys").update({ is_enabled: false }).eq("id", disabledKey.id);
    const response = await buildAiConfigResponse(request({ action: "test_all_keys" }), actor(scopeKeys(db, [successKey.id, failureKey.id, timeoutKey.id, disabledKey.id])));
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.total, 3);
    const byId = new Map(body.results.map((result: { keyId: string; [key: string]: unknown }) => [result.keyId, result]));
    assert.equal((byId.get(successKey.id) as { ok: boolean }).ok, true);
    assert.equal(typeof (byId.get(successKey.id) as { latencyMs: unknown }).latencyMs, "number");
    assert.equal((byId.get(failureKey.id) as { ok: boolean; latencyMs: unknown }).ok, false);
    assert.equal((byId.get(failureKey.id) as { latencyMs: unknown }).latencyMs, null);
    assert.equal((byId.get(timeoutKey.id) as { ok: boolean; latencyMs: unknown }).ok, false);
    assert.equal((byId.get(timeoutKey.id) as { latencyMs: unknown }).latencyMs, null);
  } finally {
    await deleteById(db, "ai_providers", provider.id);
    await closeServer(upstream.server);
  }
});
