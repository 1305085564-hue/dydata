import assert from "node:assert/strict";
import test from "node:test";

import { resolveVideoReviewReadOnlyScope } from "@/lib/data-access-scope";
import type { DataAccessScope } from "@/lib/data-access-scope";

test("视频复盘成员只读范围覆盖当前 Supabase 项目内所有团队", async () => {
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
    { id: "u1", membership_status: "active" },
    { id: "u2", membership_status: "active" },
    { id: "u3", membership_status: "active" },
    { id: "u4", membership_status: "archived" },
  ];
  const supabase = {
    from: () => ({ select: () => Promise.resolve({ data: profiles, error: null }) }),
  };

  const result = await resolveVideoReviewReadOnlyScope(supabase as never, scope);

  assert.equal(result.kind, "team");
  assert.deepEqual(result.visibleUserIds.sort(), ["u1", "u2", "u3", "u4"]);
  assert.deepEqual(result.activeVisibleUserIds?.sort(), ["u1", "u2", "u3"]);
});
