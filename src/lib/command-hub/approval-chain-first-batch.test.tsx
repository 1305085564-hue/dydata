import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { WorkbenchHeader } from "@/components/command-hub/workbench-header";
import { HistoryAppealCard } from "@/components/command-hub/history-appeal-card";
import { HistoryExemptionCard } from "@/components/command-hub/history-exemption-card";
import { getAppealExecutionLabel } from "@/lib/command-hub/domain/view-rules";
import { deriveResumePending } from "@/app/api/exemptions/_fulfillment-appeals";
import type { ExemptionRequest } from "@/lib/exemption-approvals";

const baseAppeal: ExemptionRequest = {
  id: "appeal-1",
  applicant_user_id: "user-1",
  applicant_name: "成员",
  team_id: null,
  team_name: null,
  exemption_type: "fulfillment_appeal",
  exemption_category: null,
  start_date: "2026-10-15",
  end_date: "2026-10-15",
  reason: "补交",
  request_status: "approved",
  reviewed_by: "admin-1",
  reviewed_by_name: "管理员",
  reviewed_at: "2026-10-15T08:00:00Z",
  created_at: "2026-10-15T07:00:00Z",
  source: "fulfillment_appeal",
  account_name: "账号",
  appeal_type: "日报",
  business_date: "2026-10-15",
};

test("补交执行状态派生只输出布尔或 null，不暴露 payload", () => {
  assert.equal(deriveResumePending("approved", { rows: [] }), true);
  assert.equal(deriveResumePending("approved", null), false);
  assert.equal(deriveResumePending("pending", { rows: [] }), null);
  assert.equal(deriveResumePending("rejected", null), null);
});

test("执行状态标签覆盖已提交、等待补传和未批准", () => {
  assert.equal(getAppealExecutionLabel(false), "数据已提交");
  assert.equal(getAppealExecutionLabel(true), "已批准·等成员补传");
  assert.equal(getAppealExecutionLabel(null), null);
});

test("工作台头部显示审批与待办双徽章", () => {
  const html = renderToStaticMarkup(
    <WorkbenchHeader
      activeTab="approvals"
      onTabChange={() => undefined}
      isAdmin
      approvalPendingCount={8}
      todoPendingCount={1}
      historyApprovals={[]}
      summaryLoading={false}
      approvalsLoading={false}
      onOpenChange={() => undefined}
    />,
  );
  assert.match(html, /待审批 8/);
  assert.match(html, /待办 1/);
  assert.doesNotMatch(html, new RegExp(String.fromCharCode(24635, 25968)));
});

test("豁免历史回退说明明确撤销、重新计算和重新等待审批", () => {
  const item: ExemptionRequest = {
    ...baseAppeal,
    id: "request-1",
    source: "exemption",
    exemption_type: "temporary",
    exemption_category: "leave",
    request_status: "approved",
    start_date: "2026-10-01",
    end_date: "2026-10-03",
  };
  const html = renderToStaticMarkup(
    <HistoryExemptionCard item={item} isProcessing={false} onReopen={() => undefined} />,
  );
  assert.match(html, /生效：10\.01–10\.03/);
  const source = readFileSync(new URL("../../components/command-hub/history-exemption-card.tsx", import.meta.url), "utf8");
  assert.match(source, /撤销/);
  assert.match(source, /重新计算/);
  assert.match(source, /重新等待审批/);
});

test("驳回的补交历史行不显示执行状态徽章", () => {
  const html = renderToStaticMarkup(
    <HistoryAppealCard
      appeal={{ ...baseAppeal, request_status: "rejected", resumePending: true }}
      isProcessing={false}
      onReopen={async () => undefined}
    />,
  );
  assert.doesNotMatch(html, /数据已提交|已批准·等成员补传/);
});
