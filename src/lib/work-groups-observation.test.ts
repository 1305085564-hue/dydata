import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { assignWorkGroupMembers } from "./work-groups";

function makeFailureClient() {
  return {
    from(table: string) {
      const data = table === "work_groups"
        ? { id: "group-writer-1", team_id: "team-a", name: "文案一组", kind: "writer", created_at: null, created_by: "owner" }
        : { id: "member-other-team", name: "跨公司成员", team_id: "team-b", work_peer_group_id: null, work_operator_group_id: null };
      const query = { eq: () => query, maybeSingle: async () => ({ data, error: null }) };
      return { select: () => query };
    },
  } as unknown as SupabaseClient;
}

test("批量分配：失败结果经统一 mutation 观测出口落结构化记录", async () => {
  const logs: Array<Record<string, unknown>> = [];
  const result = await assignWorkGroupMembers(makeFailureClient(), {
    actorId: "user-owner", actorTeamId: "team-a", groupId: "group-writer-1",
    userIds: ["member-other-team", "member-archived"],
  }, {
    createRequestId: () => "123e4567-e89b-42d3-a456-426614174000",
    log: (entry) => logs.push(entry as unknown as Record<string, unknown>), capture: () => undefined,
  });

  assert.equal(result.ok, false);
  assert.equal(logs.length, 1);
  assert.equal(logs[0]?.route, "/api/admin/collaboration/assign-work-group-members");
  assert.equal(logs[0]?.requestId, "123e4567-e89b-42d3-a456-426614174000");
  assert.equal(logs[0]?.outcome, "failed");
  assert.equal((logs[0]?.detail as Record<string, unknown>)?.resultCode, "ALL_FAILED");
});
