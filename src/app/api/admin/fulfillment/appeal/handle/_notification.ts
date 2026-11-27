import type { EmitInput } from "@/lib/notifications/types";
import type { ResumeSubmissionResult } from "../_resume-submission";

export function buildFulfillmentAppealRejectionNotification(recordDate: string, reason: string) {
  return `${recordDate} 的数据补交申请已被驳回。驳回原因：${reason}`;
}

export function buildFulfillmentAppealRejectionAuditDetail(input: {
  appealId: string;
  accountId: string | null;
  recordDate: string;
  reason: string;
}) {
  return JSON.stringify({
    appealId: input.appealId,
    accountId: input.accountId,
    recordDate: input.recordDate,
    decision: "rejected",
    reason: input.reason,
  });
}

export function eventsForAppealResponse(body: Record<string, unknown>) {
  const events: string[] = [];
  if (body.status === "already_handled") events.push("fulfillment_appeal.already_handled");
  if (body.businessSucceeded === true) events.push("fulfillment_appeal.business_succeeded");
  if (body.auditStatus === "failed") events.push("fulfillment_appeal.audit_failed");
  if (body.employeeNotificationStatus === "failed") events.push("fulfillment_appeal.employee_notification_failed");
  if (body.todoStatus === "failed") events.push("fulfillment_appeal.notification_mark_failed");
  return Array.from(new Set(events));
}

export function buildFulfillmentAppealObservationDetail(response: Record<string, unknown>) {
  return {
    businessStatus: response.status ?? null,
    businessSucceeded: response.businessSucceeded ?? false,
    auditStatus: response.auditStatus ?? "skipped",
    employeeNotificationStatus: response.employeeNotificationStatus ?? "skipped",
    todoStatus: response.todoStatus ?? "skipped",
    todoMarkedCount: response.todoMarkedCount ?? 0,
    autoResumeStatus: response.autoResumeStatus ?? "skipped",
    autoResumeError: response.autoResumeError ?? null,
    compensationRequired: response.auditStatus === "failed" || response.employeeNotificationStatus === "failed" || response.todoStatus === "failed",
    events: eventsForAppealResponse(response),
  };
}

export function buildPostSubmitInvalidNotification(recordDate: string, reason: string) {
  return `${recordDate} 的超期/手改提交经核查已标为无效，不计入文案优条数结算。原因：${reason}`;
}

export function buildFulfillmentAppealResultNotification(input: {
  appealId: string;
  userId: string;
  accountId: string | null;
  recordDate: string;
  reviewMode: "pre_submit" | "post_submit";
  videoId?: string | null;
  dailyReportId?: string | null;
  status: "approved" | "rejected";
  reason?: string;
  autoResume: ResumeSubmissionResult | null;
  resumeActionUrl?: string;
}): EmitInput {
  const { appealId, userId, accountId, recordDate, reviewMode, videoId, dailyReportId, status, reason, autoResume, resumeActionUrl } = input;
  if (reviewMode === "post_submit") {
    return {
      recipients: [userId],
      type: "fulfillment.appeal.result",
      category: "feed",
      severity: status === "approved" ? "success" : "warning",
      title: status === "approved" ? "提交核查已确认正常" : "提交已标为无效（不计优结算）",
      body: status === "approved"
        ? `${recordDate} 的作品提交已核查确认正常，保留文案优条数结算资格。`
        : buildPostSubmitInvalidNotification(recordDate, reason ?? ""),
      actionLabel: null,
      actionUrl: null,
      sourceType: "fulfillment_appeal_result",
      sourceId: appealId,
      payload: {
        appealId,
        accountId,
        reviewMode: "post_submit",
        videoId: videoId ?? null,
        dailyReportId: dailyReportId ?? null,
        status,
        settlementExcluded: status === "rejected",
        autoResumeStatus: "skipped",
        ...(status === "rejected" ? { reason: reason ?? "" } : {}),
      },
    };
  }

  const autoResumeOk = autoResume?.success === true;
  return {
    recipients: [userId],
    type: "fulfillment.appeal.result",
    category: "feed",
    severity: status === "approved" ? (autoResumeOk ? "success" : "warning") : "warning",
    title: status === "approved" ? "补交申请已通过" : "补交申请已驳回",
    body: status === "approved"
      ? autoResumeOk
        ? `${recordDate} 的补交申请已通过，数据已自动提交。`
        : `${recordDate} 的补交申请已通过，但数据写入未成功：${autoResume && !autoResume.success ? autoResume.error : "未知原因"}。请点击“去完成填报”重试。`
      : buildFulfillmentAppealRejectionNotification(recordDate, reason ?? ""),
    actionLabel: status === "approved" && !autoResumeOk ? "去完成填报" : null,
    actionUrl: status === "approved" && !autoResumeOk
      ? (resumeActionUrl ?? `/dashboard?resumeAppeal=${encodeURIComponent(appealId)}`)
      : null,
    sourceType: "fulfillment_appeal_result",
    sourceId: appealId,
    payload: {
      appealId,
      accountId,
      status,
      autoResumeStatus: autoResume ? (autoResume.success ? "succeeded" : "failed") : "skipped",
      ...(autoResumeOk && autoResume && autoResume.success && autoResume.videoId ? { videoId: autoResume.videoId } : {}),
      ...(status === "rejected" ? { reason: reason ?? "" } : {}),
    },
  };
}
