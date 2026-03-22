import test from "node:test";
import assert from "node:assert/strict";

// @ts-expect-error node test 直接加载 ts 模块
const loadModule = () => import("./豁免流程.ts").catch(() => null);

test("buildGrantDraft 将单日、多日、永久豁免转换为 grant 与 profile 投影", async () => {
  const mod = await loadModule();
  assert.ok(mod, "应提供 豁免流程 模块");
  assert.equal(typeof mod.buildGrantDraft, "function");

  const single = mod.buildGrantDraft({
    userId: "user-1",
    teamId: "team-1",
    mode: "single",
    reason: "外出",
    requestId: null,
    today: "2026-03-22",
  });

  assert.equal(single.grant.grant_type, "single");
  assert.equal(single.grant.start_date, "2026-03-22");
  assert.equal(single.grant.end_date, "2026-03-22");
  assert.equal(single.profile.exempt_type, "temporary");
  assert.equal(single.profile.exempt_start_date, "2026-03-22");
  assert.equal(single.profile.exempt_end_date, "2026-03-22");

  const multi = mod.buildGrantDraft({
    userId: "user-1",
    teamId: "team-1",
    mode: "4days",
    reason: "出差",
    requestId: "req-1",
    today: "2026-03-22",
  });

  assert.equal(multi.grant.request_id, "req-1");
  assert.equal(multi.grant.grant_type, "4days");
  assert.equal(multi.grant.start_date, "2026-03-22");
  assert.equal(multi.grant.end_date, "2026-03-25");
  assert.equal(multi.profile.exempt_type, "temporary");
  assert.equal(multi.profile.exempt_start_date, "2026-03-22");
  assert.equal(multi.profile.exempt_end_date, "2026-03-25");

  const permanent = mod.buildGrantDraft({
    userId: "user-1",
    teamId: "team-1",
    mode: "permanent",
    reason: "长期病假",
    requestId: null,
    today: "2026-03-22",
  });

  assert.equal(permanent.grant.grant_type, "permanent");
  assert.equal(permanent.grant.start_date, "2026-03-22");
  assert.equal(permanent.grant.end_date, null);
  assert.equal(permanent.profile.status, "exempt");
  assert.equal(permanent.profile.exempt_type, "permanent");
  assert.equal(permanent.profile.exempt_reason, "长期病假");
});

test("buildGrantDraft 对永久豁免缺少原因时报错", async () => {
  const mod = await loadModule();
  assert.ok(mod, "应提供 豁免流程 模块");
  assert.equal(typeof mod.buildGrantDraft, "function");

  assert.throws(
    () =>
      mod.buildGrantDraft({
        userId: "user-1",
        teamId: "team-1",
        mode: "permanent",
        reason: "   ",
        requestId: null,
        today: "2026-03-22",
      }),
    /永久豁免必须填写原因/,
  );
});

test("buildRequestDraft 生成待审批申请并计算日期范围", async () => {
  const mod = await loadModule();
  assert.ok(mod, "应提供 豁免流程 模块");
  assert.equal(typeof mod.buildRequestDraft, "function");

  const request = mod.buildRequestDraft({
    applicantUserId: "user-1",
    teamId: "team-1",
    mode: "5days",
    reason: "家中有事",
    today: "2026-03-22",
  });

  assert.equal(request.applicant_user_id, "user-1");
  assert.equal(request.team_id, "team-1");
  assert.equal(request.exemption_type, "5days");
  assert.equal(request.start_date, "2026-03-22");
  assert.equal(request.end_date, "2026-03-26");
  assert.equal(request.reason, "家中有事");
  assert.equal(request.request_status, "pending");
});

test("buildReviewPatch 为审批结果生成 request 更新补丁", async () => {
  const mod = await loadModule();
  assert.ok(mod, "应提供 豁免流程 模块");
  assert.equal(typeof mod.buildReviewPatch, "function");

  const approved = mod.buildReviewPatch({ reviewerId: "admin-1", decision: "approved" });
  assert.equal(approved.request_status, "approved");
  assert.equal(approved.reviewed_by, "admin-1");
  assert.match(String(approved.reviewed_at), /T/);

  const rejected = mod.buildReviewPatch({ reviewerId: "admin-2", decision: "rejected" });
  assert.equal(rejected.request_status, "rejected");
  assert.equal(rejected.reviewed_by, "admin-2");
  assert.match(String(rejected.reviewed_at), /T/);
});
