import test from "node:test";
import assert from "node:assert/strict";

import { buildSidebarBadgesResponse } from "./route";
import { ADMIN_FIRST_SCREEN_BUDGETS } from "@/lib/admin-first-screen-contract";
import type { UserPermissionInfo } from "@/lib/permissions";
import type { CurrentPermissionContext } from "@/lib/current-permission-context";

function buildAuth(scopeKind: "all" | "team" = "all") {
  const permissionInfo: UserPermissionInfo = {
    userId: "owner-1",
    role: "owner",
    permissions: {},
    name: "Owner",
    dataScope: "all" as const,
    teamId: null,
  };
  const scope: CurrentPermissionContext["scope"] = {
    userId: "owner-1",
    role: "owner",
    permissions: {},
    teamId: scopeKind === "all" ? null : "team-1",
    kind: scopeKind,
    visibleUserIds: ["u-1", "u-2", "archived-user"],
    activeVisibleUserIds: ["u-1", "u-2"],
  };
  return {
    supabase: {
      rpc(name: string) {
        if (name !== "admin_sidebar_badges_summary") {
          throw new Error(`unexpected rpc ${name}`);
        }
        return Promise.resolve({
          data: {
            cockpit: scopeKind === "all" ? 12 : 4,
            videos: scopeKind === "all" ? 3 : 1,
            content: 1,
            conversion_hub: scopeKind === "all" ? 7 : 1,
            ai_channels: 0,
          },
          error: null,
        });
      },
    } as never,
    actor: {
      userId: "owner-1",
      role: "owner" as const,
      permissions: {},
      name: "Owner",
      dataScope: "all" as const,
    },
    permissionInfo,
    scope,
  };
}

test("sidebar-badges 改走单 summary RPC，不再 route 内 fan-out 查表", async () => {
  let calls = 0;
  const response = await buildSidebarBadgesResponse(
    { nextUrl: new URL("https://example.com/api/admin/sidebar-badges?date=2026-05-25") } as never,
    {
      requireAdminServiceClient: async () => ({
        ...buildAuth("team"),
        supabase: {
          rpc(name: string) {
            calls += 1;
            assert.equal(name, "admin_sidebar_badges_summary");
            return Promise.resolve({
              data: { cockpit: 4, videos: 1, content: 1, conversion_hub: 1, ai_channels: 0 },
              error: null,
            });
          },
        } as never,
      }),
      recordObservation: async () => undefined,
    },
  );

  if (!response) throw new Error("sidebar-badges response missing");
  assert.equal(response.status, 200);
  assert.equal(calls, 1);
  assert.deepEqual(await response.json(), {
    cockpit: 4,
    videos: 1,
    content: 1,
    conversion_hub: 1,
    ai_channels: 0,
  });
});

test("sidebar-badges owner 全局视角直接复用 summary 输出", async () => {
  let receivedUserIds: string[] | null = null;
  const response = await buildSidebarBadgesResponse(
    { nextUrl: new URL("https://example.com/api/admin/sidebar-badges?date=2026-05-25") } as never,
    {
      requireAdminServiceClient: async () => ({
        ...buildAuth("all"),
        supabase: {
          rpc(name: string, args: { p_visible_user_ids: string[] }) {
            assert.equal(name, "admin_sidebar_badges_summary");
            receivedUserIds = args.p_visible_user_ids;
            return Promise.resolve({
              data: { cockpit: 12, videos: 3, content: 1, conversion_hub: 7, ai_channels: 0 },
              error: null,
            });
          },
        } as never,
      }),
      recordObservation: async () => undefined,
    },
  );

  if (!response) throw new Error("sidebar-badges response missing");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    cockpit: 12,
    videos: 3,
    content: 1,
    conversion_hub: 7,
    ai_channels: 0,
  });
  assert.deepEqual(receivedUserIds, ["u-1", "u-2"]);
});

test("sidebar-badges 同一用户同一范围 60 秒内复用内存缓存", async () => {
  let calls = 0;
  const deps = {
    requireAdminServiceClient: async () => ({
      ...buildAuth("all"),
      actor: {
        userId: "owner-cache",
        role: "owner" as const,
        permissions: {},
        name: "Owner",
        dataScope: "all" as const,
      },
      scope: {
        ...buildAuth("all").scope,
        userId: "owner-cache",
      },
      supabase: {
        rpc(name: string) {
          calls += 1;
          assert.equal(name, "admin_sidebar_badges_summary");
          return Promise.resolve({
            data: { cockpit: 12, videos: 3, content: 1, conversion_hub: 7, ai_channels: 0 },
            error: null,
          });
        },
      } as never,
    }),
    recordObservation: async () => undefined,
  } satisfies Parameters<typeof buildSidebarBadgesResponse>[1];

  const request = { nextUrl: new URL("https://example.com/api/admin/sidebar-badges?date=2026-05-28") };
  const first = await buildSidebarBadgesResponse(request as never, deps);
  const second = await buildSidebarBadgesResponse(request as never, deps);

  if (!first || !second) throw new Error("sidebar-badges response missing");
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(calls, 1);
  assert.deepEqual(await second.json(), {
    cockpit: 12,
    videos: 3,
    content: 1,
    conversion_hub: 7,
    ai_channels: 0,
  });
});

test("sidebar-badges 首屏预算固定，并且响应带 Server-Timing", async () => {
  const response = await buildSidebarBadgesResponse(
    {
      nextUrl: new URL("https://example.com/api/admin/sidebar-badges?date=2026-05-29"),
    } as never,
    {
      requireAdminServiceClient: async () => buildAuth("all"),
      recordObservation: async () => undefined,
    },
  );

  if (!response) throw new Error("sidebar-badges response missing");
  assert.equal(response.status, 200);
  assert.equal(ADMIN_FIRST_SCREEN_BUDGETS.sidebarBadges.warnTotalMs, 1200);
  assert.match(response.headers.get("server-timing") ?? "", /auth;dur=/);
  assert.match(response.headers.get("server-timing") ?? "", /context;dur=/);
  assert.match(response.headers.get("server-timing") ?? "", /data;dur=/);
  assert.match(response.headers.get("server-timing") ?? "", /total;dur=/);
});
