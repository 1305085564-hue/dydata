import assert from "node:assert/strict";
import test from "node:test";

import { resolveVideoReviewReadOnlyScope } from "@/lib/data-access-scope";
import type { DataAccessScope } from "@/lib/data-access-scope";

test("视频复盘只读范围保留本人和有归档快照的历史成员，排除从未有公司归属的人", async () => {
  const scope: DataAccessScope = {
    userId: "u1",
    role: "member",
    permissions: {},
    teamId: "team-A",
    kind: "self",
    visibleUserIds: ["u1"],
    activeVisibleUserIds: ["u1"],
  };
  const profiles = [
    { id: "u2", team_id: "team-B", membership_status: "active", archive_snapshot: null },
    { id: "u3", team_id: "team-C", membership_status: "active", archive_snapshot: null },
    { id: "u4", team_id: null, membership_status: "archived", archive_snapshot: { team_id: "team-D" } },
    { id: "never-affiliated", team_id: null, membership_status: "active", archive_snapshot: null, archived_by: null },
    { id: "archived-never-affiliated", team_id: null, membership_status: "archived", archive_snapshot: null, archived_by: null },
  ];
  const supabase = {
    from: () => ({ select: () => Promise.resolve({ data: profiles, error: null }) }),
  };

  const result = await resolveVideoReviewReadOnlyScope(supabase as never, scope);

  assert.equal(result.kind, "team");
  assert.deepEqual(result.visibleUserIds.sort(), ["u1", "u2", "u3", "u4"]);
  assert.deepEqual(result.activeVisibleUserIds?.sort(), ["u1", "u2", "u3"]);
});
