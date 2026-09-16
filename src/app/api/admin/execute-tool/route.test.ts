import test from "node:test";
import assert from "node:assert/strict";

import { buildExecuteToolResponse } from "./route";
import type { Permissions } from "@/types";

function buildAuth(supabase: unknown, permissions: Permissions = { manage_members: true, use_ai_assist: true, manage_system: true }) {
  return {
    supabase: supabase as never,
    actor: {
      userId: "admin-1",
      role: "admin" as const,
      companyRole: "company_owner" as const,
      groupMode: true,
      activeVisibleUserIds: ["admin-1"],
      permissions,
      name: "负责人",
      dataScope: "all" as const,
    },
  };
}

test("execute-tool 在入口拒绝没有 AI 管理权限的组员", async () => {
  let executed = false;
  const auth = buildAuth({}, { view_analytics: true });
  const response = await buildExecuteToolResponse(
    { toolName: "getTaskStatus", toolArgs: { taskType: "daily_review" } },
    {
      requireAdminActor: async () => ({ ...auth, actor: { ...auth.actor, role: "member" as const, companyRole: "member" as const } }),
      executeAdminTool: async () => { executed = true; return { success: true }; },
      shouldRequireConfirmation: () => false,
    },
  );
  assert.equal(response.status, 403);
  assert.equal(executed, false);
});

test("execute-tool 在入口拒绝伪带 AI 权限的非所有者", async () => {
  let executed = false;
  const auth = buildAuth({});
  const response = await buildExecuteToolResponse(
    { toolName: "diagnoseIssue", toolArgs: { symptom: "任务卡住" } },
    {
      requireAdminActor: async () => ({ ...auth, actor: { ...auth.actor, companyRole: "admin" as const } }),
      executeAdminTool: async () => { executed = true; return { success: true }; },
      shouldRequireConfirmation: () => false,
    },
  );
  assert.equal(response.status, 403);
  assert.equal(executed, false);
});

test("execute-tool 高风险工具先返回 confirmation token", async () => {
  const response = await buildExecuteToolResponse(
    {
      toolName: "clearCache",
      toolArgs: { cacheType: "all" },
    },
    {
      requireAdminActor: async () =>
        buildAuth({
          from() {
            return {
              insert() {
                return {
                  select() {
                    return {
                      async single() {
                        return { data: { id: "confirm-1" }, error: null };
                      },
                    };
                  },
                };
              },
            };
          },
        }),
      executeAdminTool: async () => ({
        success: true,
        data: { cacheType: "all" },
        beforeSnapshot: { cacheType: "all" },
      }),
      shouldRequireConfirmation: () => true,
    },
  );

  assert.equal(response.status, 409);
  const payload = await response.json();
  assert.equal(payload.confirmationToken, "confirm-1");
  assert.equal(payload.success, false);
});

test("execute-tool 带 confirmation token 时执行待确认动作", async () => {
  let updated = false;
  const response = await buildExecuteToolResponse(
    {
      toolName: "",
      confirmationToken: "confirm-1",
    },
    {
      requireAdminActor: async () =>
        buildAuth({
          from() {
            return {
              select() {
                return this;
              },
              eq() {
                return this;
              },
              async single() {
                return {
                  data: {
                    id: "confirm-1",
                    admin_id: "admin-1",
                    tool_name: "clearCache",
                    tool_params: { cacheType: "all" },
                    requires_confirmation: true,
                    result: "pending_confirm",
                  },
                  error: null,
                };
              },
              update() {
                return {
                  eq() {
                    updated = true;
                    return Promise.resolve({ error: null });
                  },
                };
              },
            };
          },
        }),
      executeAdminTool: async () => ({
        success: true,
        data: { cacheType: "all" },
      }),
      shouldRequireConfirmation: () => false,
    },
  );

  assert.equal(response.status, 200);
  assert.equal(updated, true);
  const payload = await response.json();
  assert.equal(payload.success, true);
});
