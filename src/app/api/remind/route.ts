import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getExemptionStateForDate } from "@/lib/豁免";
import { buildReminderContent } from "@/lib/飞书提醒";
import {
  getChinaWorkingDayReason,
  getShanghaiYear,
  hasChinaHolidayPlan,
  isChinaWorkingDay,
} from "@/lib/工作日";

type ReminderProfile = {
  id: string;
  name: string;
  status: "active" | "exempt" | null;
  exempt_type: "permanent" | "temporary" | null;
  exempt_start_date: string | null;
  exempt_end_date: string | null;
  exempt_reason: string | null;
};

function getShanghaiDateKey(date: Date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    throw new Error("Failed to resolve Shanghai date");
  }

  return `${year}-${month}-${day}`;
}

function shiftDateKey(dateKey: string, days: number) {
  const next = new Date(`${dateKey}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get("secret");
  const expectedSecret = process.env.CRON_SECRET ?? process.env.REMIND_SECRET;

  if (!expectedSecret || secret !== expectedSecret) {
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
  const today = getShanghaiDateKey();

  const { data: profiles, error: profileError } = await supabase
    .from("profiles")
    .select("id, name, status, exempt_type, exempt_start_date, exempt_end_date, exempt_reason")
    .eq("role", "member");

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  const eligibleProfiles = ((profiles ?? []) as ReminderProfile[]).filter(
    (profile) =>
      !getExemptionStateForDate(
        {
          ...profile,
          status: profile.status ?? "active",
        },
        today,
      ).isExempt,
  );
  const eligibleUserIds = eligibleProfiles.map((profile) => profile.id);

  const { data: todayReports, error: todayReportError } = eligibleUserIds.length
    ? await supabase
        .from("daily_reports")
        .select("user_id")
        .in("user_id", eligibleUserIds)
        .eq("report_date", today)
    : { data: [], error: null };

  if (todayReportError) {
    return NextResponse.json({ error: todayReportError.message }, { status: 500 });
  }

  const submittedUserIds = new Set((todayReports ?? []).map((report) => report.user_id));
  const all = eligibleProfiles.map((profile) => ({
    user_id: profile.id,
    name: profile.name,
    submitted: submittedUserIds.has(profile.id),
  }));
  const unsubmitted = all.filter((user) => !user.submitted);
  const submittedCount = all.length - unsubmitted.length;

  if (unsubmitted.length === 0) {
    return NextResponse.json({ message: "All members have submitted today." });
  }

  const streakMap = new Map<string, number>();
  if (unsubmitted.length > 0) {
    const userIds = unsubmitted.map((user) => user.user_id);
    const sevenDaysAgo = shiftDateKey(today, -6);
    const { data: recentReports, error: recentReportError } = await supabase
      .from("daily_reports")
      .select("user_id, report_date")
      .in("user_id", userIds)
      .gte("report_date", sevenDaysAgo);

    if (recentReportError) {
      return NextResponse.json({ error: recentReportError.message }, { status: 500 });
    }

    const reportsByUser = new Map<string, Set<string>>();
    for (const report of recentReports ?? []) {
      if (!reportsByUser.has(report.user_id)) reportsByUser.set(report.user_id, new Set());
      reportsByUser.get(report.user_id)!.add(report.report_date);
    }

    for (const user of unsubmitted) {
      const dates = reportsByUser.get(user.user_id) ?? new Set<string>();
      let streak = 0;

      for (let i = 0; i < 7; i++) {
        const dateKey = shiftDateKey(today, -i);
        if (!dates.has(dateKey)) streak++;
        else break;
      }

      if (streak >= 2) streakMap.set(user.user_id, streak);
    }
  }

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
