import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildAnalyticsAccessContext } from "@/lib/analytics-access";
import { formatShanghaiDateTime } from "@/lib/日报";
import * as XLSX from "xlsx";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const adminSupabase = createAdminClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [{ data: profile }, { data: demoTeam }] = await Promise.all([
    supabase
      .from("profiles")
      .select("name, role, team_id")
      .eq("id", user.id)
      .single(),
    adminSupabase.from("teams").select("id").eq("is_demo", true).limit(1).maybeSingle(),
  ]);

  const role = profile?.role ?? "member";
  const access = buildAnalyticsAccessContext({
    userId: user.id,
    role,
    teamId: profile?.team_id ?? null,
    demoTeamId: demoTeam?.id ?? null,
  });

  if (!access.effectiveTeamId) {
    return NextResponse.json({ error: "No team available" }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  let query = adminSupabase
    .from("daily_reports")
    .select(
      "report_date, submitter, title, play_count, completion_rate, avg_play_duration, bounce_rate_2s, completion_rate_5s, likes, comments, shares, favorites, follower_gain, follower_convert, content, published_at, uploaded_at, user_id, profiles!inner(team_id)"
    )
    .eq("profiles.team_id", access.effectiveTeamId)
    .order("report_date", { ascending: false })
    .order("submitter", { ascending: true });

  if (!access.canViewAllMembers) {
    query = query.eq("user_id", user.id);
  }

  if (from) query = query.gte("report_date", from);
  if (to) query = query.lte("report_date", to);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 转换为 Excel 友好格式
  const rows = (data ?? []).map((r) => ({
    日期: r.report_date,
    提交人: r.submitter,
    视频标题: r.title,
    "播放量(万)": r.play_count != null ? (r.play_count / 10000).toFixed(2) : "",
    完播率: r.completion_rate ?? "",
    平均播放时长: r.avg_play_duration ?? "",
    "2s跳出率": r.bounce_rate_2s ?? "",
    "5s完播率": r.completion_rate_5s ?? "",
    涨粉: r.follower_gain,
    导粉: r.follower_convert ?? "",
    点赞: r.likes,
    评论: r.comments,
    分享: r.shares,
    收藏: r.favorites,
    文案内容: r.content ? (r.content.length > 50 ? r.content.slice(0, 50) + "..." : r.content) : "",
    发布时间: r.published_at ? formatShanghaiDateTime(r.published_at) : "",
    上传时间: r.uploaded_at ? formatShanghaiDateTime(r.uploaded_at) : "",
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);

  // 设置列宽
  ws["!cols"] = [
    { wch: 12 }, // 日期
    { wch: 10 }, // 提交人
    { wch: 30 }, // 标题
    { wch: 12 }, // 播放量
    { wch: 10 }, // 完播率
    { wch: 14 }, // 平均播放时长
    { wch: 10 }, // 2s跳出率
    { wch: 10 }, // 5s完播率
    { wch: 8 },  // 涨粉
    { wch: 8 },  // 导粉
    { wch: 8 },  // 点赞
    { wch: 8 },  // 评论
    { wch: 8 },  // 分享
    { wch: 8 },  // 收藏
    { wch: 40 }, // 文案内容
    { wch: 18 }, // 发布时间
    { wch: 18 }, // 上传时间
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
