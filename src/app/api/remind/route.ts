import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { isCronAuthorized } from "@/lib/cron-auth";
import {
  buildMissingStreakMap,
  buildRecentSubmissionMap,
  buildSubmissionStatus,
  getShanghaiDateString,
  shiftDateString,
} from "@/lib/remind-submission";
import { buildReminderContent } from "@/lib/飞书提醒";
import { getChinaWorkingDayReason, getShanghaiYear, hasChinaHolidayPlan, isChinaWorkingDay } from "@/lib/工作日";
import type { ExemptionCategory, ExemptionRequestStatus, UserStatus } from "@/types";

const REMIND_SOURCE_LABEL = "Vercel Cron /api/remind v2";

type ProfileRow = {
  id: string;
  name: string;
  role: string;
  status: UserStatus | null;
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

function isExemptByRequest(requests: ExemptionRequestRow[], userId: string, date: string): boolean {
  return requests.some((req) => {
    if (req.applicant_user_id !== userId) return false;
    if (req.request_status !== "pending" && req.request_status !== "approved") return false;
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
    await (supabase as any).from("remind_logs").insert(log);
  } catch {
    // 静默失败，不影响主流程
  }
}

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey!);
  const today = getShanghaiDateString();
  const sevenDaysAgo = shiftDateString(today, -7);

  const [
    { data: profiles, error: profilesError },
    { data: accounts, error: accountsError },
    { data: reports, error: reportsError },
    { data: exemptionRequests, error: exemptionRequestsError },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "id, name, role, status, exempt_type, exempt_start_date, exempt_end_date, exempt_reason, exemption_category",
      )
      .eq("role", "member"),
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

  // exemption_request 查询失败不应阻断主流程
  const activeExemptionRequests = (exemptionRequests ?? []) as ExemptionRequestRow[];

  if (profilesError) {
    return NextResponse.json({ error: profilesError.message }, { status: 500 });
  }

  if (accountsError) {
    return NextResponse.json({ error: accountsError.message }, { status: 500 });
  }

  if (reportsError) {
    return NextResponse.json({ error: reportsError.message }, { status: 500 });
  }

  const normalizedProfiles = ((profiles ?? []) as ProfileRow[]).map((profile) => ({
    ...profile,
    status: profile.status ?? "active",
  }));

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
      isExemptByRequest: isExemptByRequest(activeExemptionRequests, user.user_id, today),
    }));

  const unsubmitted = unsubmittedWithExemptionCheck.filter((user) => !user.isExemptByRequest);
  const exemptedSkipped = unsubmittedWithExemptionCheck.filter((user) => user.isExemptByRequest);
  const submittedCount = all.length - unsubmittedWithExemptionCheck.length;

  if (unsubmitted.length === 0) {
    return NextResponse.json({ message: "All members have submitted today." });
  }

  const reportsByUser = buildRecentSubmissionMap({
    accounts: (accounts ?? []) as AccountRow[],
    reports: (reports ?? []) as ReportRow[],
  });
  const streakMap = buildMissingStreakMap({
    userIds: unsubmitted.map((user) => user.user_id),
    reportsByUser,
    today,
  });

  const { content, escalatedMembers, escalationManager } = buildReminderContent({
    unsubmitted,
    streakMap,
    submittedCount,
    totalCount: all.length,
    today,
    sourceLabel: REMIND_SOURCE_LABEL,
  });

  // 记录已豁免跳过成员到 remind_logs
  for (const member of exemptedSkipped) {
    await insertRemindLog(supabase, {
      target_date: today,
      user_id: member.user_id,
      user_name: member.name,
      status: "success",
      is_exempted: true,
      exempt_reason: "已申请豁免（pending/approved）",
    });
  }

  const webhookUrl = process.env.FEISHU_WEBHOOK_URL;
  if (!webhookUrl) {
    return NextResponse.json({ error: "FEISHU_WEBHOOK_URL not configured" }, { status: 500 });
  }

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
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
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    // 记录发送失败的催交日志
    for (const member of unsubmitted) {
      await insertRemindLog(supabase, {
        target_date: today,
        user_id: member.user_id,
        user_name: member.name,
        status: "failed",
        is_exempted: false,
        response_body: text.slice(0, 500),
      });
    }
    return NextResponse.json({ error: `Feishu webhook failed: ${text}` }, { status: 500 });
  }

  // 记录发送成功的催交日志
  for (const member of unsubmitted) {
    await insertRemindLog(supabase, {
      target_date: today,
      user_id: member.user_id,
      user_name: member.name,
      status: "success",
      is_exempted: false,
    });
  }

  // 同步往通知中心推条目（站内待办，源头去重 = target_date+user_id）
  const { emit } = await import("@/lib/notifications/server");
  for (const member of unsubmitted) {
    if (!member.user_id) continue;
    await emit({
      recipients: [member.user_id],
      type: "report.remind",
      category: "todo",
      severity: "warning",
      title: `请尽快填写 ${today} 的日报`,
      body: "你的日报尚未提交，请尽快补上以免影响排行榜与团队节奏。",
      actionLabel: "去填报",
      actionUrl: "/dashboard",
      sourceType: "report.remind",
      sourceId: `${today}:${member.user_id}`,
    });
  }

  return NextResponse.json({
    ok: true,
    unsubmitted: unsubmitted.map((user) => user.name),
    exemptedSkipped: exemptedSkipped.map((user) => user.name),
    escalated: escalatedMembers.map((member) => member.name),
    escalationManager: escalationManager?.name ?? null,
    total: all.length,
    submitted: submittedCount,
    source: REMIND_SOURCE_LABEL,
    today,
  });
}
