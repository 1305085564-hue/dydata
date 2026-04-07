import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { callAiText } from "@/lib/ai/client";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get("secret");
  const type = searchParams.get("type") ?? "week"; // "week" or "month"
  const expectedSecret = process.env.CRON_SECRET ?? process.env.REMIND_SECRET;

  if (!expectedSecret || secret !== expectedSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey!,
  );

  const now = new Date();
  const days = type === "month" ? 30 : 7;
  const since = new Date(now.getTime() - days * 86400000).toISOString().split("T")[0];
  const label = type === "month" ? "月报" : "周报";

  const { data: reports, error } = await supabase
    .from("daily_reports")
    .select("submitter, play_count, likes, comments, shares, favorites, report_date")
    .gte("report_date", since);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!reports || reports.length === 0) {
    return NextResponse.json({ message: "No data for report period." });
  }

  // Aggregate by submitter
  const byPerson = new Map<string, { play: number; likes: number; comments: number; shares: number; favorites: number; count: number }>();
  let totalPlay = 0;
  let totalLikes = 0;
  const dateSet = new Set<string>();

  for (const r of reports) {
    const name = r.submitter ?? "未知";
    const cur = byPerson.get(name) ?? { play: 0, likes: 0, comments: 0, shares: 0, favorites: 0, count: 0 };
    cur.play += r.play_count ?? 0;
    cur.likes += r.likes ?? 0;
    cur.comments += r.comments ?? 0;
    cur.shares += r.shares ?? 0;
    cur.favorites += r.favorites ?? 0;
    cur.count += 1;
    byPerson.set(name, cur);
    totalPlay += r.play_count ?? 0;
    totalLikes += r.likes ?? 0;
    dateSet.add(r.report_date);
  }

  // Top 5 by play count
  const ranked = Array.from(byPerson.entries())
    .map(([name, d]) => ({ name, ...d }))
    .sort((a, b) => b.play - a.play);

  const top5 = ranked.slice(0, 5);
  const rankList = top5.map((r, i) => {
    const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;
    return `${medal} ${r.name}：${(r.play / 10000).toFixed(1)}万播放，${r.likes}赞`;
  }).join("\n");

  const activeDays = dateSet.size;
  const avgDailyPlay = activeDays > 0 ? (totalPlay / activeDays / 10000).toFixed(1) : "0";

  const content = [
    `📊 **团队数据${label}**（${since} ~ ${now.toISOString().split("T")[0]}）`,
    "",
    `**整体数据**`,
    `- 总播放量：${(totalPlay / 10000).toFixed(1)}万`,
    `- 日均播放：${avgDailyPlay}万`,
    `- 总点赞：${totalLikes}`,
    `- 提交总数：${reports.length}条（${byPerson.size}人）`,
    "",
    `**播放量 TOP 5**`,
    rankList,
  ].join("\n");

  // AI 洞察（静默失败不阻塞）
  let aiSection = "";
  try {
    const dataStr = reports.map((r) => {
      const play = r.play_count != null ? (r.play_count / 10000).toFixed(2) + "万" : "无";
      return `${r.report_date} | ${r.submitter} | 播放${play} | 赞${r.likes} 评${r.comments} 转${r.shares} 藏${r.favorites}`;
    }).join("\n");

    const aiResult = await callAiText(
      `你是抖音数据分析师。以下是团队近${days}天数据，请用中文给出3条简短洞察（每条一句话）：\n${dataStr}`,
      { maxTokens: 500 },
    );
    aiSection = `\n\n**🤖 AI 洞察**\n${aiResult.content}`;
  } catch {
    // 静默失败
  }

  const finalContent = content + aiSection;

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
          title: { tag: "plain_text", content: `📈 团队数据${label}` },
          template: "blue",
        },
        elements: [
          { tag: "div", text: { tag: "lark_md", content: finalContent } },
        ],
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json({ error: `Feishu webhook failed: ${text}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true, type, since, people: byPerson.size, submissions: reports.length });
}
