import test from "node:test";
import assert from "node:assert/strict";

import { buildExecuteToolResponse } from "./route";

function buildAuth(supabase: unknown) {
  return {
    supabase: supabase as never,
    actor: {
      userId: "admin-1",
      role: "admin" as const,
      businessRole: "team_admin" as const,
      permissions: {
        edit_data: true,
        manage_members: true,
        view_all_data: true,
      },
      name: "负责人",
    },
  };
}

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
