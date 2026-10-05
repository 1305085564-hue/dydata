import assert from "node:assert/strict";
import test from "node:test";

import { NextResponse } from "next/server";

import {
  requireActiveTeamContext,
  TEAM_MEMBERSHIP_REQUIRED,
} from "./_shared";

function responseFor(error: string, code?: string, status = 403) {
  return NextResponse.json(code ? { error, code } : { error }, { status });
}

function contextFor(membershipStatus: unknown, teamId: string | null) {
  return {
    ok: true as const,
    context: {
      userId: "member-alias",
      supabase: {} as never,
      permissionContext: {
        permissionInfo: { membershipStatus, teamId },
        scope: {} as never,
      },
    } as never,
  };
}

test("active team membership 守卫按身份返回明确结果", async () => {
  const identities = [
    {
      label: "未登录",
      expectedStatus: 401,
      expectedBody: { error: "未登录" },
      auth: () => ({ ok: false as const, response: responseFor("未登录", undefined, 401) }),
    },
    {
      label: "未入团 active",
      expectedStatus: 403,
      expectedBody: { error: "请先申请加入团队", code: TEAM_MEMBERSHIP_REQUIRED },
      auth: () => contextFor("active", null),
    },
    {
      label: "archived",
      expectedStatus: 403,
      expectedBody: { error: "用户权限范围加载失败" },
      auth: () => ({ ok: false as const, response: responseFor("用户权限范围加载失败") }),
    },
    {
      label: "已入团 member",
      expectedStatus: null,
      expectedBody: null,
      auth: () => contextFor("active", "team-alias"),
    },
  ] as const;

  for (const identity of identities) {
    const result = await requireActiveTeamContext({
      requireTopicsContext: async () => identity.auth(),
      loadTeamScope: async (_supabase, scope) => scope,
    });

    if (identity.expectedStatus === null) {
      assert.equal(result.ok, true, `${identity.label} 应放行`);
      continue;
    }

    assert.equal(result.ok, false, `${identity.label} 应拒绝`);
    if (result.ok) continue;
    assert.equal(result.response.status, identity.expectedStatus);
    assert.deepEqual(await result.response.json(), identity.expectedBody);
  }
});

test("active team membership 守卫不会把未知状态或空 profile 当成 active", async () => {
  for (const profile of [
    { membershipStatus: "pending", teamId: "team-alias" },
    { membershipStatus: undefined, teamId: "team-alias" },
    { membershipStatus: "active", teamId: null },
  ]) {
    const result = await requireActiveTeamContext({
      requireTopicsContext: async () => contextFor(profile.membershipStatus, profile.teamId),
      loadTeamScope: async (_supabase, scope) => scope,
    });

    assert.equal(result.ok, false);
    if (result.ok) continue;
    assert.equal(result.response.status, 403);
    assert.deepEqual(await result.response.json(), {
      error: "请先申请加入团队",
      code: TEAM_MEMBERSHIP_REQUIRED,
    });
  }
});
