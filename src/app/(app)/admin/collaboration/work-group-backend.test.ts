import assert from "node:assert/strict";
import test from "node:test";
import { assignWorkGroupMemberAction, assignWorkGroupMembersAction, unassignWorkGroupMemberAction } from "./work-group-actions";

test("public-only CloudBase mode rejects every collaboration assignment before any database or auth request", async () => {
  const previous = [process.env.DYDATA_BACKEND, process.env.NEXT_PUBLIC_DYDATA_BACKEND];
  const oldFetch = globalThis.fetch;
  delete process.env.DYDATA_BACKEND;
  process.env.NEXT_PUBLIC_DYDATA_BACKEND = "cloudbase";
  globalThis.fetch = async () => { throw new Error("Blocked actions must not issue external requests"); };
  try {
    for (const result of [
      await assignWorkGroupMemberAction({ groupId: "test-group", userId: "test-member" }),
      await unassignWorkGroupMemberAction({ groupId: "test-group", userId: "test-member" }),
      await assignWorkGroupMembersAction({ groupId: "test-group", userIds: ["test-member"] }),
    ]) assert.deepEqual(result, { ok: false, status: 403, message: "请在成员管理中调整小队" });
  } finally {
    globalThis.fetch = oldFetch;
    ["DYDATA_BACKEND", "NEXT_PUBLIC_DYDATA_BACKEND"].forEach((key, i) => { if (previous[i] === undefined) delete process.env[key]; else process.env[key] = previous[i]; });
  }
});
