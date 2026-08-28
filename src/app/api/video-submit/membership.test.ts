import assert from "node:assert/strict";
import test from "node:test";

import { resolveVideoSubmitMembershipResponse } from "./membership";

test("video-submit 拒绝未入团 active 成员且返回稳定错误码", async () => {
  const response = resolveVideoSubmitMembershipResponse({
    membership_status: "active",
    team_id: null,
  });

  assert.ok(response);
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), {
    error: "请先申请加入团队",
    code: "TEAM_MEMBERSHIP_REQUIRED",
  });
});

test("video-submit 保留 archived 账号既有 403 语义", async () => {
  const response = resolveVideoSubmitMembershipResponse({
    membership_status: "archived",
    team_id: null,
  });

  assert.ok(response);
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: "已归档账号不能提交视频" });
});

test("已入团 active 成员通过 video-submit membership 闸门", () => {
  assert.equal(
    resolveVideoSubmitMembershipResponse({
      membership_status: "active",
      team_id: "team-alias",
    }),
    null,
  );
});
