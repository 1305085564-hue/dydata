import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync, renameSync, writeFileSync, unlinkSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parse } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";

import { buildAiConfigResponse } from "@/app/api/admin/ai-config/route";
import { loadAiConfig } from "@/lib/ai-config/config-loader";

// This script deliberately uses a small dynamic client shape, matching the real-db tests.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;
type Scenario = "normal" | "outage" | "retrying";
type BindingSnapshot = {
  featureKey: string;
  existed: boolean;
  id: string | null;
  modelId: string | null;
  isEnabled: boolean | null;
  lifecycleState: string | null;
  archivedAt: string | null;
  archivedReason: string | null;
};
type DemoManifest = {
  version: 1;
  dbOrigin: string;
  providerId: string;
  providerName: string;
  upstreamBaseUrl: string;
  keyIds: string[];
  keyLabels: string[];
  modelIds: string[];
  modelRows: Array<{ keyId: string; modelId: string }>;
  bindings: BindingSnapshot[];
  expectedBindingModels: Record<string, string>;
  createdAt: string;
};

export const DEMO_PREFIX = "codex-local-demo-ai-config-";
export const DEMO_API_KEY = "codex-local-demo-not-a-real-secret";
const DEMO_BAD_API_KEY = "codex-local-demo-invalid-test-key";
const FEATURE_KEYS = ["content_tools", "period_insight", "default"] as const;
const MODEL_IDS = {
  normal: `${DEMO_PREFIX}normal-single-supply`,
  haikuHyphen: "claude-haiku-5-5",
  haikuDot: "claude-haiku-5.5",
  fallback: `${DEMO_PREFIX}default-fallback-invalid`,
  sleeping: `${DEMO_PREFIX}sleeping-model`,
  needsAction: `${DEMO_PREFIX}needs-action-model`,
  disabled: `${DEMO_PREFIX}disabled-model`,
  outage: `${DEMO_PREFIX}outage-no-channel`,
  find: `${DEMO_PREFIX}find-test-model`,
} as const;

function parsePort(url: URL): boolean {
  return /^\d+$/.test(url.port) && Number(url.port) > 0 && Number(url.port) <= 65535;
}

/**
 * Accept a literal IPv4 loopback authority only. URL.hostname alone is too lenient:
 * WHATWG URL parsing also normalizes several alternate numeric address spellings.
 */
export function assertLoopbackHttpUrl(raw: string, label: string, allowPath = false): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${label}地址格式不正确`);
  }
  const authority = raw.match(/^http:\/\/([^/?#]+)/i)?.[1] ?? "";
  const literalHost = authority.slice(0, authority.lastIndexOf(":")).toLowerCase();
  if (
    url.protocol !== "http:" ||
    literalHost !== "127.0.0.1" ||
    url.hostname !== "127.0.0.1" ||
    !parsePort(url) ||
    url.username || url.password || url.search || url.hash ||
    (!allowPath && url.pathname !== "/")
  ) {
    throw new Error(`${label}只允许 http://127.0.0.1:<端口> 地址`);
  }
  return url;
}

function statePath(): string {
  const root = resolve(process.cwd());
  const suffix = createHash("sha256").update(root).digest("hex").slice(0, 12);
  return join(tmpdir(), `dydata-ai-config-local-demo-${suffix}.json`);
}

function readManifest(): DemoManifest | null {
  const file = statePath();
  if (!existsSync(file)) return null;
  const manifest = JSON.parse(readFileSync(file, "utf8")) as DemoManifest;
  if (manifest.version !== 1 || !manifest.providerName.startsWith(DEMO_PREFIX)) {
    throw new Error("演示状态文件格式无效；请人工检查后再处理，脚本没有修改数据库");
  }
  assertLoopbackHttpUrl(manifest.upstreamBaseUrl, "演示上游", true);
  assertLoopbackHttpUrl(manifest.dbOrigin, "演示数据库");
  return manifest;
}

function writeManifest(manifest: DemoManifest): void {
  const file = statePath();
  const temporary = `${file}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporary, file);
}

function removeManifest(): void {
  const file = statePath();
  if (existsSync(file)) unlinkSync(file);
}

function localCredentials() {
  const envFile = [".env.ai-test.local", ".env.local"].find(existsSync);
  if (!envFile) throw new Error("缺少 .env.ai-test.local 或 .env.local；请先配置本地 Supabase 凭据");
  const fileEnv = parse(readFileSync(envFile, "utf8"));
  const urlValue = process.env.AI_CONFIG_LOCAL_DEMO_URL ?? fileEnv.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const serviceRoleKey = process.env.AI_CONFIG_LOCAL_DEMO_SERVICE_ROLE_KEY ?? fileEnv.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!urlValue || !serviceRoleKey) throw new Error(`${basename(envFile)} 缺少本地 Supabase 地址或 service role key`);
  const url = assertLoopbackHttpUrl(urlValue, "数据库");
  return { url: url.toString().replace(/\/$/, ""), serviceRoleKey };
}

async function connectLocalDb() {
  const credentials = localCredentials();
  const db = createClient(credentials.url, credentials.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  }) as Db;
  const { error } = await db.from("ai_providers").select("id").limit(1);
  if (error) throw new Error(`无法连接本地 Supabase（${error.code ?? "查询 ai_providers 失败"}）`);
  return { db, origin: new URL(credentials.url).origin };
}

function handlerFor(db: Db) {
  const actor = {
    createAdminClient: () => db as never,
    requireSystemActor: async () => ({
      supabase: db as never,
      actor: { userId: "codex-local-ai-config-demo", role: "owner" } as never,
    }),
  };
  return async (action: string, data: Record<string, unknown>) => buildAiConfigResponse(
    new NextRequest("http://127.0.0.1/api/admin/ai-config", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, data }),
    }),
    actor,
  );
}

type UpstreamRequest = { method: string; pathname: string; modelId: string | null; status: number };
type FakeUpstream = { server: Server; baseUrl: string; requests: UpstreamRequest[] };

async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  let raw = "";
  for await (const chunk of request) raw += chunk;
  if (!raw) return {};
  try {
    const body = JSON.parse(raw) as unknown;
    return body && typeof body === "object" ? body as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function respond(response: ServerResponse, status: number, payload: unknown): void {
  response.writeHead(status, { "content-type": "application/json", "x-request-id": "codex-local-demo" });
  response.end(JSON.stringify(payload));
}

export async function startFakeUpstream(): Promise<FakeUpstream> {
  const requests: UpstreamRequest[] = [];
  const server = createServer(async (request, response) => {
    const pathname = request.url ?? "/";
    if (request.method === "GET" && pathname === "/v1/models") {
      requests.push({ method: "GET", pathname, modelId: null, status: 200 });
      respond(response, 200, { data: Object.values(MODEL_IDS).map((id) => ({ id })) });
      return;
    }
    if (request.method === "POST" && pathname === "/v1/chat/completions") {
      const body = await readJsonBody(request);
      const modelId = typeof body.model === "string" ? body.model : null;
      const status = request.headers.authorization === `Bearer ${DEMO_BAD_API_KEY}` ? 404 : 200;
      requests.push({ method: "POST", pathname, modelId, status });
      if (status === 404) {
        respond(response, 404, { error: { message: "model_not_found" } });
        return;
      }
      respond(response, 200, { choices: [{ message: { content: "ok" } }] });
      return;
    }
    respond(response, 404, { error: "not_found" });
  });
  await new Promise<void>((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("本地假上游未获得可用端口");
  const baseUrl = `http://127.0.0.1:${address.port}/v1`;
  assertLoopbackHttpUrl(baseUrl, "假上游", true);
  return { server, baseUrl, requests };
}

export async function closeServer(server: Server): Promise<void> {
  if (!server.listening) return;
  await new Promise<void>((resolveClose, rejectClose) => {
    server.close((error) => error ? rejectClose(error) : resolveClose());
  });
}

function checked<T>(result: { error: { message?: string; code?: string } | null; data?: T | null }, label: string): T {
  if (result.error || result.data == null) {
    const message = (result.error?.message ?? "").replace(/codex-local-demo-[^\s,'"]+/g, "[演示值]");
    throw new Error(`${label}失败${result.error?.code ? `（${result.error.code}）` : ""}${message ? `：${message}` : ""}`);
  }
  return result.data;
}

async function existingBindings(db: Db): Promise<BindingSnapshot[]> {
  const result = checked(await db.from("ai_feature_bindings")
    .select("id,feature_key,model_id,is_enabled,lifecycle_state,archived_at,archived_reason")
    .in("feature_key", [...FEATURE_KEYS]), "读取演示业务配置");
  const byKey = new Map((result as Array<Record<string, unknown>>).map((row) => [String(row.feature_key), row]));
  return FEATURE_KEYS.map((featureKey) => {
    const row = byKey.get(featureKey);
    return row ? {
      featureKey, existed: true, id: String(row.id),
      modelId: typeof row.model_id === "string" ? row.model_id : null,
      isEnabled: row.is_enabled === true,
      lifecycleState: typeof row.lifecycle_state === "string" ? row.lifecycle_state : "active",
      archivedAt: typeof row.archived_at === "string" ? row.archived_at : null,
      archivedReason: typeof row.archived_reason === "string" ? row.archived_reason : null,
    } : {
      featureKey, existed: false, id: null, modelId: null,
      isEnabled: null, lifecycleState: null, archivedAt: null, archivedReason: null,
    };
  });
}

function bindingLabels(featureKey: string): string {
  return featureKey === "content_tools" ? "内容工具" : featureKey === "period_insight" ? "周期洞察" : "全局默认 AI 模型";
}

async function applyBindingModel(db: Db, manifest: DemoManifest, featureKey: string, modelId: string): Promise<void> {
  const snapshot = manifest.bindings.find((binding) => binding.featureKey === featureKey);
  if (!snapshot) throw new Error(`演示配置缺少 ${featureKey} 原始快照`);
  const currentResult = await db.from("ai_feature_bindings").select("id")
    .eq("feature_key", featureKey).maybeSingle();
  if (currentResult.error) throw new Error(`读取 ${featureKey} 失败`);
  const current = currentResult.data as { id: string } | null;
  manifest.expectedBindingModels[featureKey] = modelId;
  await writeManifest(manifest);
  if (!current) {
    const createdId = snapshot.id ?? randomUUID();
    snapshot.id = createdId;
    await writeManifest(manifest);
    checked(await db.from("ai_feature_bindings").insert({
      id: createdId,
      feature_key: featureKey,
      label: bindingLabels(featureKey),
      model_id: modelId,
      is_enabled: true,
      lifecycle_state: "active",
    }).select("id").single(), `创建 ${featureKey} 演示绑定`);
  } else {
    checked(await db.from("ai_feature_bindings").update({
      model_id: modelId,
      is_enabled: true,
      lifecycle_state: "active",
      archived_at: null,
      archived_reason: null,
    }).eq("feature_key", featureKey).eq("id", current.id).select("id").single(), `更新 ${featureKey} 演示绑定`);
  }
  manifest.expectedBindingModels[featureKey] = modelId;
  await writeManifest(manifest);
}

async function applyScenario(db: Db, manifest: DemoManifest, scenario: Scenario): Promise<void> {
  const commonModel = scenario === "normal" ? MODEL_IDS.normal
    : scenario === "outage" ? MODEL_IDS.outage : MODEL_IDS.sleeping;
  await applyBindingModel(db, manifest, "default", commonModel);
  await applyBindingModel(db, manifest, "content_tools", commonModel);
  if (scenario === "normal") await applyBindingModel(db, manifest, "period_insight", MODEL_IDS.fallback);
}

function modelRowsForSetup(keyIds: string[]) {
  const [healthy, fallback, sleeping, needsAction, disabled] = keyIds;
  const now = Date.now();
  const defaults = {
    is_enabled: true,
    consecutive_failures: 0,
    first_failure_at: null,
    last_failure_at: null,
    last_success_at: null,
    unhealthy_until: null,
    invalidated_at: null,
    last_error_message: null,
  };
  return [
    { ...defaults, key_id: healthy, model_id: MODEL_IDS.normal, display_name: "本地演示 · 正常 / 单条可用", last_success_at: new Date(now).toISOString() },
    { ...defaults, key_id: healthy, model_id: MODEL_IDS.haikuHyphen, display_name: "本地演示 · claude-haiku-5-5", last_success_at: new Date(now).toISOString() },
    { ...defaults, key_id: healthy, model_id: MODEL_IDS.haikuDot, display_name: "本地演示 · claude-haiku-5.5", last_success_at: new Date(now).toISOString() },
    { ...defaults, key_id: fallback, model_id: MODEL_IDS.fallback, display_name: "本地演示 · 默认顶班失败模型", invalidated_at: new Date(now).toISOString(), last_failure_at: new Date(now).toISOString(), last_error_message: "HTTP 401 invalid API key" },
    { ...defaults, key_id: sleeping, model_id: MODEL_IDS.sleeping, display_name: "本地演示 · 暂时歇着", consecutive_failures: 1, last_failure_at: new Date(now).toISOString(), unhealthy_until: new Date(now + 10 * 60_000).toISOString(), last_error_message: "HTTP 503 local demo cooldown" },
    { ...defaults, key_id: needsAction, model_id: MODEL_IDS.needsAction, display_name: "本地演示 · 需要你处理", invalidated_at: new Date(now).toISOString(), consecutive_failures: 3, first_failure_at: new Date(now).toISOString(), last_failure_at: new Date(now).toISOString(), last_error_message: "HTTP 401 invalid API key" },
    { ...defaults, key_id: disabled, model_id: MODEL_IDS.disabled, display_name: "本地演示 · 已停用", is_enabled: false },
  ];
}

async function assertNoPrefixCollision(db: Db): Promise<void> {
  const providers = checked(await db.from("ai_providers").select("id,name").like("name", `${DEMO_PREFIX}%`).limit(1), "检查演示命名前缀") as Array<{ id: string; name: string }>;
  const keys = checked(await db.from("ai_provider_keys").select("id,label").like("label", `${DEMO_PREFIX}%`).limit(1), "检查演示渠道前缀") as Array<{ id: string; label: string }>;
  if (providers.length || keys.length) {
    throw new Error("发现已有演示前缀数据但没有匹配的状态文件；脚本不会接管或清理，请先核对本地数据");
  }
}

async function createManifest(db: Db, origin: string, upstreamBaseUrl: string): Promise<DemoManifest> {
  const providerId = randomUUID();
  const keyIds = Array.from({ length: 7 }, () => randomUUID());
  const keyLabels = ["正常与 Haiku 别名", "默认顶班失效", "暂时歇着", "需要你处理", "已停用", "找渠道测通", "找渠道测不通"]
    .map((label) => `${DEMO_PREFIX}${label}`);
  const modelRows = modelRowsForSetup(keyIds);
  const bindings = await existingBindings(db);
  const manifest: DemoManifest = {
    version: 1,
    dbOrigin: origin,
    providerId,
    providerName: `${DEMO_PREFIX}本地假上游`,
    upstreamBaseUrl,
    keyIds,
    keyLabels,
    modelIds: Object.values(MODEL_IDS),
    modelRows: modelRows.map((row) => ({ keyId: row.key_id, modelId: row.model_id })),
    bindings,
    expectedBindingModels: {},
    createdAt: new Date().toISOString(),
  };
  const keys = keyIds.map((id, index) => ({
    id,
    provider_id: providerId,
    label: keyLabels[index],
    is_enabled: true,
    api_key: index === 6 ? DEMO_BAD_API_KEY : DEMO_API_KEY,
    available_models: index >= 5 ? [MODEL_IDS.find] : [],
  }));
  writeManifest(manifest);
  try {
    checked(await db.from("ai_providers").insert({
      id: providerId,
      name: manifest.providerName,
      base_url: upstreamBaseUrl,
      description: "仅本地演示使用；脚本假上游绑定 127.0.0.1",
      is_enabled: true,
    }).select("id").single(), "创建本地演示地址组");
    checked(await db.from("ai_provider_keys").insert(keys).select("id"), "创建本地演示渠道");
    checked(await db.from("ai_provider_key_models").insert(modelRows).select("id"), "创建本地演示模型供应");
    await applyScenario(db, manifest, "normal");
  } catch (error) {
    const conflicts = await cleanupDemo(db, manifest);
    if (conflicts.length) console.error(`自动清理冲突：${conflicts.join("；")}`);
    throw error;
  }
  return manifest;
}

async function verifyProviderAddress(db: Db, manifest: DemoManifest): Promise<void> {
  const row = checked(await db.from("ai_providers").select("name,base_url")
    .eq("id", manifest.providerId).single(), "复核本地假上游地址") as { name: string; base_url: string };
  assert.equal(row.name, manifest.providerName, "演示地址组名称发生变化");
  assert.equal(row.base_url, manifest.upstreamBaseUrl, "演示地址组 URL 已被修改");
  assertLoopbackHttpUrl(row.base_url, "数据库中的上游", true);
}

function requireModelFamily(report: Awaited<ReturnType<typeof loadAiConfig>>["availability"], modelId: string) {
  const family = report.modelFamilies.find((item) => item.modelId === modelId);
  assert.ok(family, `缺少演示模型 ${modelId}`);
  return family;
}

async function verifyScenario(db: Db, scenario: Scenario): Promise<void> {
  const bundle = await loadAiConfig(db as never);
  const byKey = new Map(bundle.availability.businessAssurances.map((item) => [item.key, item]));
  const content = byKey.get("content_tools");
  assert.ok(content, "本地数据库没有内容工具业务状态");
  if (scenario === "normal") {
    assert.equal(content.routingStatus, "normal");
    assert.equal(byKey.get("period_insight")?.routingStatus, "fallback");
    assert.equal(bundle.availability.globalDefaultModelId, MODEL_IDS.normal);
  } else if (scenario === "outage") {
    assert.equal(content.routingStatus, "outage");
    assert.equal(content.messageKey, "business.outage");
  } else {
    assert.equal(content.routingStatus, "outage");
    assert.equal(content.messageKey, "business.outage_retrying");
  }
  return;
}

async function runDiscoveryTests(db: Db, manifest: DemoManifest): Promise<void> {
  const command = handlerFor(db);
  await verifyProviderAddress(db, manifest);
  const found = await command("find_model_channels", { model_id: MODEL_IDS.find });
  assert.equal(found.status, 200);
  const foundBody = await found.json();
  const candidateKeys = foundBody.candidates
    .filter((candidate: { requiresProbe: boolean }) => candidate.requiresProbe)
    .map((candidate: { keyId: string }) => candidate.keyId);
  assert.deepEqual(candidateKeys, manifest.keyIds.slice(5), "同一模型应找到两条演示渠道候选");

  const opened = await command("enable_model_channel", { key_id: manifest.keyIds[5], model_id: MODEL_IDS.find });
  assert.equal(opened.status, 200, "假上游成功响应未能打开候选供应");
  const openedBody = await opened.json();
  assert.equal(openedBody.enableResult.testResult.ok, true);
  manifest.modelRows.push({ keyId: manifest.keyIds[5], modelId: MODEL_IDS.find });
  await writeManifest(manifest);

  await verifyProviderAddress(db, manifest);
  const rejected = await command("enable_model_channel", { key_id: manifest.keyIds[6], model_id: MODEL_IDS.find });
  assert.equal(rejected.status, 422, "假上游失败响应没有被识别为失败");
  const rejectedBody = await rejected.json();
  assert.equal(rejectedBody.testResult.ok, false);
  assert.equal(rejectedBody.testResult.status, 404);
  const failedModel = await db.from("ai_provider_key_models").select("id")
    .eq("key_id", manifest.keyIds[6]).eq("model_id", MODEL_IDS.find).maybeSingle();
  assert.equal(failedModel.error, null);
  assert.equal(failedModel.data, null, "测试失败的候选应继续保持关闭，不能写入供应");
}

async function verifyFixtureStates(db: Db): Promise<void> {
  const bundle = await loadAiConfig(db as never);
  const states = [
    [MODEL_IDS.normal, "active"],
    [MODEL_IDS.haikuHyphen, "active"],
    [MODEL_IDS.haikuDot, "active"],
    [MODEL_IDS.fallback, "invalid"],
    [MODEL_IDS.sleeping, "sleeping"],
    [MODEL_IDS.needsAction, "invalid"],
    [MODEL_IDS.disabled, "disabled"],
  ] as const;
  for (const [modelId, identity] of states) {
    const family = requireModelFamily(bundle.availability, modelId);
    assert.ok(family.channels.some((channel) => channel.identity === identity), `${modelId} 应展示为 ${identity}`);
  }
  const singleSupply = requireModelFamily(bundle.availability, MODEL_IDS.normal);
  assert.equal(singleSupply.schedulableChannelCount, 1, "演示单点模型应只有 1 条可用供应");
  assert.equal(singleSupply.singlePointRisk, true);
}

async function verifyUpstreamDiscovery(db: Db, manifest: DemoManifest): Promise<void> {
  const response = await handlerFor(db)("probe_provider_models", {
    base_url: manifest.upstreamBaseUrl,
    api_key: DEMO_API_KEY,
  });
  assert.equal(response.status, 200, "本地假上游模型清单请求失败");
  const body = await response.json();
  assert.ok(body.modelIds.includes(MODEL_IDS.haikuHyphen));
  assert.ok(body.modelIds.includes(MODEL_IDS.haikuDot));
  const aliasGroup = body.modelGroups.find((group: { modelIds: string[] }) =>
    group.modelIds.includes(MODEL_IDS.haikuHyphen) && group.modelIds.includes(MODEL_IDS.haikuDot));
  assert.ok(aliasGroup, "假上游清单应包含 Claude Haiku 5.5 两种写法");
}

async function cleanupDemo(db: Db, manifest: DemoManifest): Promise<string[]> {
  const conflicts: string[] = [];
  const origin = new URL(localCredentials().url).origin;
  if (origin !== manifest.dbOrigin) throw new Error("清理目标与演示状态文件记录的本地数据库不一致；未执行清理");
  const providerResult = await db.from("ai_providers").select("id,name,base_url").eq("id", manifest.providerId).maybeSingle();
  if (providerResult.error) throw new Error("读取演示地址组失败，未删除数据");
  if (providerResult.data) {
    const provider = providerResult.data as { id: string; name: string; base_url: string };
    assertLoopbackHttpUrl(provider.base_url, "清理前数据库中的上游", true);
    if (provider.name !== manifest.providerName || !provider.name.startsWith(DEMO_PREFIX)) {
      conflicts.push("演示地址组名称已变化，已保留其数据");
    } else {
      const childKeys = checked(await db.from("ai_provider_keys").select("id,label")
        .eq("provider_id", manifest.providerId), "核对演示渠道");
      const allowedKeys = new Set(manifest.keyIds);
      const unexpectedKeys = (childKeys as Array<{ id: string; label: string }>).filter((key) =>
        !allowedKeys.has(key.id) || !key.label.startsWith(DEMO_PREFIX));
      const childModels = checked(await db.from("ai_provider_key_models").select("key_id,model_id")
        .in("key_id", manifest.keyIds), "核对演示模型");
      const allowedModels = new Set(manifest.modelRows.map((row) => `${row.keyId}\0${row.modelId}`));
      const unexpectedModels = (childModels as Array<{ key_id: string; model_id: string }>).filter((model) =>
        !allowedModels.has(`${model.key_id}\0${model.model_id}`));
      if (unexpectedKeys.length || unexpectedModels.length) {
        conflicts.push("演示渠道下出现非脚本创建的记录，已保留地址组以保护数据");
      } else {
        const deleted = await db.from("ai_providers").delete().eq("id", manifest.providerId)
          .eq("name", manifest.providerName).select("id");
        if (deleted.error) throw new Error("删除本地演示地址组失败");
        if (!deleted.data?.length) conflicts.push("地址组未删除，可能已被并发修改");
      }
    }
  }

  for (const snapshot of manifest.bindings) {
    if (!(snapshot.featureKey in manifest.expectedBindingModels)) continue;
    const currentResult = await db.from("ai_feature_bindings")
      .select("id,model_id,is_enabled,lifecycle_state,archived_at,archived_reason")
      .eq("feature_key", snapshot.featureKey).maybeSingle();
    if (currentResult.error) throw new Error(`读取 ${snapshot.featureKey} 清理状态失败`);
    const current = currentResult.data as {
      id: string; model_id: string | null; is_enabled: boolean; lifecycle_state: string;
      archived_at: string | null; archived_reason: string | null;
    } | null;
    if (!current && !snapshot.existed) continue;
    if (!current || current.id !== snapshot.id || current.model_id !== manifest.expectedBindingModels[snapshot.featureKey]) {
      conflicts.push(`${snapshot.featureKey} 配置已被修改，未覆盖当前值`);
      continue;
    }
    if (snapshot.existed) {
      const restored = await db.from("ai_feature_bindings").update({
        model_id: snapshot.modelId,
        is_enabled: snapshot.isEnabled,
        lifecycle_state: snapshot.lifecycleState,
        archived_at: snapshot.archivedAt,
        archived_reason: snapshot.archivedReason,
      }).eq("feature_key", snapshot.featureKey).eq("id", snapshot.id)
        .eq("model_id", manifest.expectedBindingModels[snapshot.featureKey]).select("id");
      if (restored.error || !restored.data?.length) throw new Error(`还原 ${snapshot.featureKey} 原始配置失败`);
    } else {
      const removed = await db.from("ai_feature_bindings").delete().eq("feature_key", snapshot.featureKey)
        .eq("id", snapshot.id).eq("model_id", manifest.expectedBindingModels[snapshot.featureKey]).select("id");
      if (removed.error) throw new Error(`删除临时 ${snapshot.featureKey} 绑定失败`);
      if (!removed.data?.length) conflicts.push(`${snapshot.featureKey} 临时绑定未删除，可能已被并发修改`);
    }
  }
  if (!conflicts.length) removeManifest();
  return conflicts;
}

async function verifyAndCleanup(db: Db, manifest: DemoManifest, upstream: FakeUpstream): Promise<void> {
  try {
    await verifyProviderAddress(db, manifest);
    await verifyUpstreamDiscovery(db, manifest);
    await verifyFixtureStates(db);
    await verifyScenario(db, "normal");
    await runDiscoveryTests(db, manifest);
    await applyScenario(db, manifest, "outage");
    await verifyScenario(db, "outage");
    await applyScenario(db, manifest, "retrying");
    await verifyScenario(db, "retrying");
    await applyScenario(db, manifest, "normal");
    await verifyScenario(db, "normal");
    assert.ok(upstream.requests.some((request) => request.modelId === MODEL_IDS.find && request.status === 200), "假上游没有收到成功检测请求");
    assert.ok(upstream.requests.some((request) => request.modelId === MODEL_IDS.find && request.status === 404), "假上游没有收到失败检测请求");
    assert.throws(() => assertLoopbackHttpUrl("http://example.com:54321", "测试"));
    assert.throws(() => assertLoopbackHttpUrl("http://localhost:54321", "测试"));
    console.log("本地验证通过：状态场景、Claude Haiku 两种写法、找渠道成功/失败及非 127.0.0.1 拒绝均已核对。");
  } finally {
    const conflicts = await cleanupDemo(db, manifest);
    await closeServer(upstream.server);
    if (conflicts.length) throw new Error(`清理发现冲突：${conflicts.join("；")}`);
    console.log("演示数据库和原业务绑定已清理、还原。");
  }
}

async function seedDemo(db: Db, origin: string, upstreamBaseUrl: string): Promise<DemoManifest> {
  if (existsSync(statePath())) throw new Error("已有未清理的本地演示；先停止原演示并运行 --cleanup");
  await assertNoPrefixCollision(db);
  return createManifest(db, origin, upstreamBaseUrl);
}

function parseArgs(args: string[]) {
  const mode = args[0] ?? "--help";
  const scenarioArg = args.find((arg) => arg.startsWith("--scenario="))?.slice("--scenario=".length)
    ?? (args.includes("--scenario") ? args[args.indexOf("--scenario") + 1] : undefined);
  if (scenarioArg && !["normal", "outage", "retrying"].includes(scenarioArg)) {
    throw new Error("--scenario 只接受 normal、outage 或 retrying");
  }
  if (!scenarioArg && args.includes("--scenario")) throw new Error("--scenario 缺少取值");
  return { mode, scenario: (scenarioArg ?? "normal") as Scenario };
}

function showHelp(): void {
  console.log([
    "本地 AI 配置演示（数据库和假上游都只允许 127.0.0.1）",
    "",
    "  node --import tsx scripts/ai-config-local-demo.ts --verify          实际验收本地 Supabase 与假上游，结束后自动清理",
    "  node --import tsx scripts/ai-config-local-demo.ts --run             创建演示数据并持续运行；Ctrl+C 自动还原和清理",
    "  node --import tsx scripts/ai-config-local-demo.ts --scenario normal|outage|retrying",
    "  node --import tsx scripts/ai-config-local-demo.ts --cleanup         演示进程意外退出后恢复绑定并清理",
    "",
    "常驻演示期间用另一个终端运行 --scenario 切换业务状态；关闭演示终端后可用 --cleanup 清理。",
  ].join("\n"));
}

async function runPersistent(scenario: Scenario): Promise<void> {
  const { db, origin } = await connectLocalDb();
  const upstream = await startFakeUpstream();
  let manifest: DemoManifest | null = null;
  try {
    manifest = await seedDemo(db, origin, upstream.baseUrl);
    await verifyProviderAddress(db, manifest);
    await verifyUpstreamDiscovery(db, manifest);
    await verifyFixtureStates(db);
    await applyScenario(db, manifest, scenario);
    await verifyScenario(db, scenario);
  } catch (error) {
    await closeServer(upstream.server);
    if (manifest) {
      const conflicts = await cleanupDemo(db, manifest);
      if (conflicts.length) console.error(`自动清理冲突：${conflicts.join("；")}`);
    }
    throw error;
  }
  console.log(`演示已启动，当前场景：${scenario}。页面地址组：${manifest.providerName}。`);
  console.log("假上游只监听 127.0.0.1；保持本终端运行以供页面探测。另开终端可运行 --scenario outage/retrying/normal。");
  console.log("停止后会自动还原演示前的业务绑定并删除演示数据；异常退出时再运行 --cleanup。");
  await new Promise<void>((resolveStop) => {
    let stopping = false;
    const stop = async () => {
      if (stopping) return;
      stopping = true;
      process.off("SIGINT", stopSignal);
      process.off("SIGTERM", stopSignal);
      try {
        await closeServer(upstream.server);
        const conflicts = await cleanupDemo(db, readManifest() ?? manifest!);
        if (conflicts.length) throw new Error(conflicts.join("；"));
        console.log("演示数据已清理，原业务配置已还原。");
      } catch (error) {
        console.error(`清理未完成：${error instanceof Error ? error.message : "未知错误"}。请运行 --cleanup。`);
        process.exitCode = 1;
      }
      resolveStop();
    };
    const stopSignal = () => { void stop(); };
    process.on("SIGINT", stopSignal);
    process.on("SIGTERM", stopSignal);
  });
}

async function main(): Promise<void> {
  const { mode, scenario } = parseArgs(process.argv.slice(2));
  if (mode === "--help" || mode === "-h") return showHelp();
  if (!["--verify", "--run", "--scenario", "--cleanup"].includes(mode)) {
    throw new Error("参数不正确；运行 --help 查看用法");
  }
  if (mode === "--cleanup") {
    const { db } = await connectLocalDb();
    const manifest = readManifest();
    if (!manifest) return console.log("没有待清理的本地演示数据。");
    const conflicts = await cleanupDemo(db, manifest);
    if (conflicts.length) throw new Error(`清理发现冲突：${conflicts.join("；")}`);
    console.log("演示数据库和原业务绑定已清理、还原。");
    return;
  }
  if (mode === "--scenario") {
    const { db, origin } = await connectLocalDb();
    const manifest = readManifest();
    if (!manifest) throw new Error("没有正在进行的本地演示；先运行 --run");
    if (origin !== manifest.dbOrigin) throw new Error("当前数据库与演示状态文件不一致，没有修改配置");
    await applyScenario(db, manifest, scenario);
    await verifyScenario(db, scenario);
    console.log(`本地演示业务状态已切换为 ${scenario}。`);
    return;
  }
  if (mode === "--run") return runPersistent(scenario);

  const { db, origin } = await connectLocalDb();
  const upstream = await startFakeUpstream();
  let manifest: DemoManifest | null = null;
  try {
    manifest = await seedDemo(db, origin, upstream.baseUrl);
    await verifyAndCleanup(db, manifest, upstream);
  } catch (error) {
    if (manifest && existsSync(statePath())) {
      const conflicts = await cleanupDemo(db, manifest);
      if (conflicts.length) console.error(`自动清理冲突：${conflicts.join("；")}`);
    }
    await closeServer(upstream.server);
    throw error;
  }
}

const invokedDirectly = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (invokedDirectly) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "本地 AI 配置演示失败");
    process.exitCode = 1;
  });
}
