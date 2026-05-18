import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildDataAccessScope } from "@/lib/data-access-scope";
import { getUserPermissions } from "@/lib/permissions";
import { hasPermission } from "@/lib/permission-utils";
import { formatShanghaiDateTime } from "@/lib/日报";

const MAX_EXPORT_ROWS = 10_000;

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

  // 先 count 估算数据量
  let countQuery = adminSupabase
    .from("daily_reports")
    .select("*", { count: "exact", head: true });

  if (scope.kind !== "all") {
    countQuery = scope.visibleUserIds.length > 0
      ? countQuery.in("user_id", scope.visibleUserIds)
      : countQuery.eq("user_id", user.id);
  }

  if (from) countQuery = countQuery.gte("report_date", from);
  if (to) countQuery = countQuery.lte("report_date", to);

  const { count, error: countError } = await countQuery;

  if (countError) {
    return NextResponse.json({ error: countError.message }, { status: 500 });
  }

  const totalCount = count ?? 0;

  if (totalCount > MAX_EXPORT_ROWS) {
    return NextResponse.json(
      {
        error: "数据量过大",
        message: `当前筛选条件匹配 ${totalCount} 条数据，超过 ${MAX_EXPORT_ROWS} 条限制，请缩小时间范围或增加筛选条件后重试`,
        count: totalCount,
      },
      { status: 413 }
    );
  }

  // 小数据量：分页流式读取，避免一次性加载全部到内存
  const PAGE_SIZE = 2000;
  const allRows: Record<string, unknown>[] = [];

  for (let offset = 0; offset < totalCount; offset += PAGE_SIZE) {
    let pageQuery = adminSupabase
      .from("daily_reports")
      .select(
        "report_date, submitter, title, play_count, completion_rate, avg_play_duration, bounce_rate_2s, completion_rate_5s, likes, comments, shares, favorites, follower_gain, follower_convert, content, published_at, uploaded_at, user_id"
      )
      .order("report_date", { ascending: false })
      .order("submitter", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (scope.kind !== "all") {
      pageQuery = scope.visibleUserIds.length > 0
        ? pageQuery.in("user_id", scope.visibleUserIds)
        : pageQuery.eq("user_id", user.id);
    }

    if (from) pageQuery = pageQuery.gte("report_date", from);
    if (to) pageQuery = pageQuery.lte("report_date", to);

    const { data: pageData, error: pageError } = await pageQuery;

    if (pageError) {
      return NextResponse.json({ error: pageError.message }, { status: 500 });
    }

    if (!pageData || pageData.length === 0) break;

    const pageRows = pageData.map((report) => ({
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

    allRows.push(...pageRows);
  }

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(allRows);

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
