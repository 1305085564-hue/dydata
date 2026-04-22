import test from "node:test";
import assert from "node:assert/strict";

// @ts-expect-error node test 直接加载 ts 模块
const loadModule = async () => {
  const mod = await import("./豁免流程.ts").catch(() => null);
  if (!mod) return null;
  return (mod.default ?? mod) as typeof import("./豁免流程.ts");
};

test("buildGrantDraft 会把语义分类写入 grant 和 profile 投影", async () => {
  const mod = await loadModule();
  assert.ok(mod, "应提供 豁免流程 模块");
  assert.equal(typeof mod.buildGrantDraft, "function");

  const yesterday = mod.buildGrantDraft({
    userId: "user-1",
    teamId: "team-1",
    mode: "yesterday",
    category: "waive",
    reason: "休市",
    requestId: null,
    today: "2026-03-22",
  });

  assert.equal(yesterday.grant.grant_type, "yesterday");
  assert.equal(yesterday.grant.exemption_category, "waive");
  assert.equal(yesterday.profile.exemption_category, "waive");
  assert.equal(yesterday.profile.exempt_start_date, "2026-03-21");

  const multi = mod.buildGrantDraft({
    userId: "user-1",
    teamId: "team-1",
    mode: "range",
    category: "leave",
    reason: "病假",
    requestId: "req-1",
    today: "2026-03-22",
    startDate: "2026-03-24",
    endDate: "2026-03-26",
  });

  assert.equal(multi.grant.request_id, "req-1");
  assert.equal(multi.grant.grant_type, "range");
  assert.equal(multi.grant.exemption_category, "leave");
  assert.equal(multi.profile.exempt_type, "temporary");
  assert.equal(multi.profile.exemption_category, "leave");

  const permanent = mod.buildGrantDraft({
    userId: "user-1",
    teamId: "team-1",
    mode: "permanent",
    category: "waive",
    reason: "长期停更",
    requestId: null,
    today: "2026-03-22",
  });

  assert.equal(permanent.grant.grant_type, "permanent");
  assert.equal(permanent.profile.status, "exempt");
  assert.equal(permanent.profile.exemption_category, "waive");
});

test("buildGrantDraft 对永久豁免缺少原因时报错", async () => {
  const mod = await loadModule();
  assert.ok(mod, "应提供 豁免流程 模块");

  assert.throws(
    () =>
      mod.buildGrantDraft({
        userId: "user-1",
        teamId: "team-1",
        mode: "permanent",
        category: "waive",
        reason: "   ",
        requestId: null,
        today: "2026-03-22",
      }),
    /永久豁免必须填写原因/,
  );
});

test("buildRequestDraft 生成申请时保留语义分类", async () => {
  const mod = await loadModule();
  assert.ok(mod, "应提供 豁免流程 模块");

  const request = mod.buildRequestDraft({
    applicantUserId: "user-1",
    teamId: "team-1",
    mode: "range",
    category: "leave",
    reason: "家中有事",
    today: "2026-03-22",
    startDate: "2026-03-25",
    endDate: "2026-03-28",
  });

  assert.equal(request.applicant_user_id, "user-1");
  assert.equal(request.team_id, "team-1");
  assert.equal(request.exemption_type, "range");
  assert.equal(request.exemption_category, "leave");
  assert.equal(request.start_date, "2026-03-25");
  assert.equal(request.end_date, "2026-03-28");
  assert.equal(request.reason, "家中有事");
  assert.equal(request.request_status, "pending");
});

test("normalizeGrantMode 兼容旧模式", async () => {
  const mod = await loadModule();
  assert.ok(mod, "应提供 豁免流程 模块");
  assert.equal(mod.normalizeGrantMode("single"), "yesterday");
  assert.equal(mod.normalizeGrantMode("3days"), "range");
  assert.equal(mod.normalizeGrantMode("4days"), "range");
  assert.equal(mod.normalizeGrantMode("5days"), "range");
  assert.equal(mod.normalizeGrantMode("permanent"), "permanent");
});

test("buildReviewPatch 会生成审批补丁", async () => {
  const mod = await loadModule();
  assert.ok(mod, "应提供 豁免流程 模块");

  const approved = mod.buildReviewPatch({ reviewerId: "admin-1", decision: "approved" });
  assert.equal(approved.request_status, "approved");
  assert.equal(approved.reviewed_by, "admin-1");
  assert.match(String(approved.reviewed_at), /T/);

  const rejected = mod.buildReviewPatch({ reviewerId: "admin-2", decision: "rejected" });
  assert.equal(rejected.request_status, "rejected");
  assert.equal(rejected.reviewed_by, "admin-2");
  assert.match(String(rejected.reviewed_at), /T/);
});
