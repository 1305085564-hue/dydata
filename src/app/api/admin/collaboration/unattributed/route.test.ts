import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";

import { buildUnattributedResponse } from "../handlers";
import { resolveCollaborationScope } from "@/lib/data-access-scope";

const actorId = "123e4567-e89b-42d3-a456-426614174001";
const teammateId = "123e4567-e89b-42d3-a456-426614174002";
const archivedTeammateId = "123e4567-e89b-42d3-a456-426614174003";
const outsiderId = "123e4567-e89b-42d3-a456-426614174004";

/** 最小 profiles 假客户端：支持 loadCompanyVisibleRows 用到的 select / eq 链。 */
function makeFakeSupabase(rows: Array<{
  id: string;
  team_id?: string | null;
  membership_status?: string | null;
  archive_snapshot?: { team_id?: string | null } | null;
}>) {
  function builder() {
    let filtered = [...rows];
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: (col: string, val: string) => {
        filtered = filtered.filter((r) => r[col as keyof typeof r] === val);
        return chain;
      },
      then: (resolve: (v: { data: typeof filtered; error: null }) => void) =>
        resolve({ data: filtered, error: null }),
    };
    return chain as typeof chain & { then: typeof chain.then };
  }
  return { from: () => builder() };
}

const companyRows = [
  { id: actorId, team_id: "company-1", membership_status: "active" },
  { id: teammateId, team_id: "company-1", membership_status: "active" },
  { id: outsiderId, team_id: "company-2", membership_status: "active" },
  { id: archivedTeammateId, team_id: null, membership_status: "archived", archive_snapshot: { team_id: "company-1" } },
];

const memberScope = {
  userId: actorId,
  role: "member" as const,
  permissions: {},
  teamId: "company-1",
  kind: "self" as const,
  visibleUserIds: [actorId],
};

function request() {
  return new NextRequest("https://dydata.cc/api/admin/collaboration/unattributed?year=2026&month=9");
}

test("待补归属弹窗范围与首屏同源：组员放宽为本公司可见成员", async () => {
  const supabase = makeFakeSupabase(companyRows);
  let datasetVisibleUserIds: string[] | null = null;

  const response = await buildUnattributedResponse(request(), {
    requireAdminActor: async () => ({
      supabase: supabase as never,
      actor: {
        userId: actorId,
        role: "member",
        permissions: { view_analytics: true },
        name: "组员甲",
        dataScope: "self" as const,
      },
    }),
    buildPermissionContextForActor: async () => ({
      permissionInfo: {} as never,
      scope: memberScope as never,
    }),
    createAdminClient: () => supabase as never,
    resolveCollaborationScope,
    loadCollaborationMonthDataset: async (input: { visibleUserIds: string[] }) => {
      datasetVisibleUserIds = input.visibleUserIds;
      return {
        currentRows: [],
        profiles: [
          { id: teammateId, name: "同事甲" },
          { id: archivedTeammateId, name: "归档同事" },
          { id: outsiderId, name: "他司成员" },
        ],
        accounts: [],
      } as never;
    },
    buildUnattributedReports: () => [],
  });

  assert.equal(response.status, 200);
  // 数据集范围 = 本公司全体可见成员（含归档行），排除他司成员
  assert.deepEqual(
    [...(datasetVisibleUserIds ?? [])].sort(),
    [actorId, archivedTeammateId, teammateId].sort(),
  );
  // 同源断言：接口传给数据集的范围与首屏（页面容器）解析结果完全一致
  const pageResolution = await resolveCollaborationScope(supabase as never, memberScope as never);
  assert.deepEqual(datasetVisibleUserIds, pageResolution.visibleUserIds);

  const body = (await response.json()) as {
    ok: boolean;
    candidateMembers: Array<{ id: string; name: string }>;
  };
  assert.equal(body.ok, true);
  // 候选成员按 activeVisibleUserIds 过滤：归档成员不可指派
  assert.deepEqual(body.candidateMembers, [{ id: teammateId, name: "同事甲" }]);
});
