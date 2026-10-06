import assert from "node:assert/strict";
import test from "node:test";

import { createOperatorMembersLoader } from "./operator-members";

test("operator member loader shares a successful response and preserves the API shape", async () => {
  const members = [
    {
      id: "member-1",
      name: "成员一",
      display_name: "成员一",
      department: "内容组",
      team_id: "team-1",
    },
  ];
  let calls = 0;
  const loadMembers = createOperatorMembersLoader(async () => {
    calls += 1;
    return new Response(JSON.stringify({ members }), { status: 200 });
  });

  assert.deepEqual(await loadMembers.load(), members);
  assert.deepEqual(await loadMembers.load(), members);
  assert.equal(calls, 1);
});

test("operator member loader returns an empty list on a failed request and retries later", async () => {
  let calls = 0;
  const loadMembers = createOperatorMembersLoader(async () => {
    calls += 1;
    if (calls === 1) return new Response("服务不可用", { status: 503 });
    return new Response(JSON.stringify({ members: [] }), { status: 200 });
  });

  assert.deepEqual(await loadMembers.load(), []);
  assert.deepEqual(await loadMembers.load(), []);
  assert.equal(calls, 2);
});
