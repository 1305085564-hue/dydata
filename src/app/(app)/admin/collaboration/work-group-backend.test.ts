import assert from "node:assert/strict";
import test from "node:test";
import { assignWorkGroupMemberAction, assignWorkGroupMembersAction, unassignWorkGroupMemberAction } from "./work-group-actions";

test("collaboration assignment actions reject before any database or auth request", async () => {
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("Blocked actions must not issue external requests"); };
  try {
    for (const result of [
      await assignWorkGroupMemberAction({ groupId: "test-group", userId: "test-member" }),
      await unassignWorkGroupMemberAction({ groupId: "test-group", userId: "test-member" }),
      await assignWorkGroupMembersAction({ groupId: "test-group", userIds: ["test-member"] }),
    ]) assert.deepEqual(result, { ok: false, status: 403, message: "请在成员管理中调整小队" });
  } finally {
    globalThis.fetch = oldFetch;
  }
});
