import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAdminSystemSettingsGetResponse,
  buildAdminSystemSettingsPostResponse,
  parseSystemSettingsPayload,
} from "./route";
import { requireSystemPermission } from "../../fulfillment/_shared";
import { fixedPermissionsForRole, runtimeRoleForCompanyRole } from "@/lib/company-permissions";

function systemSettingsAuth(companyRole: "member" | "admin" | "company_owner") {
  return {
    supabase: {
      from: () => ({
        upsert: async () => ({ error: null }),
      }),
    },
    actor: {
      userId: `${companyRole}-1`,
      role: runtimeRoleForCompanyRole(companyRole),
      companyRole,
      permissions: fixedPermissionsForRole(companyRole),
      name: null,
      dataScope: companyRole === "member" ? "self" : "team",
    },
  } as never;
}

test("system settings payload 只接受 boolean", () => {
  const invalid = parseSystemSettingsPayload({ feishuFulfillmentReminderEnabled: "true" });
  assert.equal("response" in invalid && invalid.response.status, 400);

  const valid = parseSystemSettingsPayload({ feishuFulfillmentReminderEnabled: false });
  assert.deepEqual("data" in valid && valid.data, {
    feishuFulfillmentReminderEnabled: false,
  });
});

test("admin system settings GET 返回当前履约飞书开关", async () => {
  const response = await buildAdminSystemSettingsGetResponse({
    requireAdminServiceClient: async () =>
      ({
        supabase: {
          from: () => ({
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { value: false },
                  error: null,
                }),
              }),
            }),
          }),
        },
        actor: { role: "owner", userId: "owner-1" },
      }) as never,
    requireSystemPermission: () => null,
  });

  assert.ok(response);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.feishuFulfillmentReminderEnabled, false);
});

test("admin system settings GET 缺少系统配置表时明确失败，不读取旧 AI 配置", async () => {
  const readTables: string[] = [];
  const response = await buildAdminSystemSettingsGetResponse({
    requireAdminServiceClient: async () =>
      ({
        supabase: {
          from: (table: string) => {
            readTables.push(table);
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: null,
                    error: {
                      code: "PGRST205",
                      message: "Could not find the table 'public.system_settings' in the schema cache",
                    },
                  }),
                }),
              }),
            };
          },
        },
        actor: { role: "owner", userId: "owner-1" },
      }) as never,
    requireSystemPermission: () => null,
  });

  assert.ok(response);
  assert.equal(response.status, 500);
  assert.deepEqual(readTables, ["system_settings"]);
});

test("admin system settings POST 写入开关", async () => {
  let upsertedPayload: Record<string, unknown> | null = null;

  const response = await buildAdminSystemSettingsPostResponse(
    new Request("https://dydata.cc/api/admin/system/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ feishuFulfillmentReminderEnabled: true }),
    }),
    {
      requireAdminServiceClient: async () =>
        ({
          supabase: {
            from: () => ({
              upsert: async (payload: Record<string, unknown>) => {
                upsertedPayload = payload;
                return { error: null };
              },
            }),
          },
          actor: { role: "admin", userId: "admin-1" },
        }) as never,
      requireSystemPermission: () => null,
    },
  );

  assert.ok(response);
  assert.equal(response.status, 200);
  assert.ok(upsertedPayload);
  const savedPayload = upsertedPayload as unknown as Record<string, unknown>;
  assert.equal(savedPayload["key"], "feishu_fulfillment_reminder_enabled");
  assert.equal(savedPayload["value"], true);

  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.feishuFulfillmentReminderEnabled, true);
});

test("admin system settings POST 缺少系统配置表时明确失败，不写入旧 AI 配置", async () => {
  const writes: Array<{ table: string; payload: Record<string, unknown> }> = [];

  const response = await buildAdminSystemSettingsPostResponse(
    new Request("https://dydata.cc/api/admin/system/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ feishuFulfillmentReminderEnabled: false }),
    }),
    {
      requireAdminServiceClient: async () =>
        ({
          supabase: {
            from: (table: string) => ({
              upsert: async (payload: Record<string, unknown>) => {
                writes.push({ table, payload });
                return {
                  error: {
                    code: "PGRST205",
                    message: "Could not find the table 'public.system_settings' in the schema cache",
                  },
                };
              },
            }),
          },
          actor: { role: "admin", userId: "admin-1" },
        }) as never,
      requireSystemPermission: () => null,
    },
  );

  assert.ok(response);
  assert.equal(response.status, 500);
  assert.equal(writes.length, 1);
  assert.equal(writes[0]?.table, "system_settings");
});

test("系统设置 POST 只允许公司所有者，管理员和成员收到真实的 403 响应", async () => {
  for (const [companyRole, expectedStatus] of [
    ["company_owner", 200],
    ["admin", 403],
    ["member", 403],
  ] as const) {
    const response = await buildAdminSystemSettingsPostResponse(
      new Request("https://dydata.cc/api/admin/system/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ feishuFulfillmentReminderEnabled: true }),
      }),
      {
        requireAdminServiceClient: async () => systemSettingsAuth(companyRole),
        requireSystemPermission,
      },
    );

    assert.ok(response);
    assert.equal(response.status, expectedStatus, companyRole);
  }
});
