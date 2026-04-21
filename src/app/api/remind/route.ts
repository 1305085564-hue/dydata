import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { buildReminderContent } from "@/lib/飞书提醒";
import { getChinaWorkingDayReason, getShanghaiYear, hasChinaHolidayPlan, isChinaWorkingDay } from "@/lib/工作日";
import { isCronAuthorized } from "@/lib/cron-auth";

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const shanghaiYear = getShanghaiYear();
  if (!hasChinaHolidayPlan(shanghaiYear)) {
    console.warn(`[api/remind] ${shanghaiYear} 节假日清单未更新，当前按周末规则兜底，请补充 src/lib/工作日.ts`);
  }

  if (!isChinaWorkingDay()) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: getChinaWorkingDayReason(),
    });
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey!,
  );

  const { data, error } = await supabase.rpc("get_today_submission_status");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const all = data as { user_id: string; name: string; submitted: boolean }[];
  const unsubmitted = all.filter((u) => !u.submitted);
  const submittedCount = all.length - unsubmitted.length;

  if (unsubmitted.length === 0) {
    return NextResponse.json({ message: "All members have submitted today." });
  }

  // 检测连续未交天数
  const streakMap = new Map<string, number>();
  if (unsubmitted.length > 0) {
    const userIds = unsubmitted.map((u) => u.user_id);
    // 查最近7天的提交记录
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
    const { data: recentReports } = await supabase
      .from("daily_reports")
      .select("user_id, report_date")
      .in("user_id", userIds)
      .gte("report_date", sevenDaysAgo);

    const reportsByUser = new Map<string, Set<string>>();
    for (const r of recentReports ?? []) {
      if (!reportsByUser.has(r.user_id)) reportsByUser.set(r.user_id, new Set());
      reportsByUser.get(r.user_id)!.add(r.report_date);
    }

    for (const u of unsubmitted) {
      const dates = reportsByUser.get(u.user_id) ?? new Set();
      let streak = 0;
      for (let i = 0; i < 7; i++) {
        const d = new Date(Date.now() - i * 86400000).toISOString().split("T")[0];
        if (!dates.has(d)) streak++;
        else break;
      }
      if (streak >= 2) streakMap.set(u.user_id, streak);
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

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      msg_type: "interactive",
      card: {
        header: {
          title: { tag: "plain_text", content: "📊 抖音数据日报提交提醒" },
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

  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json({ error: `Feishu webhook failed: ${text}` }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    unsubmitted: unsubmitted.map((u) => u.name),
    escalated: escalatedMembers.map((member) => member.name),
    escalationManager: escalationManager?.name ?? null,
    total: all.length,
    submitted: submittedCount,
  });
}
