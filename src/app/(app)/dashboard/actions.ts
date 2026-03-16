"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function submitReport(formData: FormData) {
  const supabase = await createClient();

  const user_id = formData.get("user_id") as string;
  const title = formData.get("title") as string;
  const report_date = formData.get("report_date") as string;
  const play_count = Math.round(Number(formData.get("play_count")) * 10000);
  const completion_rate = formData.get("completion_rate") ? `${formData.get("completion_rate")}%` : null;
  const avg_play_duration = formData.get("avg_play_duration") ? `${formData.get("avg_play_duration")}秒` : null;
  const bounce_rate_2s = formData.get("bounce_rate_2s") ? `${formData.get("bounce_rate_2s")}%` : null;
  const completion_rate_5s = formData.get("completion_rate_5s") ? `${formData.get("completion_rate_5s")}%` : null;
  const likes = Number(formData.get("likes"));
  const comments = Number(formData.get("comments"));
  const shares = Number(formData.get("shares"));
  const favorites = Number(formData.get("favorites"));
  const content = (formData.get("content") as string) || null;
  const publishedAtRaw = formData.get("published_at") as string;
  const published_at = publishedAtRaw ? new Date(publishedAtRaw).toISOString() : null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("name")
    .eq("id", user_id)
    .single();

  const submitter = profile?.name ?? "未知";

  if (!title || !report_date) {
    return { error: "标题和日期为必填项" };
  }

  // 检查是否已有该日期的记录（upsert）
  const { data: existing } = await supabase
    .from("daily_reports")
    .select("id")
    .eq("user_id", user_id)
    .eq("report_date", report_date)
    .maybeSingle();

  const payload = {
    user_id,
    title,
    submitter,
    report_date,
    play_count,
    completion_rate,
    avg_play_duration,
    bounce_rate_2s,
    completion_rate_5s,
    likes,
    comments,
    shares,
    favorites,
    content,
    published_at,
  };

  const { error } = existing
    ? await supabase.from("daily_reports").update(payload).eq("id", existing.id)
    : await supabase.from("daily_reports").insert(payload);

  if (error) {
    return { error: error.message };
  }

  // 飞书通知管理员（异步，不阻塞返回）
  if (!existing) {
    notifyFeishu(submitter, title, play_count).catch(() => {});
  }

  revalidatePath("/dashboard");
  return { success: true, isUpdate: !!existing };
}

async function notifyFeishu(submitter: string, title: string, playCount: number) {
  const webhookUrl = process.env.FEISHU_WEBHOOK_URL;
  if (!webhookUrl) return;

  const playWan = (playCount / 10000).toFixed(2);
  const content = `**${submitter}** 提交了日报\n视频：${title}\n播放量：${playWan}万`;

  await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      msg_type: "interactive",
      card: {
        header: {
          title: { tag: "plain_text", content: "✅ 日报提交通知" },
          template: "green",
        },
        elements: [
          { tag: "div", text: { tag: "lark_md", content } },
        ],
      },
    }),
  });
}
