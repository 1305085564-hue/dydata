import test from "node:test";
import assert from "node:assert/strict";

import { applyAdminModuleMonthlyPublishStats, buildAdminModuleMemberSummaries, calculateAdminModuleMonthlyPublishStats, hydrateAdminModuleMemberEmails } from "./admin-modules-contract";

test("成员摘要补齐团队名、保留原始权限和空邮箱", () => {
  const result = buildAdminModuleMemberSummaries(
    [{ id: "user-1", name: "小陈", role: "member", team_id: "team-1", permissions: null }],
    [{ id: "team-1", name: "一队" }],
  );

  assert.equal(result[0]?.team_name, "一队");
  assert.equal(result[0]?.email, null);
  assert.equal(result[0]?.status, null);
  assert.deepEqual(result[0]?.permissions, {});
});

test("空数组返回空，邮箱补全只覆盖命中成员", () => {
  assert.deepEqual(buildAdminModuleMemberSummaries([], []), []);
  const members = buildAdminModuleMemberSummaries([{ id: "u1", name: "甲", role: "member" }], []);
  assert.equal(hydrateAdminModuleMemberEmails(members, { u1: "a@example.com" })[0]?.email, "a@example.com");
  assert.strictEqual(hydrateAdminModuleMemberEmails(members, {} )[0], members[0]);
});


test("本月发布统计按用户聚合发布天数和作品条数", () => {
  const stats = calculateAdminModuleMonthlyPublishStats([
    { user_id: "u1", report_date: "2026-08-01" },
    { user_id: "u1", report_date: "2026-08-01" },
    { user_id: "u1", report_date: "2026-08-02" },
    { user_id: "u2", report_date: "2026-08-03" },
    { user_id: null, report_date: "2026-08-03" },
  ]);

  assert.deepEqual(stats, {
    u1: { publishedDays: 2, publishedCount: 3 },
    u2: { publishedDays: 1, publishedCount: 1 },
  });
});

test("本月发布统计回填到成员摘要，未发布成员默认为 0", () => {
  const members = buildAdminModuleMemberSummaries([
    { id: "u1", name: "甲", role: "member" },
    { id: "u2", name: "乙", role: "member" },
  ], []);

  const hydrated = applyAdminModuleMonthlyPublishStats(members, {
    u1: { publishedDays: 12, publishedCount: 18 },
  });

  assert.equal(hydrated[0]?.monthly_published_days, 12);
  assert.equal(hydrated[0]?.monthly_published_count, 18);
  assert.equal(hydrated[1]?.monthly_published_days, 0);
  assert.equal(hydrated[1]?.monthly_published_count, 0);
});
