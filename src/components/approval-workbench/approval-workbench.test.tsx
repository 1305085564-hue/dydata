import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { ActionItem } from "@/lib/action-center/types";
import { groupPendingApprovals, type ExemptionRequest } from "@/lib/exemption-approvals";
import { buildApprovalQueue } from "@/lib/command-hub/domain/workbench-rules";
import { HistoryList, REOPEN_EXEMPTION_NOTICE, REOPEN_POST_SUBMIT_NOTICE } from "./history-list";
import { QueueItem } from "./queue-item";
import { TodoRow } from "./todo-row";

const noop = () => undefined;

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
    reason: "家里老人住院",
    request_status: "pending",
    reviewed_by: null,
    reviewed_by_name: null,
    reviewed_at: null,
    created_at: "2026-11-18T02:00:00Z",
    ...overrides,
  };
}

function renderQueueItem(req: ExemptionRequest, focused: boolean, rejecting: { itemId: string; dateStr?: string } | null = null) {
  const [item] = buildApprovalQueue(groupPendingApprovals([req]), []);
  return renderToStaticMarkup(
    <QueueItem
      item={item}
      index={0}
      focused={focused}
      rejecting={rejecting ? { ...rejecting, itemId: item.id } : null}
      onFocus={noop}
      onApprove={noop}
      onStartReject={noop}
      onConfirmReject={noop}
      onCancelReject={noop}
      onApproveDay={noop}
    />,
  );
}

test("只有选中的那一件，同意按钮是主色；其余是普通按钮", () => {
  assert.match(renderQueueItem(request({}), true), /bg-\[#D97757\]/);
  assert.doesNotMatch(renderQueueItem(request({}), false), /bg-\[#D97757\]/);
});

test("请假卡片带出本月已批天数和事由", () => {
  const html = renderQueueItem(request({ applicant_month_stats: { approved_leave_days: 2, approved_waived_days: 0 } }), false);
  assert.match(html, /本月已批假 2 天/);
  assert.match(html, /家里老人住院/);
  assert.match(html, /请假 1 天/);
});

test("单日申请不重复显示逐日按钮；多日申请每天可单独批", () => {
  assert.doesNotMatch(renderQueueItem(request({}), false), /只同意/);
  const multi = renderQueueItem(request({ end_date: "2026-11-22" }), false);
  assert.equal((multi.match(/只同意/g) ?? []).length / 2, 3);
  assert.doesNotMatch(multi, /批注/);
});

test("部分已审时按钮写明只处理剩余日期", () => {
  const html = renderQueueItem(
    request({
      end_date: "2026-11-21",
      daily_items: [
        { id: "d1", request_id: "r", request_date: "2026-11-20", reason: null, status: "approved", feedback: null, reviewed_by: null, reviewed_at: null },
        { id: "d2", request_id: "r", request_date: "2026-11-21", reason: null, status: "pending", feedback: null, reviewed_by: null, reviewed_at: null },
      ],
    }),
    false,
  );
  assert.match(html, /同意剩余 1 天/);
  assert.match(html, /已准/);
});

test("拒绝补交时原因必填，拒绝请假时可不填", () => {
  const appeal = request({ id: "appeal-1", source: "fulfillment_appeal", appeal_type: "视频", business_date: "2026-11-17", appeal_trigger_reason: "expired" });
  const [appealItem] = buildApprovalQueue([], [appeal]);
  const appealHtml = renderToStaticMarkup(
    <QueueItem item={appealItem} index={0} focused rejecting={{ itemId: appealItem.id }} onFocus={noop} onApprove={noop} onStartReject={noop} onConfirmReject={noop} onCancelReject={noop} onApproveDay={noop} />,
  );
  assert.match(appealHtml, /必填/);
  assert.match(appealHtml, /触发原因：/);
  assert.match(renderQueueItem(request({}), true, { itemId: "" }), /可不填/);
});

const baseTodo: ActionItem = {
  id: "todo-absent",
  source: "fulfillment",
  priority: "P1",
  title: "你 11-17 被标记为缺勤",
  description: "如有异议请联系管理员",
  actionLabel: "打开工作台",
  actionUrl: "/dashboard",
  action: null,
  status: "open",
  createdAt: "2026-11-17T12:00:00Z",
  dedupeKey: "fulfillment_absent:u:2026-11-17",
  exemption_category: null,
};

test("带跳转的普通待办也能标完成；补交提醒不能", () => {
  const html = renderToStaticMarkup(
    <TodoRow todo={baseTodo} index={0} focused={false} processing={false} relativeTime="刚刚" onComplete={noop} onNavigate={noop} />,
  );
  assert.match(html, /完成待办：你 11-17 被标记为缺勤/);
  assert.match(html, /打开工作台/);
  const appealHtml = renderToStaticMarkup(
    <TodoRow
      todo={{ ...baseTodo, action: { type: "review-fulfillment-appeal", endpoint: "/api/admin/fulfillment/appeal/handle", method: "POST", appealId: "a" } }}
      index={0}
      focused={false}
      processing={false}
      relativeTime="刚刚"
      onComplete={noop}
      onNavigate={noop}
    />,
  );
  assert.doesNotMatch(appealHtml, /完成待办：/);
  assert.match(appealHtml, /去审批/);
});

test("已处理记录：被拒的补交不显示执行状态，打回说明讲清后果", () => {
  const html = renderToStaticMarkup(
    <HistoryList
      items={[request({ id: "appeal-1", source: "fulfillment_appeal", request_status: "rejected", resumePending: true, rejection_reason: "截图不清" })]}
      loading={false}
      error={null}
      reopeningId={null}
      onRetry={noop}
      onReopen={noop}
    />,
  );
  assert.doesNotMatch(html, /数据已提交|等成员补传/);
  assert.match(html, /拒绝原因：截图不清/);
  assert.match(REOPEN_EXEMPTION_NOTICE, /撤销/);
  assert.match(REOPEN_EXEMPTION_NOTICE, /重新计算/);
  assert.match(REOPEN_EXEMPTION_NOTICE, /重新等待审批/);
});

test("事后核查卡片展示触发原因、发布间隔、作品标题与「确认正常 / 标为无效（不计优结算）」按钮", () => {
  const postAppeal = request({
    id: "appeal-post-1",
    source: "fulfillment_appeal",
    review_mode: "post_submit",
    account_name: "达人主号",
    business_date: "2026-11-17",
    appeal_trigger_reason: "manual_published_at",
    ocr_published_at_text: "2026-11-15 18:00",
    video_title: "爆款干货拆解",
    play_count: 23500,
    elapsed_hours: 84,
    reason: "手工修改发布时间（识别原值 2026-11-15 18:00），已直接入库待核查",
  });
  const [postItem] = buildApprovalQueue([], [postAppeal]);
  const cardHtml = renderToStaticMarkup(
    <QueueItem item={postItem} index={0} focused rejecting={null} onFocus={noop} onApprove={noop} onStartReject={noop} onConfirmReject={noop} onCancelReject={noop} onApproveDay={noop} />,
  );
  assert.match(cardHtml, /事后核查/);
  assert.match(cardHtml, /爆款干货拆解/);
  assert.match(cardHtml, /23,500/);
  assert.match(cardHtml, /84h/);
  assert.match(cardHtml, /确认正常/);
  assert.match(cardHtml, /标为无效（不计优结算）/);

  const rejectHtml = renderToStaticMarkup(
    <QueueItem item={postItem} index={0} focused rejecting={{ itemId: postItem.id }} onFocus={noop} onApprove={noop} onStartReject={noop} onConfirmReject={noop} onCancelReject={noop} onApproveDay={noop} />,
  );
  assert.match(rejectHtml, /确认标为无效/);
  assert.match(rejectHtml, /不计入文案优条数结算/);

  const historyHtml = renderToStaticMarkup(
    <HistoryList
      items={[{ ...postAppeal, request_status: "rejected", rejection_reason: "发布时间核实不符" }]}
      loading={false}
      error={null}
      reopeningId={null}
      onRetry={noop}
      onReopen={noop}
    />,
  );
  assert.match(historyHtml, /已标为无效（不计优结算）/);
  assert.match(historyHtml, /无效原因：发布时间核实不符/);
  assert.match(REOPEN_POST_SUBMIT_NOTICE, /恢复该作品原有效结算状态/);
});
