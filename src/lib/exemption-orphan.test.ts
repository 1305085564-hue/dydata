import assert from "node:assert/strict";
import test from "node:test";

import {
  ORPHAN_EXEMPTION_REVIEW_NOTE,
  buildOrphanRejectionAuditEntry,
  buildOrphanRejectionAuditDetail,
  filterOrphanExemptionRequests,
  getOrdinaryQueueVisibleApplicantIds,
  resolveOrphanMutationPreflight,
} from "./exemption-orphan";

const baseRow = {
  id: "request-a",
  applicant_user_id: "applicant-a",
  team_id: "team-a",
  exemption_type: "single",
  exemption_category: "waive",
  start_date: "2026-08-29",
  end_date: null,
  reason: "测试原因",
  request_status: "pending",
  created_at: "2026-08-29T01:00:00.000Z",
};

test("孤立申请只保留 pending 且当前申请人未分配团队的记录", () => {
  const result = filterOrphanExemptionRequests({
    rows: [
      baseRow,
      { ...baseRow, id: "request-assigned", applicant_user_id: "applicant-assigned" },
      { ...baseRow, id: "request-done", applicant_user_id: "applicant-done", request_status: "rejected" },
    ],
    profiles: [
      { id: "applicant-a", name: "成员A", team_id: null, membership_status: "active" },
      { id: "applicant-assigned", name: "成员B", team_id: "team-a", membership_status: "active" },
      { id: "applicant-done", name: "成员C", team_id: null, membership_status: "active" },
    ],
    teams: [{ id: "team-a", name: "验收团队A" }],
    scope: { kind: "team", teamId: "team-a" },
    ordinaryVisibleApplicantIds: new Set(),
  });

  assert.equal(result.count, 1);
  assert.deepEqual(result.data.map((row) => row.id), ["request-a"]);
  assert.equal(result.data[0]?.snapshot_team_name, "验收团队A");
  assert.equal(result.data[0]?.applicant_name, "成员A");
});

test("孤立申请排除普通队列已经可见的申请，防止重复计数", () => {
  const result = filterOrphanExemptionRequests({
    rows: [
      baseRow,
      { ...baseRow, id: "request-visible", applicant_user_id: "applicant-visible" },
    ],
    profiles: [
      { id: "applicant-a", name: "成员A", team_id: null, membership_status: "active" },
      { id: "applicant-visible", name: "成员B", team_id: null, membership_status: "active" },
    ],
    teams: [{ id: "team-a", name: "验收团队A" }],
    scope: { kind: "team", teamId: "team-a" },
    ordinaryVisibleApplicantIds: new Set(["applicant-visible"]),
  });

  assert.deepEqual(result.data.map((row) => row.id), ["request-a"]);
  assert.equal(result.count, 1);
});

test("集团范围不按申请快照团队截断，仍以普通队列可见集合做互斥", () => {
  const rows = [
    baseRow,
    { ...baseRow, id: "request-b", applicant_user_id: "applicant-b", team_id: "team-b" },
  ];
  const ordinaryIds = getOrdinaryQueueVisibleApplicantIds(rows, {
    kind: "all",
    teamId: "team-a",
  });

  assert.deepEqual([...ordinaryIds], ["applicant-a", "applicant-b"]);

  const result = filterOrphanExemptionRequests({
    rows,
    profiles: [
      { id: "applicant-a", name: "成员A", team_id: null, membership_status: "active" },
      { id: "applicant-b", name: "成员B", team_id: null, membership_status: "archived" },
    ],
    teams: [
      { id: "team-a", name: "验收团队A" },
      { id: "team-b", name: "验收团队B" },
    ],
    scope: { kind: "all", teamId: "team-a" },
    ordinaryVisibleApplicantIds: new Set(["ordinary-member"]),
  });

  assert.deepEqual(result.data.map((row) => row.id), ["request-a", "request-b"]);
});

test("归属处理动作实时重查：归档/注销只能拒绝，已分配成员不能继续走孤立入口", () => {
  const scope = { kind: "team" as const, teamId: "team-a" };
  const request = { applicant_user_id: "applicant-a", request_status: "pending", team_id: "team-a" };

  assert.deepEqual(
    resolveOrphanMutationPreflight({
      action: "assign",
      request,
      applicant: { team_id: null, membership_status: "archived" },
      actorScope: scope,
    }),
    { ok: false, error: "已归档或已注销的申请人只能拒绝并留痕" },
  );
  assert.deepEqual(
    resolveOrphanMutationPreflight({
      action: "reject",
      request,
      applicant: { team_id: null, membership_status: "archived" },
      actorScope: scope,
    }),
    { ok: true },
  );
  assert.deepEqual(
    resolveOrphanMutationPreflight({
      action: "reject",
      request,
      applicant: { team_id: "team-a", membership_status: "active" },
      actorScope: scope,
    }),
    { ok: false, error: "申请人已分配团队，请刷新后从普通队列处理" },
  );
});

test("拒绝孤立申请的审计详情保留固定 review_note，不把申请原因当作备注", () => {
  const detail = buildOrphanRejectionAuditDetail({
    applicantUserId: "applicant-a",
    applicantMembershipStatus: "active",
    snapshotTeamId: "team-a",
  });
  const parsed = JSON.parse(detail) as Record<string, unknown>;

  assert.equal(parsed.review_note, ORPHAN_EXEMPTION_REVIEW_NOTE);
  assert.equal(parsed.applicant_user_id, "applicant-a");
  assert.equal(parsed.snapshot_team_id, "team-a");
  assert.doesNotMatch(detail, /测试原因/);
});

test("孤立申请拒绝动作使用稳定的审计动作和申请编号", () => {
  const entry = buildOrphanRejectionAuditEntry({
    requestId: "request-a",
    applicantUserId: "applicant-a",
    applicantMembershipStatus: "active",
    snapshotTeamId: "team-a",
  });

  assert.equal(entry.action, "reject_orphan_exemption_request");
  assert.equal(entry.target, "request-a");
  assert.equal(JSON.parse(entry.detail).review_note, ORPHAN_EXEMPTION_REVIEW_NOTE);
});
