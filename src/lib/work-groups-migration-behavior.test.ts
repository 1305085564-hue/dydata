import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  assignWorkGroupMember,
  createWorkGroup,
  deleteWorkGroup,
  renameWorkGroup,
  unassignWorkGroupMember,
} from "./work-groups";

const ACTOR = "user-owner";
const TEAM_A = "team-a";

function missingSchemaClient() {
  const error = { code: "42P01", message: "relation work_groups does not exist" };
  const query = {
    select() { return query; },
    eq() { return query; },
    maybeSingle: async () => ({ data: null, error }),
  };
  return { from: () => query } as unknown as SupabaseClient;
}

test("写操作：未跑 migration 时统一返回 503，而不是伪装成功", async () => {
  const expected = { ok: false, status: 503, message: "工种小队功能尚未上线" } as const;

  const create = await createWorkGroup(missingSchemaClient(), {
    actorId: ACTOR, actorTeamId: TEAM_A, name: "文案三组", kind: "writer",
  });
  assert.deepEqual(create, expected);

  const rename = await renameWorkGroup(missingSchemaClient(), {
    actorId: ACTOR, actorTeamId: TEAM_A, groupId: "group-writer-1", name: "文案一组（新）",
  });
  assert.deepEqual(rename, expected);

  const remove = await deleteWorkGroup(missingSchemaClient(), {
    actorId: ACTOR, actorTeamId: TEAM_A, groupId: "group-writer-1",
  });
  assert.deepEqual(remove, expected);

  const assign = await assignWorkGroupMember(missingSchemaClient(), {
    actorId: ACTOR, actorTeamId: TEAM_A, groupId: "group-writer-1", userId: "member-a",
  });
  assert.deepEqual(assign, expected);

  const unassign = await unassignWorkGroupMember(missingSchemaClient(), {
    actorId: ACTOR, actorTeamId: TEAM_A, groupId: "group-writer-1", userId: "member-a",
  });
  assert.deepEqual(unassign, expected);
});
