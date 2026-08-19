import assert from "node:assert/strict";
import test from "node:test";

import { buildPermissionRequestApplyResponse } from "./route";

function makeRequest(body: unknown) {
  return new Request("https://dydata.cc/api/permission-requests/apply", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function makeSupabaseClient(userId: string | null) {
  return {
    auth: {
      getUser: async () => ({ data: { user: userId ? { id: userId } : null } }),
    },
  } as unknown as Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>;
}

test("未登录调用返回 401，不发通知", async () => {
  let emitCalled = false;
  const res = await buildPermissionRequestApplyResponse(makeRequest({ moduleTitle: "转化中心" }), {
    createClient: async () => makeSupabaseClient(null),
    createAdminClient: () => ({}) as never,
    emit: async () => {
      emitCalled = true;
      return { ok: true, inserted: 0 };
    },
  });

  assert.equal(res.status, 401);
  assert.equal(emitCalled, false);
});

test("正常登录用户申请只通知同公司的可处理管理员", async () => {
  const emitInputs: Array<Record<string, unknown>> = [];
  const res = await buildPermissionRequestApplyResponse(
    makeRequest({ moduleTitle: "转化中心", currentPath: "/conversion-hub" }),
    {
      createClient: async () => makeSupabaseClient("member-1"),
      createAdminClient: () =>
        ({
          from: (table: string) => {
            if (table === "profiles") {
              return {
                select: () => ({
                  eq: (_col: string, val: string) => ({
                    single: async () => ({ data: { id: val, name: "组员小李", team_id: "team-a" }, error: null }),
                  }),
                  in: async () => ({
                    data: [
                      { id: "owner-1", role: "owner", permissions: {}, team_id: null },
                      { id: "archived-owner", role: "owner", permissions: {}, team_id: null, membership_status: "archived" },
                      { id: "same-team-admin", role: "admin", permissions: { manage_members: true }, team_id: "team-a" },
                      { id: "archived-admin", role: "admin", permissions: { manage_members: true }, team_id: "team-a", membership_status: "archived" },
                      { id: "other-team-admin", role: "admin", permissions: { manage_members: true }, team_id: "team-b" },
                      { id: "group-leader", role: "admin", permissions: { manage_members: false }, team_id: "team-a" },
                      { id: "member-1", role: "member", permissions: {}, team_id: "team-a" },
                    ],
                    error: null,
                  }),
                }),
              };
            }
            throw new Error(`unexpected table ${table}`);
          },
        }) as never,
      emit: async (input) => {
        emitInputs.push(input as unknown as Record<string, unknown>);
        return { ok: true, inserted: (input.recipients as string[]).length };
      },
    },
  );

  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.ok, true);
  assert.equal(emitInputs.length, 1);
  const emitted = emitInputs[0];
  assert.deepEqual(new Set(emitted.recipients as string[]), new Set(["same-team-admin"]));
  assert.equal(emitted.category, "todo");
  assert.equal(emitted.sourceType, "permission_request");
  assert.equal(emitted.sourceId, "member-1:转化中心");
  assert.equal(emitted.actionUrl, "/admin/modules?member=member-1");
});

test("归档管理员不会继续收到权限申请通知", async () => {
  const emitInputs: Array<Record<string, unknown>> = [];
  const res = await buildPermissionRequestApplyResponse(
    makeRequest({ moduleTitle: "转化中心" }),
    {
      createClient: async () => makeSupabaseClient("member-1"),
      createAdminClient: () =>
        ({
          from: (table: string) => {
            if (table === "profiles") {
              return {
                select: () => ({
                  eq: (_col: string, val: string) => ({
                    single: async () => ({ data: { id: val, name: "组员小李", team_id: "team-a" }, error: null }),
                  }),
                  in: async () => ({
                    data: [
                      { id: "owner-1", role: "owner", permissions: {}, team_id: null },
                      { id: "archived-owner", role: "owner", permissions: {}, team_id: null, membership_status: "archived" },
                      { id: "same-team-admin", role: "admin", permissions: { manage_members: true }, team_id: "team-a" },
                      { id: "archived-admin", role: "admin", permissions: { manage_members: true }, team_id: "team-a", membership_status: "archived" },
                    ],
                    error: null,
                  }),
                }),
              };
            }
            throw new Error(`unexpected table ${table}`);
          },
        }) as never,
      emit: async (input) => {
        emitInputs.push(input as unknown as Record<string, unknown>);
        return { ok: true, inserted: (input.recipients as string[]).length };
      },
    },
  );

  assert.equal(res.status, 200);
  assert.equal(emitInputs.length, 1);
  assert.deepEqual(new Set(emitInputs[0].recipients as string[]), new Set(["same-team-admin"]));
});

test("没有可通知的管理员时安全返回提示，不报 500", async () => {
  const res = await buildPermissionRequestApplyResponse(makeRequest({ moduleTitle: "转化中心" }), {
    createClient: async () => makeSupabaseClient("member-1"),
    createAdminClient: () =>
      ({
        from: () => ({
          select: () => ({
            eq: () => ({
              single: async () => ({ data: { id: "member-1", name: "组员小李" }, error: null }),
            }),
            in: async () => ({ data: [], error: null }),
          }),
        }),
      }) as never,
    emit: async () => {
      throw new Error("emit 不应被调用");
    },
  });

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.notified, 0);
  assert.ok(typeof body.warning === "string" && body.warning.length > 0);
});

test("重复申请使用稳定 sourceId，交给 emit 的 upsert 去重", async () => {
  const emitInputs: Array<Record<string, unknown>> = [];
  const deps = {
    createClient: async () => makeSupabaseClient("member-1"),
    createAdminClient: () =>
      ({
        from: () => ({
          select: () => ({
            eq: () => ({
              single: async () => ({ data: { id: "member-1", name: "组员小李" }, error: null }),
            }),
            in: async () => ({
              data: [{ id: "owner-1", role: "owner", permissions: {} }],
              error: null,
            }),
          }),
        }),
      }) as never,
    emit: async (input: Parameters<typeof import("@/lib/notifications/server").emit>[0]) => {
      emitInputs.push(input as unknown as Record<string, unknown>);
      return { ok: true, inserted: 1 };
    },
  };

  await buildPermissionRequestApplyResponse(makeRequest({ moduleTitle: "转化中心" }), deps);
  await buildPermissionRequestApplyResponse(makeRequest({ moduleTitle: "转化中心" }), deps);

  assert.equal(emitInputs.length, 2);
  assert.equal(emitInputs[0].sourceId, emitInputs[1].sourceId);
});

test("请求体缺少 moduleTitle 时返回 400，不调用 emit", async () => {
  let emitCalled = false;
  const res = await buildPermissionRequestApplyResponse(makeRequest({}), {
    createClient: async () => makeSupabaseClient("member-1"),
    createAdminClient: () => ({}) as never,
    emit: async () => {
      emitCalled = true;
      return { ok: true, inserted: 0 };
    },
  });

  assert.equal(res.status, 400);
  assert.equal(emitCalled, false);
});
