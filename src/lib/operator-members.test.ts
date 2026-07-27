import assert from "node:assert/strict";
import test from "node:test";

import { buildOperatorMemberOptions } from "./operator-members";

test("责任人候选保留人员身份，并优先显示分组作为部门", () => {
  assert.deepEqual(
    buildOperatorMemberOptions(
      [
        { id: "user-1", name: "小陈", team_id: "team-1", group_id: "group-1" },
        { id: "user-2", name: "小林", team_id: "team-1", group_id: null },
      ],
      [{ id: "team-1", name: "内容一部" }],
      [{ id: "group-1", name: "短视频组", team_id: "team-1" }],
    ),
    [
      { id: "user-1", name: "小陈", display_name: "小陈", department: "短视频组", team_id: "team-1", group_id: "group-1" },
      { id: "user-2", name: "小林", display_name: "小林", department: "内容一部", team_id: "team-1", group_id: null },
    ],
  );
});
