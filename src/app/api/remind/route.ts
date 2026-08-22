import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { isCronAuthorized } from "@/lib/cron-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildMissingStreakMap,
  buildRecentSubmissionMap,
  buildSubmissionStatus,
  getShanghaiDateString,
  shiftDateString,
} from "@/lib/remind-submission";
import { buildReminderContent } from "@/lib/飞书提醒";
import {
  getChinaWorkingDayReason,
  getShanghaiYear,
  hasChinaHolidayPlan,
  isChinaWorkingDay,
} from "@/lib/工作日";
import {
  filterActiveMemberships,
  loadWithMembershipFallback,
} from "@/lib/member-lifecycle";
import { sendFeishuWebhook } from "@/lib/飞书webhook";
import { logApiError, logApiRequest, resolveRequestId } from "@/lib/api-logger";
import {
  claimDailyReminders,
  transitionRemindClaims,
  type RemindClaimMember,
} from "@/lib/remind-claim";
import type {
  ExemptionCategory,
  ExemptionRequestStatus,
  UserStatus,
} from "@/types";

const REMIND_SOURCE_LABEL = "Vercel Cron /api/remind v2";

type ProfileRow = {
  id: string;
  name: string;
  role: string;
  status: UserStatus | null;
  membership_status?: string | null;
  exempt_type: "permanent" | "temporary" | null;
  exempt_start_date: string | null;
  exempt_end_date: string | null;
  exempt_reason: string | null;
  exemption_category: ExemptionCategory | null;
};

type AccountRow = {
  id: string;
  profile_id: string;
};

type ReportRow = {
  user_id: string | null;
  account_id: string | null;
  report_date: string;
};

type ExemptionRequestRow = {
  applicant_user_id: string;
  request_status: ExemptionRequestStatus;
  start_date: string;
  end_date: string | null;
};

function isExemptByRequest(
  requests: ExemptionRequestRow[],
  userId: string,
  date: string,
): boolean {
  return requests.some((req) => {
    if (req.applicant_user_id !== userId) return false;
    if (req.request_status !== "pending" && req.request_status !== "approved")
      return false;
    if (!req.end_date) {
      return req.start_date === date;
    }
    return req.start_date <= date && date <= req.end_date;
  });
}

type RemindLogInsert = {
  target_date: string;
  user_id: string;
  user_name: string;
  status: "success" | "failed";
  is_exempted: boolean;
  exempt_reason?: string | null;
  response_body?: string | null;
};

async function insertRemindLog(supabase: unknown, log: RemindLogInsert) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("remind_logs").insert(log);
    return !error;
  } catch {
    return false;
  }
}

function describeFailureReason(reason: string) {
  switch (reason) {
    case "timeout":
      return "飞书 webhook 超时";
    case "network":
      return "飞书 webhook 网络异常";
    case "non_2xx":
      return "飞书 webhook 返回非 2xx";
    case "not_configured":
      return "FEISHU_WEBHOOK_URL 未配置";
    default:
      return "飞书 webhook 发送失败";
  }
}

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 缺 service role 配置时明确失败，禁止回退 anon key
  let supabase: SupabaseClient;
  try {
    supabase = createAdminClient();
  } catch (error) {
    return NextResponse.json(
      { error: `服务端配置缺失：${error instanceof Error ? error.message : "unknown"}` },
      { status: 500 },
    );
  }

  const shanghaiYear = getShanghaiYear();
  if (!hasChinaHolidayPlan(shanghaiYear)) {
    console.warn(
      `[api/remind] ${shanghaiYear} 节假日清单未更新，当前按周末规则兜底，请补充 src/lib/工作日.ts`,
    );
  }

  if (!isChinaWorkingDay()) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: getChinaWorkingDayReason(),
    });
  }

  const today = getShanghaiDateString();
  const sevenDaysAgo = shiftDateString(today, -7);

  const [
    profilesResult,
    { data: accounts, error: accountsError },
    { data: reports, error: reportsError },
    { data: exemptionRequests, error: exemptionRequestsError },
  ] = await Promise.all([
    loadWithMembershipFallback({
      loadWithMembership: async () =>
        supabase
          .from("profiles")
          .select(
            "id, name, role, status, membership_status, exempt_type, exempt_start_date, exempt_end_date, exempt_reason, exemption_category",
          )
          .eq("role", "member"),
      loadWithoutMembership: async () =>
        supabase
          .from("profiles")
          .select(
            "id, name, role, status, exempt_type, exempt_start_date, exempt_end_date, exempt_reason, exemption_category",
          )
          .eq("role", "member"),
    }),
    supabase.from("accounts").select("id, profile_id"),
    supabase
      .from("daily_reports")
      .select("user_id, account_id, report_date")
      .gte("report_date", sevenDaysAgo)
      .lte("report_date", today),
    supabase
      .from("exemption_request")
      .select("applicant_user_id, request_status, start_date, end_date")
      .in("request_status", ["pending", "approved"])
      .lte("start_date", today)
      .or(`end_date.is.null,end_date.gte.${sevenDaysAgo}`),
  ]);

  const profilesError = profilesResult.error;
  const profiles = filterActiveMemberships(
    (profilesResult.data ?? []) as ProfileRow[],
  );

  // exemption_request 查询失败不应阻断主流程
  const activeExemptionRequests = (exemptionRequests ??
    []) as ExemptionRequestRow[];

  if (profilesError) {
    return NextResponse.json({ error: profilesError.message }, { status: 500 });
  }

  if (accountsError) {
    return NextResponse.json({ error: accountsError.message }, { status: 500 });
  }

  if (reportsError) {
    return NextResponse.json({ error: reportsError.message }, { status: 500 });
  }

  const normalizedProfiles = ((profiles ?? []) as ProfileRow[]).map(
    (profile) => ({
      ...profile,
      status: profile.status ?? "active",
    }),
  );

  const all = buildSubmissionStatus({
    profiles: normalizedProfiles,
    accounts: (accounts ?? []) as AccountRow[],
    reports: (reports ?? []) as ReportRow[],
    today,
  });

  // 过滤已申请豁免（pending/approved）的成员
  const unsubmittedWithExemptionCheck = all
    .filter((user) => !user.submitted)
    .map((user) => ({
      ...user,
      isExemptByRequest: isExemptByRequest(
        activeExemptionRequests,
        user.user_id,
        today,
      ),
    }));

  const unsubmitted = unsubmittedWithExemptionCheck.filter(
    (user) => !user.isExemptByRequest,
  );
  const exemptedSkipped = unsubmittedWithExemptionCheck.filter(
    (user) => user.isExemptByRequest,
  );
  const submittedCount = all.length - unsubmittedWithExemptionCheck.length;

  if (unsubmitted.length === 0) {
    return NextResponse.json({ message: "All members have submitted today." });
  }

  // 幂等守卫（快速路径）：当日已有 success 或 sending 记录的成员不再重复处理。
  // 严格并发防重靠 claimDailyReminders 的数据库抢占，这里只是廉价的第一道闸。
  const { data: sentLogs, error: sentLogsError } = await supabase
    .from("remind_logs")
    .select("user_id")
    .eq("target_date", today)
    .in("status", ["success", "sending"])
    .eq("is_exempted", false);

  if (sentLogsError) {
    // 守卫查询失败时宁可跳过本轮，也不能冒着重复打扰的风险继续发送
    return NextResponse.json(
      { error: "无法确认当日已提醒记录，已跳过本轮发送" },
      { status: 500 },
    );
  }

  const alreadyNotifiedUserIds = new Set(
    ((sentLogs ?? []) as { user_id: string }[]).map((row) => row.user_id),
  );
  const pendingUnsubmitted = unsubmitted.filter(
    (user) => !alreadyNotifiedUserIds.has(user.user_id),
  );

  const reportsByUser = buildRecentSubmissionMap({
    accounts: (accounts ?? []) as AccountRow[],
    reports: (reports ?? []) as ReportRow[],
  });

  const requestId = resolveRequestId(request);

  // 记录已豁免跳过成员到 remind_logs
  const exemptedLogFailures: string[] = [];
  for (const member of exemptedSkipped) {
    const inserted = await insertRemindLog(supabase, {
      target_date: today,
      user_id: member.user_id,
      user_name: member.name,
      status: "success",
      is_exempted: true,
      exempt_reason: "已申请豁免（pending/approved）",
    });
    if (!inserted) exemptedLogFailures.push(member.name);
  }

  if (pendingUnsubmitted.length === 0) {
    logApiRequest({
      requestId,
      route: "/api/remind",
      method: request.method,
      status: 200,
      outcome: "skipped_already_notified",
      detail: { today, alreadyNotified: alreadyNotifiedUserIds.size },
    });
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "当日已成功提醒过，跳过重复发送（幂等补发）",
      unsubmitted: unsubmitted.map((user) => user.name),
      exemptedSkipped: exemptedSkipped.map((user) => user.name),
      exemptedLogFailures,
      today,
    });
  }

  const webhookUrl = process.env.FEISHU_WEBHOOK_URL;
  if (!webhookUrl) {
    return NextResponse.json(
      { error: "FEISHU_WEBHOOK_URL not configured" },
      { status: 500 },
    );
  }

  // ── 抢占阶段（claim-then-send）：先拿当日发送权，再发消息 ──
  // 数据库兜底见 supabase/migrations/20260823000000_remind_logs_claim_idempotency.sql；
  // migration 未执行时 claimDailyReminders 返回 legacy 模式，退回查询守卫旧行为。
  const claim = await claimDailyReminders(supabase, today, pendingUnsubmitted);
  let recipients: RemindClaimMember[] = pendingUnsubmitted;

  if (claim.mode === "legacy") {
    logApiRequest({
      requestId,
      route: "/api/remind",
      method: request.method,
      status: 200,
      outcome: "legacy_idempotency_mode",
      detail: { today, note: "数据库未支持 sending 状态，退回查询守卫（止血级）" },
    });
  } else {
    if (claim.claimFailedNames.length > 0) {
      logApiError(
        {
          requestId,
          route: "/api/remind",
          method: request.method,
          detail: { today, members: claim.claimFailedNames },
        },
        new Error("部分成员发送锁抢占失败，本轮跳过这些成员"),
      );
    }

    if (claim.claimed.length === 0) {
      logApiRequest({
        requestId,
        route: "/api/remind",
        method: request.method,
        status: 200,
        outcome: "skipped_concurrent_claim",
        detail: {
          today,
          skippedConcurrent: claim.skippedConcurrent.length,
          claimFailed: claim.claimFailedNames.length,
        },
      });
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: "无待提醒成员：并发触发已被抢占或当日均已提醒",
        unsubmitted: unsubmitted.map((user) => user.name),
        skippedConcurrent: claim.skippedConcurrent.map((member) => member.name),
        claimFailedNames: claim.claimFailedNames,
        exemptedSkipped: exemptedSkipped.map((user) => user.name),
        exemptedLogFailures,
        today,
      });
    }

    recipients = claim.claimed;
  }

  const streakMap = buildMissingStreakMap({
    userIds: recipients.map((user) => user.user_id),
    reportsByUser,
    today,
  });

  const { content, escalatedMembers, escalationManager } = buildReminderContent(
    {
      unsubmitted: recipients,
      streakMap,
      submittedCount,
      totalCount: all.length,
      today,
      sourceLabel: REMIND_SOURCE_LABEL,
    },
  );

  const sendResult = await sendFeishuWebhook(
    {
      msg_type: "interactive",
      card: {
        header: {
          title: { tag: "plain_text", content: "📳 抖音数据日报提交提醒" },
          template: "red",
        },
        elements: [
          {
            tag: "div",
            text: {
              tag: "lark_md",
              content,
            },
          },
          {
            tag: "action",
            actions: [
              {
                tag: "button",
                text: { tag: "plain_text", content: "打开 DYData" },
                type: "primary",
                url: "https://dydata.cc",
              },
            ],
          },
        ],
      },
    },
    { webhookUrl },
  );

  if (!sendResult.ok) {
    const response_body = [
      describeFailureReason(sendResult.reason),
      sendResult.status ? `HTTP ${sendResult.status}` : null,
      sendResult.bodyPreview ?? null,
    ]
      .filter(Boolean)
      .join(" | ")
      .slice(0, 500);

    const recipientIds = recipients.map((member) => member.user_id);
    let transitioned = false;
    if (claim.mode === "claimed") {
      // sending 占位流转回 failed，允许下轮触发重试
      transitioned = await transitionRemindClaims(supabase, {
        targetDate: today,
        userIds: recipientIds,
        toStatus: "failed",
        responseBody: response_body,
      });
    }

    // 发送失败必须留下失败记录，禁止伪装成成功
    const failedLogInserts: string[] = [];
    if (!transitioned) {
      for (const member of recipients) {
        const inserted = await insertRemindLog(supabase, {
          target_date: today,
          user_id: member.user_id,
          user_name: member.name,
          status: "failed",
          is_exempted: false,
          response_body,
        });
        if (!inserted) failedLogInserts.push(member.name);
      }
    }
    logApiError(
      {
        requestId,
        route: "/api/remind",
        method: request.method,
        status: 502,
        detail: {
          reason: sendResult.reason,
          httpStatus: sendResult.status ?? null,
          failedCount: recipients.length,
          failedLoggedFor: recipients.map((user) => user.name),
          failedLogInserts,
          exemptedLogFailures,
        },
      },
      new Error(describeFailureReason(sendResult.reason)),
    );
    return NextResponse.json(
      {
        error: `飞书催交发送失败：${describeFailureReason(sendResult.reason)}`,
        reason: sendResult.reason,
        failedLoggedFor: recipients.map((user) => user.name),
        warning: failedLogInserts.length > 0
          ? `部分失败记录未落库：${failedLogInserts.join("、")}`
          : undefined,
      },
      { status: 502 },
    );
  }

  const recipientIds = recipients.map((member) => member.user_id);
  let successLogFailures: string[] = [];
  if (claim.mode === "claimed") {
    // sending 占位流转为 success；这是幂等去重依据，流转失败必须显式暴露
    const transitioned = await transitionRemindClaims(supabase, {
      targetDate: today,
      userIds: recipientIds,
      toStatus: "success",
    });
    if (!transitioned) {
      successLogFailures = recipients.map((member) => member.name);
    }
  } else {
    for (const member of recipients) {
      const inserted = await insertRemindLog(supabase, {
        target_date: today,
        user_id: member.user_id,
        user_name: member.name,
        status: "success",
        is_exempted: false,
      });
      if (!inserted) successLogFailures.push(member.name);
    }
  }

  logApiRequest({
    requestId,
    route: "/api/remind",
    method: request.method,
    status: 200,
    outcome: "sent",
    detail: {
      today,
      notified: recipients.length,
      alreadyNotified: alreadyNotifiedUserIds.size,
      skippedConcurrent: claim.skippedConcurrent.length,
      exemptedSkipped: exemptedSkipped.length,
      escalated: escalatedMembers.length,
      logFailures: [...successLogFailures, ...exemptedLogFailures],
    },
  });

  return NextResponse.json({
    ok: true,
    unsubmitted: recipients.map((user) => user.name),
    skippedConcurrent:
      claim.mode === "claimed"
        ? claim.skippedConcurrent.map((member) => member.name)
        : [],
    exemptedSkipped: exemptedSkipped.map((user) => user.name),
    escalated: escalatedMembers.map((member) => member.name),
    escalationManager: escalationManager?.name ?? null,
    total: all.length,
    submitted: submittedCount,
    source: REMIND_SOURCE_LABEL,
    today,
    warning:
      successLogFailures.length > 0
        ? claim.mode === "claimed"
          ? `成功记录流转失败（停留 sending）：${successLogFailures.join("、")}。今日不会重复提醒；如需当日补发请人工处理`
          : `部分成功记录未落库：${successLogFailures.join("、")}，重复触发可能重复提醒`
        : undefined,
  });
}
