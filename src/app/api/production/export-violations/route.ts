import { NextRequest, NextResponse } from "next/server";

import {
  UUID_PATTERN,
  escapeCsvCell,
  isValidDate,
  requireOwnerOrAdminActor,
} from "@/app/api/production/_shared";

type ProductionDashboardRow = {
  user_id: string;
  user_name: string | null;
  team_id: string | null;
  team_name: string | null;
  group_id: string | null;
  group_name: string | null;
  daily_target: number;
  submitted_count: number;
  gap: number;
  exemption_status: string;
  alert_level: string;
};

export async function GET(request: NextRequest) {
  const auth = await requireOwnerOrAdminActor();
  if ("response" in auth) return auth.response;

  const date = request.nextUrl.searchParams.get("date")?.trim() ?? "";
  if (!isValidDate(date)) {
    return NextResponse.json({ error: "date 必须是 YYYY-MM-DD" }, { status: 400 });
  }

  const teamId = request.nextUrl.searchParams.get("team_id")?.trim() || null;
  const groupId = request.nextUrl.searchParams.get("group_id")?.trim() || null;
  if (teamId && !UUID_PATTERN.test(teamId)) {
    return NextResponse.json({ error: "team_id 必须是 uuid" }, { status: 400 });
  }
  if (groupId && !UUID_PATTERN.test(groupId)) {
    return NextResponse.json({ error: "group_id 必须是 uuid" }, { status: 400 });
  }

  const { data, error } = await auth.supabase.rpc("get_production_dashboard", {
    p_date: date,
    p_team_id: teamId,
    p_group_id: groupId,
  });

  if (error) {
    return NextResponse.json({ error: error.message || "导出红灯名单失败" }, { status: 500 });
  }

  const rows = ((data ?? []) as ProductionDashboardRow[]).filter((row) => row.alert_level === "red");
  const header = ["日期", "成员", "团队", "小组", "目标", "已提交", "缺口", "豁免状态", "预警"];
  const lines = [
    header.map(escapeCsvCell).join(","),
    ...rows.map((row) =>
      [
        date,
        row.user_name ?? "",
        row.team_name ?? "",
        row.group_name ?? "",
        row.daily_target,
        row.submitted_count,
        row.gap,
        row.exemption_status,
        row.alert_level,
      ].map(escapeCsvCell).join(","),
    ),
  ];
  const csv = `\uFEFF${lines.join("\r\n")}`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="production-violations-${date}.csv"`,
    },
  });
}
