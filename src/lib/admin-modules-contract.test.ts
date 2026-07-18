import test from "node:test";
import assert from "node:assert/strict";

import { buildAdminModuleMemberSummaries, hydrateAdminModuleMemberEmails } from "./admin-modules-contract";

test("成员摘要补齐团队名、默认权限和空邮箱", () => {
  const result = buildAdminModuleMemberSummaries(
    [{ id: "user-1", name: "小陈", role: "member", team_id: "team-1", permissions: null }],
    [{ id: "team-1", name: "一队" }],
  );

  assert.equal(result[0]?.team_name, "一队");
  assert.equal(result[0]?.email, null);
  assert.equal(result[0]?.status, null);
});

test("空数组返回空，邮箱补全只覆盖命中成员", () => {
  assert.deepEqual(buildAdminModuleMemberSummaries([], []), []);
  const members = buildAdminModuleMemberSummaries([{ id: "u1", name: "甲", role: "member" }], []);
  assert.equal(hydrateAdminModuleMemberEmails(members, { u1: "a@example.com" })[0]?.email, "a@example.com");
  assert.strictEqual(hydrateAdminModuleMemberEmails(members, {} )[0], members[0]);
});
