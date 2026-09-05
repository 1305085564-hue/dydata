import assert from "node:assert/strict";
import test from "node:test";
import {
  groupPendingApprovals,
  type ExemptionRequest,
} from "./unified-command-hub";

test("审批列表支持按申请人、申请类型和日期进行合并展示，并展开逐日明细", () => {
  const mockItems: ExemptionRequest[] = [
    {
      id: "req-1",
      request_id: "req-1",
      applicant_user_id: "user-1",
      applicant_name: "张三",
      team_id: "team-a",
      team_name: "内容一部",
      exemption_type: "temporary",
      exemption_category: "leave",
      start_date: "2026-09-02",
      end_date: "2026-09-04",
      reason: "家中有事需连续请假3天",
      request_status: "pending",
      reviewed_by: null,
      reviewed_by_name: null,
      reviewed_at: null,
      created_at: "2026-09-01T10:00:00Z",
    },
  ];

  const grouped = groupPendingApprovals(mockItems);

  assert.equal(grouped.length, 1);
  const group = grouped[0];
  assert.equal(group.applicant_name, "张三");
  assert.equal(group.nature, "leave");
  assert.equal(group.dayCount, 3);
  assert.equal(group.categoryBadge, "请假3天");
  assert.equal(group.dailyItems.length, 3);
  assert.equal(group.dailyItems[0].dateStr, "2026-09-02");
  assert.equal(group.dailyItems[1].dateStr, "2026-09-03");
  assert.equal(group.dailyItems[2].dateStr, "2026-09-04");
  assert.equal(group.isPartiallyProcessed, false);
});

test("请假和特殊豁免在类型、标签与信息层级上明确区分", () => {
  const mockItems: ExemptionRequest[] = [
    {
      id: "req-leave",
      request_id: "req-leave",
      applicant_user_id: "user-1",
      applicant_name: "李四",
      team_id: "team-a",
      team_name: "运营组",
      exemption_type: "temporary",
      exemption_category: "leave",
      start_date: "2026-09-05",
      end_date: "2026-09-05",
      reason: "病假调休",
      request_status: "pending",
      reviewed_by: null,
      reviewed_by_name: null,
      reviewed_at: null,
      created_at: "2026-09-01T10:00:00Z",
    },
    {
      id: "req-waive",
      request_id: "req-waive",
      applicant_user_id: "user-1",
      applicant_name: "李四",
      team_id: "team-a",
      team_name: "运营组",
      exemption_type: "temporary",
      exemption_category: "waive",
      start_date: "2026-09-06",
      end_date: "2026-09-06",
      reason: "账号封禁维护，申请特殊豁免",
      request_status: "pending",
      reviewed_by: null,
      reviewed_by_name: null,
      reviewed_at: null,
      created_at: "2026-09-01T11:00:00Z",
    },
  ];

  const grouped = groupPendingApprovals(mockItems);

  assert.equal(grouped.length, 2);
  const leaveGroup = grouped.find((g) => g.nature === "leave");
  const waiveGroup = grouped.find((g) => g.nature === "waive");

  assert.ok(leaveGroup);
  assert.ok(waiveGroup);
  assert.match(leaveGroup.categoryBadge, /请假/);
  assert.match(waiveGroup.categoryBadge, /免交/);
});

test("多日申请支持部分处理状态展示", () => {
  const mockItems: ExemptionRequest[] = [
    {
      id: "req-day1",
      request_id: "req-day1",
      applicant_user_id: "user-2",
      applicant_name: "王五",
      team_id: "team-b",
      team_name: "剪辑组",
      exemption_type: "temporary",
      exemption_category: "leave",
      start_date: "2026-09-02",
      end_date: "2026-09-02",
      reason: "事假",
      request_status: "approved",
      reviewed_by: "admin-1",
      reviewed_by_name: "李主管",
      reviewed_at: "2026-09-02T08:00:00Z",
      created_at: "2026-09-01T10:00:00Z",
      feedback: "符合规定准假",
    },
    {
      id: "req-day2",
      request_id: "req-day2",
      applicant_user_id: "user-2",
      applicant_name: "王五",
      team_id: "team-b",
      team_name: "剪辑组",
      exemption_type: "temporary",
      exemption_category: "leave",
      start_date: "2026-09-03",
      end_date: "2026-09-03",
      reason: "事假",
      request_status: "pending",
      reviewed_by: null,
      reviewed_by_name: null,
      reviewed_at: null,
      created_at: "2026-09-01T10:00:00Z",
    },
  ];

  const grouped = groupPendingApprovals(mockItems);
  assert.equal(grouped.length, 1);
  const group = grouped[0];
  assert.equal(group.isPartiallyProcessed, true);
  assert.equal(group.approvedCount, 1);
  assert.equal(group.pendingCount, 1);
  assert.equal(group.dailyItems[0].status, "approved");
  assert.equal(group.dailyItems[0].reviewerFeedback, "符合规定准假");
  assert.equal(group.dailyItems[1].status, "pending");
});

test("申请人当月出勤体征（决策透视舱）正确挂载到聚合卡片", () => {
  const mockItems: ExemptionRequest[] = [
    {
      id: "req-month-stats",
      request_id: "req-month-stats",
      applicant_user_id: "user-3",
      applicant_name: "赵六",
      team_id: "team-c",
      team_name: "文案组",
      exemption_type: "temporary",
      exemption_category: "leave",
      start_date: "2026-09-10",
      end_date: "2026-09-12",
      reason: "外出培训请假",
      request_status: "pending",
      reviewed_by: null,
      reviewed_by_name: null,
      reviewed_at: null,
      created_at: "2026-09-06T10:00:00Z",
      applicant_month_stats: {
        approved_leave_days: 2,
        approved_waived_days: 1,
      },
    },
  ];

  const grouped = groupPendingApprovals(mockItems);
  assert.equal(grouped.length, 1);
  const group = grouped[0];
  assert.deepEqual(group.applicant_month_stats, {
    approved_leave_days: 2,
    approved_waived_days: 1,
  });
});
