import assert from "node:assert/strict";
import test from "node:test";
import type { ActionItem } from "@/lib/action-center/types";
import { groupPendingApprovals, type ExemptionRequest } from "@/lib/exemption-approvals";
import { deriveResumePending } from "@/app/api/exemptions/_fulfillment-appeals";
import {
  buildApprovalQueue,
  getQueueItemDate,
  getAppealExecutionLabel,
  getAppealTriggerText,
  getApproveAllDescription,
  getMonthContext,
  getRelativeTime,
  getTodoActionText,
  getTodoIsCompletable,
  getTodoItems,
  getWorkbenchHeadline,
} from "./workbench-rules";

function request(overrides: Partial<ExemptionRequest>): ExemptionRequest {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    request_id: "00000000-0000-4000-8000-000000000001",
    applicant_user_id: "user-1",
    applicant_name: "张三",
    team_id: "team-a",
    team_name: "一组",
    exemption_type: "temporary",
    exemption_category: "leave",
    start_date: "2026-11-20",
    end_date: "2026-11-20",
    reason: "事假",
    request_status: "pending",
    reviewed_by: null,
    reviewed_by_name: null,
    reviewed_at: null,
    created_at: "2026-11-18T02:00:00Z",
    ...overrides,
  };
}

function todo(overrides: Partial<ActionItem>): ActionItem {
  return {
    id: "todo-1",
    source: "permission",
    priority: "P1",
    title: "权限申请",
    description: "",
    actionLabel: "去处理",
    actionUrl: "/admin/modules",
    action: null,
    status: "open",
    createdAt: "2026-11-18T02:00:00Z",
    dedupeKey: "todo-1",
    exemption_category: null,
    ...overrides,
  };
}

const appealTodo = (appealId: string) =>
  todo({
    id: `todo-${appealId}`,
    source: "fulfillment",
    action: {
      type: "review-fulfillment-appeal",
      endpoint: "/api/admin/fulfillment/appeal/handle",
      method: "POST",
      appealId,
    },
  });

test("标题直接回答「还有几件等我拍板」", () => {
  const base = { isAdmin: true, view: "queue" as const, loading: false };
  assert.equal(getWorkbenchHeadline({ ...base, approvalCount: 3, todoCount: 1 }), "还有 3 件等你批");
  assert.equal(getWorkbenchHeadline({ ...base, approvalCount: 0, todoCount: 2 }), "申请都批完了，还有 2 件待处理");
  assert.equal(getWorkbenchHeadline({ ...base, approvalCount: 0, todoCount: 0 }), "都处理完了");
  assert.equal(getWorkbenchHeadline({ ...base, view: "history", approvalCount: 3, todoCount: 0 }), "已处理记录");
  assert.equal(getWorkbenchHeadline({ ...base, isAdmin: false, approvalCount: 0, todoCount: 2 }), "还有 2 件待办");
  assert.equal(getWorkbenchHeadline({ ...base, isAdmin: false, approvalCount: 0, todoCount: 0 }), "没有待办了");
});

test("等你批按涉及日期从近到远排，同一天先来先审", () => {
  const groups = groupPendingApprovals([
    request({ id: "00000000-0000-4000-8000-00000000000a", request_id: null, applicant_user_id: "late", start_date: "2026-11-25", end_date: "2026-11-25" }),
    request({ id: "00000000-0000-4000-8000-00000000000b", request_id: null, applicant_user_id: "soon-new", start_date: "2026-11-19", end_date: "2026-11-19", created_at: "2026-11-18T05:00:00Z" }),
    request({ id: "00000000-0000-4000-8000-00000000000c", request_id: null, applicant_user_id: "soon-old", start_date: "2026-11-19", end_date: "2026-11-19", created_at: "2026-11-17T05:00:00Z" }),
  ]);
  const appeal = request({ id: "appeal-1", source: "fulfillment_appeal", business_date: "2026-11-16", exemption_category: null });
  const queue = buildApprovalQueue(groups, [appeal]);
  assert.deepEqual(
    queue.map((item) => (item.kind === "appeal" ? "appeal" : item.group.applicant_user_id)),
    ["appeal", "soon-old", "soon-new", "late"],
  );
});

test("部分已审的申请按最早一个没审的日期排", () => {
  const groups = groupPendingApprovals([
    request({
      start_date: "2026-11-10",
      end_date: "2026-11-12",
      daily_items: [
        { id: "d1", request_id: "r", request_date: "2026-11-10", reason: null, status: "approved", feedback: null, reviewed_by: null, reviewed_at: null },
        { id: "d2", request_id: "r", request_date: "2026-11-11", reason: null, status: "pending", feedback: null, reviewed_by: null, reviewed_at: null },
        { id: "d3", request_id: "r", request_date: "2026-11-12", reason: null, status: "pending", feedback: null, reviewed_by: null, reviewed_at: null },
      ],
    }),
  ]);
  const appeal = request({ id: "appeal-1", source: "fulfillment_appeal", business_date: "2026-11-10" });
  const queue = buildApprovalQueue(groups, [appeal]);
  assert.equal(queue[0].kind, "appeal");
  assert.equal(groups[0].isPartiallyProcessed, true);
  assert.equal(groups[0].pendingCount, 2);
});

test("判断依据：本月已批天数直接摆出来，没有统计时不编造", () => {
  const [leave] = groupPendingApprovals([request({ applicant_month_stats: { approved_leave_days: 2, approved_waived_days: 1 } })]);
  assert.equal(getMonthContext(leave), "本月已批假 2 天");
  const [waive] = groupPendingApprovals([request({ exemption_category: "waive", applicant_month_stats: { approved_leave_days: 0, approved_waived_days: 0 } })]);
  assert.equal(getMonthContext(waive), "本月还没免交过");
  const [none] = groupPendingApprovals([request({})]);
  assert.equal(getMonthContext(none), null);
});

test("补交触发原因说清楚为什么要审批", () => {
  assert.match(getAppealTriggerText(request({ appeal_trigger_reason: "manual_published_at", ocr_published_at_text: "11-17 20:00" })) ?? "", /^触发原因：手工改了发布时间（识别原值 11-17 20:00）$/);
  assert.equal(getAppealTriggerText(request({ appeal_trigger_reason: "expired" })), "触发原因：超过 72 小时才交");
  assert.equal(getAppealTriggerText(request({})), null);
});

test("同一件补交只出现一次：已在等你批里的补交提醒不再进待办", () => {
  const summary = {
    topItems: [
      appealTodo("appeal-in-queue"),
      appealTodo("appeal-gone"),
      todo({ id: "exemption-review", source: "exemption", action: { type: "review-exemption", endpoint: "/api/exemptions/review", method: "POST", requestId: "r" } as ActionItem["action"] }),
      todo({ id: "done" }),
      todo({ id: "p0", priority: "P0" }),
    ],
  } as unknown as Parameters<typeof getTodoItems>[0];
  const items = getTodoItems(summary, ["done"], ["appeal-in-queue"]);
  assert.deepEqual(items.map((i) => i.id), ["p0", "todo-appeal-gone"]);
});

test("补交提醒只能去审批，不能单独标完成；普通待办可以", () => {
  assert.equal(getTodoIsCompletable(appealTodo("a")), false);
  assert.equal(getTodoActionText(appealTodo("a")), "去审批");
  assert.equal(getTodoIsCompletable(todo({})), true);
  assert.equal(getTodoActionText(todo({ actionUrl: null })), null);
});

test("补交执行状态：已提交、等成员补传、未批准", () => {
  assert.equal(deriveResumePending("approved", { rows: [] }), true);
  assert.equal(deriveResumePending("approved", null), false);
  assert.equal(deriveResumePending("pending", { rows: [] }), null);
  assert.equal(getAppealExecutionLabel(false), "数据已提交");
  assert.equal(getAppealExecutionLabel(true), "已批准·等成员补传");
  assert.equal(getAppealExecutionLabel(null), null);
});

test("全部同意前说清范围和可撤回", () => {
  const groups = groupPendingApprovals([request({})]);
  const queue = buildApprovalQueue(groups, [request({ id: "appeal-1", source: "fulfillment_appeal" })]);
  assert.equal(
    getApproveAllDescription(queue),
    "将同意全部 2 件（请假/免交 1 件，补交 1 件）。部分已审的申请只同意剩余日期。5 秒内可撤回。",
  );
});

test("一小时内显示刚刚", () => {
  assert.equal(getRelativeTime("2026-10-12T01:30:00.000Z", Date.parse("2026-10-12T01:45:00.000Z")), "刚刚");
});

test("工作台申诉的凌晨创建时间按北京时间兜底，已有业务日保持", () => {
  for (const created_at of ["2026-11-27T16:30:00.000Z", "2026-11-27T23:59:00.000Z"]) {
    const appeal = request({ start_date: "", business_date: "", created_at });
    assert.equal(getQueueItemDate({ kind: "appeal", id: "a", appeal }), "2026-11-28");
    assert.equal(getQueueItemDate({ kind: "appeal", id: "a", appeal: { ...appeal, business_date: "2026-11-25" } }), "2026-11-25");
    assert.equal(getQueueItemDate({ kind: "appeal", id: "a", appeal: { ...appeal, start_date: "2026-11-26" } }), "2026-11-26");
  }
});

test("工作台豁免缺少业务日期时用北京时间创建日排序", () => {
  const group = groupPendingApprovals([request({ start_date: "2026-11-28", created_at: "2026-11-27T16:30:00.000Z" })])[0];
  assert.ok(group);
  const fallback = { ...group, dailyItems: [], items: [] };
  assert.equal(getQueueItemDate({ kind: "exemption", id: "g", group: fallback }), "2026-11-28");
});
