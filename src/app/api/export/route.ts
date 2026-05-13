import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildDataAccessScope } from "@/lib/data-access-scope";
import { getUserPermissions } from "@/lib/permissions";
import { hasPermission } from "@/lib/permission-utils";
import { formatShanghaiDateTime } from "@/lib/日报";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const adminSupabase = createAdminClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const permissionInfo = await getUserPermissions();
  if (!permissionInfo || !hasPermission(permissionInfo.businessRole, permissionInfo.permissions, "export_data")) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const scope = await buildDataAccessScope(adminSupabase, user.id);
  if (!scope) {
    return NextResponse.json({ error: "用户信息不存在" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  let query = adminSupabase
    .from("daily_reports")
    .select(
      "report_date, submitter, title, play_count, completion_rate, avg_play_duration, bounce_rate_2s, completion_rate_5s, likes, comments, shares, favorites, follower_gain, follower_convert, content, published_at, uploaded_at, user_id"
    )
    .order("report_date", { ascending: false })
    .order("submitter", { ascending: true });

  if (scope.kind !== "all") {
    query = scope.visibleUserIds.length > 0
      ? query.in("user_id", scope.visibleUserIds)
      : query.eq("user_id", user.id);
  }

  if (from) query = query.gte("report_date", from);
  if (to) query = query.lte("report_date", to);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []).map((report) => ({
    日期: report.report_date,
    提交人: report.submitter,
    视频标题: report.title,
    "播放量(万)": report.play_count != null ? (report.play_count / 10000).toFixed(2) : "",
    完播率: report.completion_rate ?? "",
    平均播放时长: report.avg_play_duration ?? "",
    "2s跳出率": report.bounce_rate_2s ?? "",
    "5s完播率": report.completion_rate_5s ?? "",
    涨粉: report.follower_gain,
    导粉: report.follower_convert ?? "",
    点赞: report.likes,
    评论: report.comments,
    分享: report.shares,
    收藏: report.favorites,
    文案内容: report.content ? (report.content.length > 50 ? `${report.content.slice(0, 50)}...` : report.content) : "",
    发布时间: report.published_at ? formatShanghaiDateTime(report.published_at) : "",
    上传时间: report.uploaded_at ? formatShanghaiDateTime(report.uploaded_at) : "",
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);

  ws["!cols"] = [
    { wch: 12 },
    { wch: 10 },
    { wch: 30 },
    { wch: 12 },
    { wch: 10 },
    { wch: 14 },
    { wch: 10 },
    { wch: 10 },
    { wch: 8 },
    { wch: 8 },
    { wch: 8 },
    { wch: 8 },
    { wch: 8 },
    { wch: 8 },
    { wch: 40 },
    { wch: 18 },
    { wch: 18 },
  ];

  XLSX.utils.book_append_sheet(wb, ws, "数据日报");

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const filename = `抖音数据日报${from ? `_${from}` : ""}${to ? `_至_${to}` : ""}.xlsx`;

  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
