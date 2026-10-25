import assert from "node:assert/strict";
import test from "node:test";

import { buildComparisonMembersResponse } from "./route";

test("视频复盘成员选项包含同一 Supabase 项目内其他团队的在职成员", async () => {
  const actorScope = {
    userId: "actor-a",
    role: "member",
    permissions: { view_video_review: true },
    teamId: "team-a",
    kind: "self",
    visibleUserIds: ["actor-a"],
    activeVisibleUserIds: ["actor-a"],
  };
  let selectedIds: string[] = [];
  const query = {
    select: () => query,
    in: async (_column: string, ids: string[]) => {
      selectedIds = ids;
      return {
        data: [
          { id: "owner-b", name: "Team B 成员", membership_status: "active" },
          { id: "former-b", name: "已归档成员", membership_status: "archived" },
        ],
        error: null,
      };
    },
  };
  const response = await buildComparisonMembersResponse({
    requireAdminActor: async () => ({
      actor: { userId: "actor-a", role: "member", permissions: { view_video_review: true } },
      context: { scope: actorScope },
    }) as never,
    canAccessAdminPath: () => true,
    resolveVideoReviewReadOnlyScope: async (_client, scope) => ({
      ...scope,
      kind: "team",
      visibleUserIds: ["actor-a", "owner-b", "former-b"],
      activeVisibleUserIds: ["actor-a", "owner-b"],
    }),
    createAdminClient: () => ({ from: () => query }) as never,
    assertSupabaseQuerySucceeded: (error) => {
      if (error) throw new Error(error.message);
    },
  });

  assert.deepEqual(selectedIds, ["actor-a", "owner-b"]);
  assert.deepEqual((await response.json()).profiles, [{ id: "owner-b", name: "Team B 成员" }]);
});
