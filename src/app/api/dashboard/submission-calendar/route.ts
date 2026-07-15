import { NextResponse } from "next/server";

import { resolveSubmissionDayStatus } from "@/app/(app)/dashboard/video-submit-panel-state";
import { createClient } from "@/lib/supabase/server";
import { loadDashboardPageData } from "@/lib/loaders/dashboard-page";
import { loadDashboardActivityData } from "@/lib/loaders/dashboard-activity";
import { getExemptionDatesForMonth, getExemptionStateForDate } from "@/lib/豁免";

function listMonthDates(referenceDate: string) {
  const date = new Date(`${referenceDate}T00:00:00.000Z`);
  const cursor = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
  const dates: string[] = [];

  while (cursor.getTime() <= end.getTime()) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dates;
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  try {
    const [dashboard, activity] = await Promise.all([
      loadDashboardPageData({ supabase, userId: user.id }),
      loadDashboardActivityData({ supabase, userId: user.id }),
    ]);

    const reportByDate = new Map(
      activity.monthReports.map((report) => [report.report_date, report]),
    );
    const exemptionDates = getExemptionDatesForMonth(
      dashboard.userExemptionProfile,
      dashboard.today,
      dashboard.userExemptionGrants,
    );

    const days = listMonthDates(dashboard.today).map((date) => {
      const report = reportByDate.get(date) ?? null;
      const exemption = getExemptionStateForDate(
        dashboard.userExemptionProfile,
        date,
        dashboard.userExemptionGrants,
      );
      const status = resolveSubmissionDayStatus({
        date,
        today: dashboard.today,
        report,
        exemption,
      });

      return {
        date,
        ...status,
      };
    });

    return NextResponse.json({
      today: dashboard.today,
      todaySubmitted: days.find((day) => day.date === dashboard.today)?.state === "submitted",
      submittedDates: activity.monthSubmittedDates,
      waiveDates: exemptionDates.waiveDates,
      leaveDates: exemptionDates.leaveDates,
      days,
      actions: {
        backfill: {
          method: "POST",
          path: "/api/video-submit",
          dateField: "biz_date",
        },
        applyExemption: {
          method: "POST",
          path: "/api/exemptions/apply",
          fields: ["exemption_type", "start_date", "end_date", "reason"],
        },
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "加载本月提交状态失败" },
      { status: 500 },
    );
  }
}
