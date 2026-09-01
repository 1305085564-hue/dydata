import test from "node:test";
import assert from "node:assert/strict";

import {
  collectApprovalRequestIds,
  getCommandHubDefaultTab,
  removeReviewedApproval,
  resolveApprovalRequestId,
  restoreApprovalItems,
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

test("restoreApprovalItems 把失败/撤回的申请插回列表头部并去重", () => {
  const existingId = "2d7f1eab-9c4d-4b38-9631-a434543604dd";
  const current = [{ id: existingId }];
  const toRestore = [
    { id: REQUEST_ID },
    { id: existingId }, // 已在列表中（合法 uuid），跳过
    { id: "not-a-uuid" }, // 无有效编号，仍保留（防丢）
  ];
  const restored = restoreApprovalItems(current, toRestore);

  assert.equal(restored.length, 2);
  assert.deepEqual(restored.map((item) => item.id), [REQUEST_ID, "not-a-uuid"]);
});

test("restoreApprovalItems 空列表不产生内容", () => {
  assert.deepEqual(restoreApprovalItems([{ id: "a" }], []), []);
  assert.deepEqual(restoreApprovalItems([], []), []);
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
      exemption_category: "leave" as const,
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
      exemption_category: "leave" as const,
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
      exemption_category: "leave" as const,
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

test("groupPendingApprovals 严格按 exemption_category 隔离同一用户的请假与永久豁免申请", () => {
  const items = [
    {
      id: "f130ee78-9d07-477e-a918-c7bbd43ff751",
      applicant_user_id: "user-1",
      applicant_name: "李四",
      team_id: "team-1",
      team_name: "运营一组",
      exemption_type: "single",
      exemption_category: "leave" as const,
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
      exemption_category: "waive" as const,
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

test("groupPendingApprovals 非永久也按 exemption_category 区分请假与免交", () => {
  const items = [
    {
      id: "f130ee78-9d07-477e-a918-c7bbd43ff761",
      applicant_user_id: "user-2",
      applicant_name: "王五",
      team_id: "team-1",
      team_name: "运营一组",
      exemption_type: "range",
      exemption_category: "waive" as const,
      start_date: "2026-09-05",
      end_date: "2026-09-07",
      reason: "数据波动免交",
      request_status: "pending" as const,
      reviewed_by_name: null,
      reviewed_at: null,
      created_at: "2026-09-01T08:00:00.000Z",
    },
  ];

  const grouped = groupPendingApprovals(items);
  assert.equal(grouped.length, 1);
  assert.equal(grouped[0].nature, "waive");
  assert.equal(grouped[0].categoryBadge, "免交3天");
  assert.equal(grouped[0].dayCount, 3);
  assert.equal(grouped[0].dateRangeText, "9月5日 至 9月7日");
});

test("groupPendingApprovals 区间重叠/相邻按完整日期并集折叠，跨区间不误并", () => {
  // 9-01~9-02 与 9-02~9-04 相邻重叠 → 并集 9-01..9-04 连续 4 天
  const overlapping = [
    {
      id: "f130ee78-9d07-477e-a918-c7bbd43ff771",
      applicant_user_id: "user-3",
      applicant_name: "赵六",
      team_id: "team-1",
      team_name: "运营一组",
      exemption_type: "range",
      exemption_category: "leave" as const,
      start_date: "2026-09-01",
      end_date: "2026-09-02",
      reason: "探亲",
      request_status: "pending" as const,
      reviewed_by_name: null,
      reviewed_at: null,
      created_at: "2026-09-01T08:00:00.000Z",
    },
    {
      id: "f130ee78-9d07-477e-a918-c7bbd43ff772",
      applicant_user_id: "user-3",
      applicant_name: "赵六",
      team_id: "team-1",
      team_name: "运营一组",
      exemption_type: "range",
      exemption_category: "leave" as const,
      start_date: "2026-09-02",
      end_date: "2026-09-04",
      reason: "探亲",
      request_status: "pending" as const,
      reviewed_by_name: null,
      reviewed_at: null,
      created_at: "2026-09-01T08:01:00.000Z",
    },
  ];
  const groupedOverlap = groupPendingApprovals(overlapping);
  assert.equal(groupedOverlap.length, 1);
  assert.equal(groupedOverlap[0].dayCount, 4);
  assert.equal(groupedOverlap[0].dateRangeText, "9月1日 至 9月4日");

  // 9-01 与 9-03 之间空一天 → 不连续，分开展示
  const gapped = [
    {
      id: "f130ee78-9d07-477e-a918-c7bbd43ff781",
      applicant_user_id: "user-3",
      applicant_name: "赵六",
      team_id: "team-1",
      team_name: "运营一组",
      exemption_type: "single",
      exemption_category: "leave" as const,
      start_date: "2026-09-01",
      end_date: null,
      reason: "探亲",
      request_status: "pending" as const,
      reviewed_by_name: null,
      reviewed_at: null,
      created_at: "2026-09-01T08:00:00.000Z",
    },
    {
      id: "f130ee78-9d07-477e-a918-c7bbd43ff782",
      applicant_user_id: "user-3",
      applicant_name: "赵六",
      team_id: "team-1",
      team_name: "运营一组",
      exemption_type: "single",
      exemption_category: "leave" as const,
      start_date: "2026-09-03",
      end_date: null,
      reason: "探亲",
      request_status: "pending" as const,
      reviewed_by_name: null,
      reviewed_at: null,
      created_at: "2026-09-01T08:01:00.000Z",
    },
  ];
  const groupedGap = groupPendingApprovals(gapped);
  assert.equal(groupedGap.length, 1);
  assert.equal(groupedGap[0].dayCount, 2);
  assert.equal(groupedGap[0].dateRangeText, "9月1日 · 9月3日");
});

