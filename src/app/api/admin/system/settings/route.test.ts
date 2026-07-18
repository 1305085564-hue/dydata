import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAdminSystemSettingsGetResponse,
  buildAdminSystemSettingsPostResponse,
  parseSystemSettingsPayload,
} from "./route";

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
        actor: { role: "owner", businessRole: "owner", userId: "owner-1" },
      }) as never,
    requireOwnerOrTeamAdminRole: () => null,
  });

  assert.ok(response);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.feishuFulfillmentReminderEnabled, false);
});

test("admin system settings GET 在 system_settings 缺表时回退 ai_feature_config", async () => {
  const response = await buildAdminSystemSettingsGetResponse({
    requireAdminServiceClient: async () =>
      ({
        supabase: {
          from: (table: string) => {
            if (table === "system_settings") {
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
            }

            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: { is_enabled: true },
                    error: null,
                  }),
                }),
              }),
            };
          },
        },
        actor: { role: "owner", businessRole: "owner", userId: "owner-1" },
      }) as never,
    requireOwnerOrTeamAdminRole: () => null,
  });

  assert.ok(response);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.feishuFulfillmentReminderEnabled, true);
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
          actor: { role: "admin", businessRole: "team_admin", userId: "admin-1" },
        }) as never,
      requireOwnerOrTeamAdminRole: () => null,
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

test("admin system settings POST 在 system_settings 缺表时回退 ai_feature_config", async () => {
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
                if (table === "system_settings") {
                  return {
                    error: {
                      code: "PGRST205",
                      message: "Could not find the table 'public.system_settings' in the schema cache",
                    },
                  };
                }

                return { error: null };
              },
            }),
          },
          actor: { role: "admin", businessRole: "team_admin", userId: "admin-1" },
        }) as never,
      requireOwnerOrTeamAdminRole: () => null,
    },
  );

  assert.ok(response);
  assert.equal(response.status, 200);
  assert.equal(writes.length, 2);
  assert.equal(writes[0]?.table, "system_settings");
  assert.equal(writes[1]?.table, "ai_feature_config");
  assert.equal(writes[1]?.payload.feature_key, "feishu_fulfillment_reminder");
  assert.equal(writes[1]?.payload.is_enabled, false);
});
