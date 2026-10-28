import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";

import { buildPersonResponse } from "../handlers";
import { resolveCollaborationScope } from "@/lib/data-access-scope";
import { DEFAULT_EVALUATION_STANDARDS } from "@/lib/evaluation-standards";

test("access_level=1 的成员不能查看他人的个人卡", async () => {
  let loadCalled = false;
  const response = await buildPersonResponse(
    new NextRequest(
      "https://dydata.cc/api/admin/collaboration/person?userId=123e4567-e89b-42d3-a456-426614174002&year=2026&month=7",
    ),
    {
      requireAdminActor: async () => ({
        supabase: {} as never,
        actor: {
          userId: "123e4567-e89b-42d3-a456-426614174001",
          role: "member",
          permissions: { view_analytics: true },
          name: "成员甲",
          dataScope: "team" as const,
        },
      }),
      buildPermissionContextForActor: async () => ({
        permissionInfo: {} as never,
        scope: {
          visibleUserIds: ["123e4567-e89b-42d3-a456-426614174001"],
        } as never,
      }),
      createAdminClient: () => ({}) as never,
      resolveCollaborationScope,
      readEvaluationStandards: async () => DEFAULT_EVALUATION_STANDARDS,
      loadPersonData: async () => {
        loadCalled = true;
        return {} as never;
      },
    },
  );

  assert.equal(response.status, 403);
  assert.equal(loadCalled, false);
});

test("个人卡接口校验岗位参数并将有效岗位传给数据加载器", async () => {
  let receivedRole: string | undefined;
  let receivedTeamId: string | null | undefined;
  let receivedStandards: unknown;
  const evaluationStandards = structuredClone(DEFAULT_EVALUATION_STANDARDS);
  const deps = {
    requireAdminActor: async () => ({
      supabase: {} as never,
      actor: {
        userId: "123e4567-e89b-42d3-a456-426614174001",
        role: "admin",
        permissions: { view_analytics: true },
        name: "管理员",
        dataScope: "team" as const,
      },
    }),
    buildPermissionContextForActor: async () => ({ permissionInfo: {} as never, scope: { teamId: "trusted-team", visibleUserIds: ["123e4567-e89b-42d3-a456-426614174002"] } as never }),
    createAdminClient: () => ({}) as never,
    resolveCollaborationScope: async () => ({ visibleUserIds: ["123e4567-e89b-42d3-a456-426614174002"] }),
    readEvaluationStandards: async (teamId: string | null | undefined) => {
      receivedTeamId = teamId;
      return evaluationStandards;
    },
    loadPersonData: async (input: { role?: string; evaluationStandards?: unknown }) => {
      receivedRole = input.role;
      receivedStandards = input.evaluationStandards;
      return { growthWorks: [] } as never;
    },
  };
  const url = "https://dydata.cc/api/admin/collaboration/person?userId=123e4567-e89b-42d3-a456-426614174002&year=2026&month=9";

  const invalid = await buildPersonResponse(new NextRequest(`${url}&role=unknown`), deps as never);
  assert.equal(invalid.status, 400);

  const valid = await buildPersonResponse(new NextRequest(`${url}&role=operators`), deps as never);
  assert.equal(valid.status, 200);
  assert.equal(receivedRole, "operators");
  assert.equal(receivedTeamId, "trusted-team");
  assert.strictEqual(receivedStandards, evaluationStandards);
});
