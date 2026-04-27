"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getTeamMeta } from "@/lib/teams";
import { normalizePublishedAtForStorage } from "@/lib/日报";
import {
  buildRequestDraft,
  buildRequestDraftsForDates,
  isMissingExemptionRequestCategoryError,
  stripExemptionCategoryFromRequestDraft,
  type GrantMode,
} from "@/lib/豁免流程";
import type { ExemptionCategory } from "@/types";

function isUuidLike(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim());
}

export async function submitReport(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "请先登录" };
  }

  const account_id = formData.get("account_id") as string;
  const title = formData.get("title") as string;
  const report_date = formData.get("report_date") as string;
  const play_count = Number(formData.get("play_count"));
  const completion_rate = formData.get("completion_rate") ? `${formData.get("completion_rate")}%` : null;
  const avg_play_duration = formData.get("avg_play_duration") ? `${formData.get("avg_play_duration")}秒` : null;
  const bounce_rate_2s = formData.get("bounce_rate_2s") ? `${formData.get("bounce_rate_2s")}%` : null;
  const completion_rate_5s = formData.get("completion_rate_5s") ? `${formData.get("completion_rate_5s")}%` : null;
  const likes = Number(formData.get("likes"));
  const comments = Number(formData.get("comments"));
  const shares = Number(formData.get("shares"));
  const favorites = Number(formData.get("favorites"));
  const follower_gain = Number(formData.get("follower_gain"));
  const followerConvertRaw = formData.get("follower_convert") as string;
  const follower_convert = followerConvertRaw ? Number(followerConvertRaw) : null;
  const content = (formData.get("content") as string) || null;
  const published_at = normalizePublishedAtForStorage(formData.get("published_at"));

  const { data: account, error: accountError } = await supabase
    .from("accounts")
    .select("id, profile_id")
    .eq("id", account_id)
    .single();

  if (accountError || !account || account.profile_id !== user.id) {
    return { error: "账号不存在或无权限提交" };
  }

  const { data: profile } = await supabase.from("profiles").select("name").eq("id", user.id).single();
  const submitter = profile?.name ?? "未知";

  if (!account_id || !title || !report_date) {
    return { error: "账号、标题和日期为必填项" };
  }

  if (!Number.isFinite(follower_gain) || follower_gain < 0) {
    return { error: "涨粉为必填项" };
  }

  const { data: existing } = await supabase
    .from("daily_reports")
    .select("id")
    .eq("account_id", account_id)
    .eq("report_date", report_date)
    .maybeSingle();

  const payload = {
    user_id: user.id,
    account_id,
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
    follower_gain,
    follower_convert,
    content,
    published_at,
  };

  const { error } = existing
    ? await supabase.from("daily_reports").update(payload).eq("id", existing.id)
    : await supabase.from("daily_reports").insert(payload);

  if (error) {
    return { error: error.message };
  }

  if (!existing) {
    notifyFeishu(submitter, title, play_count).catch(() => {});
  }

  revalidatePath("/dashboard");
  return { success: true, isUpdate: !!existing };
}

export async function hasPendingExemptionRequest(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data } = await supabase
    .from("exemption_request")
    .select("id")
    .eq("applicant_user_id", user.id)
    .eq("request_status", "pending")
    .limit(1);

  return (data?.length ?? 0) > 0;
}

export async function submitExemptionRequest(input: {
  mode: GrantMode;
  category: ExemptionCategory;
  reason: string;
  dates?: string[];
  startDate?: string;
  endDate?: string;
}): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "请先登录" };

  const { data: existing } = await supabase
    .from("exemption_request")
    .select("id")
    .eq("applicant_user_id", user.id)
    .eq("request_status", "pending")
    .limit(1);

  if ((existing?.length ?? 0) > 0) return { error: "已有待审批申请" };

  const today = new Date().toISOString().slice(0, 10);
  const drafts =
    input.dates && input.dates.length > 0
      ? buildRequestDraftsForDates({
          applicantUserId: user.id,
          teamId: getTeamMeta(user.user_metadata).teamId,
          category: input.category,
          reason: input.reason,
          dates: input.dates,
          today,
        })
      : [
          buildRequestDraft({
            applicantUserId: user.id,
            teamId: getTeamMeta(user.user_metadata).teamId,
            mode: input.mode,
            category: input.category,
            reason: input.reason,
            today,
            startDate: input.startDate,
            endDate: input.endDate,
          }),
        ];

  const { error } = await supabase.from("exemption_request").insert(drafts);
  if (error) {
    if (!isMissingExemptionRequestCategoryError(error)) return { error: error.message };

    const fallback = await supabase
      .from("exemption_request")
      .insert(drafts.map((draft) => stripExemptionCategoryFromRequestDraft(draft)));

    if (fallback.error) return { error: fallback.error.message };
  }

  revalidatePath("/dashboard");
  return {};
}

export async function createAccount(name: string, contentDirection?: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "请先登录" };

  if (!name?.trim()) return { error: "账号名称不能为空" };
  if (isUuidLike(name)) return { error: "账号备注名不能是一串系统编号，请填写主账号、矩阵号、出镜号这类名字" };

  const { error } = await supabase.from("accounts").insert({
    profile_id: user.id,
    name: name.trim(),
    content_direction: contentDirection?.trim() || null,
  });

  if (error) return { error: error.message };

  revalidatePath("/dashboard");
  return { success: true };
}

async function notifyFeishu(submitter: string, title: string, playCount: number) {
  const webhookUrl = process.env.FEISHU_WEBHOOK_URL;
  if (!webhookUrl) return;

  const content = `**${submitter}** 提交了日报\n视频：${title}\n播放量：${playCount.toLocaleString("zh-CN")}`;

  await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      msg_type: "interactive",
      card: {
        header: {
          title: { tag: "plain_text", content: "日报提交通知" },
          template: "green",
        },
        elements: [{ tag: "div", text: { tag: "lark_md", content } }],
      },
    }),
  });
}
