import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildAiKeyPatch } from "@/lib/ai-config/key-patch";
import { NextRequest } from "next/server";
import { boundedInteger, buildAiConfigResponse, buildProbeRequestBody } from "./route";

test("视觉模型试跑发送图片消息，文本连通测试保持文本消息", () => {
  const vision = buildProbeRequestBody("gemini-2.5-flash", "vision");
  const visionContent = vision.messages[0].content;
  assert.ok(Array.isArray(visionContent));
  assert.equal(visionContent[1]?.type, "image_url");
  assert.deepEqual(vision.response_format, { type: "json_object" });

  const text = buildProbeRequestBody("gemini-2.5-flash", "text");
  assert.equal(text.messages[0].content, "hi");
  assert.equal("response_format" in text, false);
});

test("截图识别试跑复用业务调用，不接受页面指定的旧渠道", async () => {
  const fake = createDeleteKeyTestClient({ targetKeyId: "unused", hasBackup: true });
  let invoked = false;
  const response = await buildAiConfigResponse(new NextRequest("http://localhost/api/admin/ai-config", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "test_key", data: { feature_key: "ocr_screenshot", key_id: "old-channel" } }),
  }), {
    requireSystemActor: async () => ({ supabase: fake.client as never, actor: { userId: "admin-1", role: "owner" } as never }),
    probeAiFeature: async (feature, options) => {
      invoked = true;
      assert.equal(feature, "ocr_screenshot");
      assert.equal(options.jsonMode, true);
      assert.ok(Array.isArray(options.messages[0].content));
      return { content: '{"ok":true}', model: "actual-model", channelName: "actual-provider", elapsedMs: 12 };
    },
  });
  assert.equal(response.status, 200);
  assert.equal(invoked, true);
  assert.equal((await response.json()).testResult.model, "actual-model");
});

const source = readFileSync(new URL("./route.ts", import.meta.url), "utf8");

test("更新 AI Key 时空 api_key 不进入写入 patch", () => {
  assert.deepEqual(
    buildAiKeyPatch({ id: "key-1", label: "新名称", api_key: "   " }, "update"),
    { label: "新名称" },
  );
  assert.match(source, /buildAiKeyPatch\(data, action\)/);
});

test("全局顺位修改被拒绝，要求在模型内调整", () => {
  assert.throws(() => buildAiKeyPatch({ priority: 20 }, "update"), /对应模型/);
});

test("高级参数边界拒绝越界值并保留默认值", () => {
  assert.equal(boundedInteger(undefined, "最大输出 Token", 1200, 8000, 3600), 3600);
  assert.equal(boundedInteger("2400", "最大输出 Token", 1200, 8000, 3600), 2400);
  assert.throws(() => boundedInteger(1199, "最大输出 Token", 1200, 8000, 3600), /1200-8000/);
  assert.throws(() => boundedInteger(51, "上下文轮数", 1, 50, 30), /1-50/);
  assert.throws(() => boundedInteger("12abc", "上下文轮数", 1, 50, 30), /1-50/);
});

test("AI 功能总控只接受系统目录中的保存、归档和恢复动作", () => {
  assert.match(source, /"save_feature_control"/);
  assert.match(source, /"archive_feature"/);
  assert.match(source, /"restore_feature"/);
  assert.match(source, /buildAiFeatureControls/);
  assert.match(source, /getAiFeatureCatalogEntry/);
});

test("路由入口保持 Next 框架签名，测试注入口只挂在独立函数上", () => {
  // 回归锁：POST 的第二参是框架传进来的 context，不能被测试注入口占用（历史改法见 6197b9f2）
  const postSignature = (source.match(/export async function POST\([^)]*\)/) ?? [""])[0];
  assert.equal(postSignature, "export async function POST(request: NextRequest)");
  assert.match(source, /export async function buildAiConfigResponse\(/);
});

function createDeleteKeyTestClient(options: {
  targetKeyId: string;
  hasBackup: boolean;
}) {
  let keyDeleted = false;
  let keyModelDeleted = false;

  const client = {
    from(table: string) {
      const allRows: Record<string, Record<string, unknown>[]> = {
        ai_providers: [{ id: "provider", is_enabled: true }],
        ai_provider_keys: [{ id: options.targetKeyId, provider_id: "provider", is_enabled: true }, ...(options.hasBackup ? [{ id: "key-backup", provider_id: "provider", is_enabled: true }] : [])],
        ai_provider_key_models: [{ id: "km-exclusive", key_id: options.targetKeyId, model_id: "claude-3-5-sonnet", is_enabled: true, global_is_enabled: true }, ...(options.hasBackup ? [{ id: "km-backup", key_id: "key-backup", model_id: "claude-3-5-sonnet", is_enabled: true, global_is_enabled: true }] : [])],
        ai_feature_bindings: [{ id: "binding-1", feature_key: "next_day_review", label: "次日复盘", model_id: "claude-3-5-sonnet", provider_key_model_id: "km-exclusive", is_enabled: true, lifecycle_state: "active" }],
      };
      let rows = allRows[table] ?? [];
      let removing = false;
      const query = {
        select() { return query; },
        order() { return query; },
        delete() { removing = true; return query; },
        eq(field: string, value: unknown) { rows = rows.filter((row) => row[field] === value); return query; },
        neq(field: string, value: unknown) { rows = rows.filter((row) => row[field] !== value); return query; },
        then(resolve: (value: unknown) => unknown) {
          if (removing && table === "ai_provider_keys") keyDeleted = true;
          if (removing && table === "ai_provider_key_models") keyModelDeleted = true;
          return Promise.resolve({ data: rows, error: null }).then(resolve);
        },
      };
      return query;
    },
  };

  return {
    client,
    wasKeyDeleted: () => keyDeleted,
    wasKeyModelDeleted: () => keyModelDeleted,
  };
}

test("服务端删除密钥强阻断：独占引用的 key 执行删除返回 409 且未落库删除", async () => {
  const fake = createDeleteKeyTestClient({ targetKeyId: "key-exclusive", hasBackup: false });

  const req = new NextRequest("http://localhost/api/admin/ai-config", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      action: "delete",
      entity: "key",
      data: { id: "key-exclusive" },
    }),
  });

  const res = await buildAiConfigResponse(req, {
    requireSystemActor: async () => ({
      supabase: fake.client as never,
      actor: { userId: "admin-1", role: "owner" } as never,
    }),
  });

  assert.equal(res.status, 409);
  const json = await res.json();
  assert.match(json.error, /该密钥正被【次日复盘】使用且无备用模型，禁止删除/);
  assert.equal(fake.wasKeyDeleted(), false);
  assert.equal(fake.wasKeyModelDeleted(), false);
});

test("服务端删除密钥强阻断：有备用模型的 key 正常放行删除", async () => {
  const fake = createDeleteKeyTestClient({ targetKeyId: "key-with-backup", hasBackup: true });

  const req = new NextRequest("http://localhost/api/admin/ai-config", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      action: "delete",
      entity: "key",
      data: { id: "key-with-backup" },
    }),
  });

  const res = await buildAiConfigResponse(req, {
    requireSystemActor: async () => ({
      supabase: fake.client as never,
      actor: { userId: "admin-1", role: "owner" } as never,
    }),
  });

  assert.equal(res.status, 200);
  assert.equal(fake.wasKeyDeleted(), true);
  assert.equal(fake.wasKeyModelDeleted(), true);
});
