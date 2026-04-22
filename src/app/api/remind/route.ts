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
import type { ExemptionCategory, UserStatus } from "@/types";

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
  ]);

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
  const unsubmitted = all.filter((user) => !user.submitted);
  const submittedCount = all.length - unsubmitted.length;

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
  });

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
        ],
      },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    return NextResponse.json({ error: `Feishu webhook failed: ${text}` }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    unsubmitted: unsubmitted.map((user) => user.name),
    escalated: escalatedMembers.map((member) => member.name),
    escalationManager: escalationManager?.name ?? null,
    total: all.length,
    submitted: submittedCount,
  });
}
