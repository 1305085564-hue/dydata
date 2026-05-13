import { NextRequest, NextResponse } from "next/server";
import { callAiText } from "@/lib/ai/client";
import { buildDataAccessScope } from "@/lib/data-access-scope";
import { getUserPermissions } from "@/lib/permissions";
import { hasPermission } from "@/lib/permission-utils";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const permissionInfo = await getUserPermissions();
  if (!permissionInfo || !hasPermission(permissionInfo.businessRole, permissionInfo.permissions, "view_analytics")) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }
  const adminSupabase = createAdminClient();
  const scope = await buildDataAccessScope(adminSupabase, user.id);
  if (!scope) {
    return NextResponse.json({ error: "用户信息不存在" }, { status: 403 });
  }

  const body = await request.json();
  const type: "week" | "month" = body.type === "month" ? "month" : "week";

  const days = type === "month" ? 30 : 7;
  const since = new Date(Date.now() - days * 86400000).toISOString().split("T")[0];
  const label = type === "month" ? "月" : "周";

  let query = adminSupabase
    .from("daily_reports")
    .select("submitter, title, report_date, play_count, completion_rate, avg_play_duration, likes, comments, shares, favorites, content")
    .gte("report_date", since)
    .order("report_date", { ascending: true });
  if (scope.kind !== "all") {
    query = scope.visibleUserIds.length > 0
      ? query.in("user_id", scope.visibleUserIds)
      : query.eq("user_id", user.id);
  }
  const { data: reports, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!reports || reports.length === 0) {
    return NextResponse.json({ error: "该时段无数据" }, { status: 400 });
  }

  const dataStr = reports.map((r) => {
    const play = r.play_count != null ? (r.play_count / 10000).toFixed(2) + "万" : "无";
    const contentSnippet = r.content ? `文案：${r.content.length > 60 ? r.content.slice(0, 60) + "..." : r.content}` : "";
    return `${r.report_date} | ${r.submitter} | ${r.title} | 播放${play} | 完播率${r.completion_rate ?? "无"} | 时长${r.avg_play_duration ?? "无"} | 赞${r.likes} 评${r.comments} 转${r.shares} 藏${r.favorites}${contentSnippet ? " | " + contentSnippet : ""}`;
  }).join("\n");

  const hasContent = reports.some((r) => r.content);

  const prompt = `你是一个抖音短视频数据分析师。以下是团队近${days}天的视频数据。

数据：
${dataStr}

请严格按以下4个板块输出中文分析报告，每条结论必须附带具体数据作为依据（如"播放量X万"、"较前期变化X%"、"占比X%"等）。

## 一、本${label}期结论
用3-5句话概括本周期整体表现，包含：总播放量、日均播放、互动总量、与上周期对比变化。

## 二、最值得复制的3条特征
从表现最好的作品中提炼3条可复制的共性特征，每条格式：
- 特征描述（数据依据：具体数字）

## 三、最需要关注的3个问题
从数据中发现的3个需要关注的问题或下滑趋势，每条格式：
- 问题描述（数据依据：具体数字）

## 四、下${label}建议动作
给出3条具体可执行的建议，必须是"谁做什么"的格式，不要空泛建议。${hasContent ? "\n\n## 五、文案特征分析\n分析爆款文案的共性特征（长度、关键词、句式），给出2条文案方向建议。" : ""}

保持简洁专业，禁止套话空话。`;

  try {
    const result = await callAiText(prompt, { maxTokens: 2000 });
    const insight = result.content;

    return NextResponse.json({ insight, type, since, count: reports.length });
  } catch (e) {
    return NextResponse.json({ error: `AI 请求异常: ${(e as Error).message}` }, { status: 500 });
  }
}
