import assert from "node:assert/strict";
import test from "node:test";
import { createCloudBaseDataClient } from "@/lib/cloudbase/data-client";
import { NextRequest } from "next/server";
import { saveOwnProfileName } from "@/lib/account-updates";
import { handleSetModelEnabled } from "@/lib/ai-config/batch-actions";
import { renameWorkGroup } from "@/lib/work-groups";
import { toggleTopicLibrary } from "@/lib/topics/library";
import { buildAiConfigResponse } from "./admin/ai-config/route";
import { buildExecuteToolResponse } from "./admin/execute-tool/route";

type Row = Record<string, unknown>;

// 使用真实查询SDK，只替换HTTP数据库边界，保留maybeSingle/精确计数/分页语义。
function database(tables: Record<string, Row[]>, updated: Row[], updatedCount = updated.length) {
  return createCloudBaseDataClient({
    role: "browser",
    fetcher: async (input, init) => {
      const url = new URL(String(input), "https://db.invalid");
      const table = url.pathname.split("/").at(-1)!;
      const headers = new Headers(init?.headers);
      const isUpdate = init?.method === "PATCH";
      const offset = Number(url.searchParams.get("offset") ?? 0);
      const limit = Number(url.searchParams.get("limit") ?? 1000);
      const rows = isUpdate ? updated : (tables[table] ?? []).slice(offset, offset + limit);
      const body = headers.get("accept")?.includes("vnd.pgrst.object") ? rows[0] ?? null : rows;
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json", "content-range": `0-${Math.max(rows.length - 1, 0)}/${isUpdate ? updatedCount : (tables[table] ?? []).length}` },
      });
    },
  });
}

test("显示名称保存命中零行时明确失败；命中本人资料时保持保存成功", async () => {
  assert.match((await saveOwnProfileName(database({}, []), "user-1", "新名称")).error ?? "", /未保存/);
  assert.deepEqual(await saveOwnProfileName(database({}, [{ id: "user-1" }]), "user-1", "新名称"), { success: true });
});

test("管理员保存已删除的接入点返回404，不返回配置保存成功", async () => {
  const db = database({}, []);
  const response = await buildAiConfigResponse(new NextRequest("https://example.com/api/admin/ai-config", {
    method: "POST", body: JSON.stringify({ action: "update", entity: "provider", data: { id: "missing", name: "改名" } }),
  }), {
    requireSystemActor: async () => ({ supabase: db, actor: { userId: "owner-1" } }) as never,
    createAdminClient: () => db as never,
  });
  assert.equal(response.status, 404);
  assert.match((await response.json()).error, /不存在|已被删除/);
});

test("管理员确认执行后记录被并发删除或处理：返回409且明确结果未能登记", async () => {
  const supabase = database({ admin_actions: [{
    id: "confirm-1", admin_id: "owner-1", tool_name: "getTaskStatus", tool_params: {}, requires_confirmation: true, result: "pending_confirm",
  }] }, []);
  const response = await buildExecuteToolResponse({ toolName: "", confirmationToken: "confirm-1" }, {
    requireAdminActor: async () => ({
      supabase,
      actor: { userId: "owner-1", role: "owner", companyRole: "company_owner", permissions: { use_ai_assist: true }, activeVisibleUserIds: ["owner-1"] },
    }) as never,
    executeAdminTool: async () => ({ success: true }),
    shouldRequireConfirmation: () => false,
  });
  assert.equal(response.status, 409);
  const body = await response.json();
  assert.equal(body.success, false);
  assert.match(body.error, /执行结果未能登记/);
});

const supplies = (count: number) => Array.from({ length: count }, (_, i) => ({ id: `supply-${i}`, is_enabled: false, disabled_by_model: true }));

for (const count of [0, 1]) {
  test(`批量恢复模型预计更新2条但仅命中${count}条：明确冲突，不宣称全部生效`, async () => {
    await assert.rejects(handleSetModelEnabled(database({ ai_provider_key_models: supplies(2) }, supplies(count)), {
      model_id: "model-a", is_enabled: true,
    }), (error: unknown) => (error as { status: number }).status === 409);
  });
}

test("已删除模型无供应时返回404；供应无需变化时保持幂等成功", async () => {
  await assert.rejects(handleSetModelEnabled(database({}, []), { model_id: "model-a", is_enabled: true }),
    (error: unknown) => (error as { status: number }).status === 404);
  const result = await handleSetModelEnabled(database({ ai_provider_key_models: [{ id: "supply-1", is_enabled: true, disabled_by_model: false }] }, []), {
    model_id: "model-a", is_enabled: true,
  });
  assert.equal(result.changedSupplyCount, 0);
});

test("1500条供应跨页读取完整；更新回传仅1000条但精确计数1500时仍正确确认全量生效", async () => {
  const result = await handleSetModelEnabled(database({ ai_provider_key_models: supplies(1500) }, supplies(1000), 1500), {
    model_id: "model-a", is_enabled: true,
  });
  assert.equal(result.changedSupplyCount, 1500);
  assert.equal(result.affectedCount, 1500);
});

function rollbackDatabase(row: Row) {
  let writes = 0;
  return createCloudBaseDataClient({
    role: "browser",
    fetcher: async (input, init) => {
      const url = new URL(String(input), "https://db.invalid");
      const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
      if (url.pathname.includes("/rpc/")) return reply({ code: "PGRST202", message: "migration pending" }, 404);
      if (url.pathname.endsWith("/audit_logs")) return reply({ message: "audit unavailable" }, 500);
      if (init?.method === "PATCH") {
        writes += 1;
        if (writes > 1) {
          return new Headers(init.headers).get("accept")?.includes("vnd.pgrst.object")
            ? reply({ code: "PGRST116", message: "zero rows" }, 406)
            : reply([]);
        }
        return reply(row);
      }
      return reply(url.searchParams.has("name") ? [] : [row]);
    },
  });
}

test("小队改名审计失败且回滚命中零行：明确回滚未完成，不能声称已回滚", async () => {
  const result = await renameWorkGroup(rollbackDatabase({ id: "group-1", team_id: "team-1", name: "旧小队", kind: "writer" }), {
    actorId: "owner-1", actorTeamId: "team-1", groupId: "group-1", name: "新小队",
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.message, /回滚未完成/);
});

test("旧库兼容选题移出遇到审计失败且回滚零行：明确回滚未完成", async (context) => {
  context.mock.method(console, "error", () => {});
  const result = await toggleTopicLibrary(rollbackDatabase({ id: "topic-1", title: "选题", library_status: "in_library" }), {
    actorId: "owner-1", subTopicId: "topic-1", action: "remove",
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.message, /回滚未完成/);
});
