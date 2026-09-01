import test from "node:test";
import assert from "node:assert/strict";

import {
  collectApprovalRequestIds,
  getCommandHubDefaultTab,
  removeReviewedApproval,
  resolveApprovalRequestId,
} from "./exemption-approvals";

const REQUEST_ID = "f130ee78-9d07-477e-a918-c7bbd43ff759";
const FALLBACK_ID = "2d7f1eab-9c4d-4b38-9631-a434543604dd";

test("resolveApprovalRequestId 优先使用 request_id", () => {
  assert.equal(
    resolveApprovalRequestId({
      id: "grant-row-1",
      request_id: REQUEST_ID,
    }),
    REQUEST_ID,
  );
});

test("resolveApprovalRequestId 在 id 合法时回退到 id", () => {
  assert.equal(
    resolveApprovalRequestId({
      id: FALLBACK_ID,
    }),
    FALLBACK_ID,
  );
});

test("collectApprovalRequestIds 过滤非法编号并去重", () => {
  assert.deepEqual(
    collectApprovalRequestIds([
      { id: "legacy-row", request_id: REQUEST_ID },
      { id: REQUEST_ID },
      { id: FALLBACK_ID },
      { id: "not-a-uuid" },
    ]),
    [REQUEST_ID, FALLBACK_ID],
  );
});

test("getCommandHubDefaultTab 按 待办 -> 审批 的顺序切换", () => {
  assert.equal(
    getCommandHubDefaultTab({ todoCount: 2, approvalCount: 5, isAdmin: true }),
    "todos",
  );
  assert.equal(
    getCommandHubDefaultTab({ todoCount: 0, approvalCount: 5, isAdmin: true }),
    "approvals",
  );
  assert.equal(
    getCommandHubDefaultTab({ todoCount: 0, approvalCount: 5, isAdmin: false }),
    "todos",
  );
});

test("removeReviewedApproval 只移除已完成审批的申请", () => {
  const approvals = [
    { id: REQUEST_ID },
    { id: FALLBACK_ID },
    { id: "legacy-row" },
  ];

  assert.deepEqual(removeReviewedApproval(approvals, REQUEST_ID), [
    { id: FALLBACK_ID },
    { id: "legacy-row" },
  ]);
});

import { groupPendingApprovals } from "@/components/unified-command-hub";

test("groupPendingApprovals 将同一申请人的连续请假归并为一张审批单", () => {
  const items = [
    {
      id: "f130ee78-9d07-477e-a918-c7bbd43ff751",
      applicant_user_id: "user-1",
      applicant_name: "张三",
      team_id: "team-1",
      team_name: "运营一组",
      exemption_type: "single",
      start_date: "2026-09-01",
      end_date: null,
      reason: "家中急事",
      request_status: "pending" as const,
      reviewed_by_name: null,
      reviewed_at: null,
      created_at: "2026-09-01T08:00:00.000Z",
    },
    {
      id: "f130ee78-9d07-477e-a918-c7bbd43ff752",
      applicant_user_id: "user-1",
      applicant_name: "张三",
      team_id: "team-1",
      team_name: "运营一组",
      exemption_type: "single",
      start_date: "2026-09-02",
      end_date: null,
      reason: "家中急事",
      request_status: "pending" as const,
      reviewed_by_name: null,
      reviewed_at: null,
      created_at: "2026-09-01T08:01:00.000Z",
    },
    {
      id: "f130ee78-9d07-477e-a918-c7bbd43ff753",
      applicant_user_id: "user-1",
      applicant_name: "张三",
      team_id: "team-1",
      team_name: "运营一组",
      exemption_type: "single",
      start_date: "2026-09-03",
      end_date: null,
      reason: "家中急事",
      request_status: "pending" as const,
      reviewed_by_name: null,
      reviewed_at: null,
      created_at: "2026-09-01T08:02:00.000Z",
    },
  ];

  const grouped = groupPendingApprovals(items);
  assert.equal(grouped.length, 1);
  assert.equal(grouped[0].applicant_name, "张三");
  assert.equal(grouped[0].categoryBadge, "请假3天");
  assert.equal(grouped[0].dateRangeText, "9月1日 至 9月3日");
  assert.equal(grouped[0].dayCount, 3);
  assert.deepEqual(grouped[0].requestIds, [
    "f130ee78-9d07-477e-a918-c7bbd43ff751",
    "f130ee78-9d07-477e-a918-c7bbd43ff752",
    "f130ee78-9d07-477e-a918-c7bbd43ff753",
  ]);
});

test("groupPendingApprovals 严格隔离同一用户的请假与永久豁免申请", () => {
  const items = [
    {
      id: "f130ee78-9d07-477e-a918-c7bbd43ff751",
      applicant_user_id: "user-1",
      applicant_name: "李四",
      team_id: "team-1",
      team_name: "运营一组",
      exemption_type: "single",
      start_date: "2026-09-01",
      end_date: null,
      reason: "病假调休",
      request_status: "pending" as const,
      reviewed_by_name: null,
      reviewed_at: null,
      created_at: "2026-09-01T08:00:00.000Z",
    },
    {
      id: "f130ee78-9d07-477e-a918-c7bbd43ff754",
      applicant_user_id: "user-1",
      applicant_name: "李四",
      team_id: "team-1",
      team_name: "运营一组",
      exemption_type: "permanent",
      start_date: "2026-09-01",
      end_date: null,
      reason: "长期特批免除",
      request_status: "pending" as const,
      reviewed_by_name: null,
      reviewed_at: null,
      created_at: "2026-09-01T08:05:00.000Z",
    },
  ];

  const grouped = groupPendingApprovals(items);
  assert.equal(grouped.length, 2);
  assert.equal(grouped[0].nature, "leave");
  assert.equal(grouped[0].categoryBadge, "请假1天");
  assert.equal(grouped[1].nature, "waive");
  assert.equal(grouped[1].categoryBadge, "永久豁免");
});

