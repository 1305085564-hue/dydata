import assert from "node:assert/strict";
import test from "node:test";

import { buildOperatorMemberOptions } from "./operator-members";

test("责任人候选保留人员身份，显示团队作为部门", () => {
  assert.deepEqual(
    buildOperatorMemberOptions(
      [
        { id: "user-1", name: "小陈", team_id: "team-1" },
        { id: "user-2", name: "小林", team_id: "team-1" },
      ],
      [{ id: "team-1", name: "内容一部" }],
    ),
    [
      { id: "user-1", name: "小陈", display_name: "小陈", department: "内容一部", team_id: "team-1" },
      { id: "user-2", name: "小林", display_name: "小林", department: "内容一部", team_id: "team-1" },
    ],
  );
});
