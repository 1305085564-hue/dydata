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
import { loadApplicantTeamId } from "@/lib/豁免";
import type { ExemptionCategory } from "@/types";
import { formatShanghaiDateOnly } from "@/lib/loaders/shared";
import { sendFeishuWebhook } from "@/lib/飞书webhook";

function isUuidLike(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim());
}

function parseRequiredNumber(value: string | null | undefined, fieldName: string): number {
  const trimmed = value?.trim();
  if (trimmed === "") {
    throw new Error(`必填数字字段 ${fieldName} 不能为空`);
  }
  const num = Number(trimmed);
  if (!Number.isFinite(num)) {
    throw new Error(`字段 ${fieldName} 必须是有效数字`);
  }
  return num;
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
  let play_count: number;
  let likes: number;
  let comments: number;
  let shares: number;
  let favorites: number;
  let follower_gain: number;
  try {
    play_count = parseRequiredNumber(formData.get("play_count") as string | null, "play_count");
    likes = parseRequiredNumber(formData.get("likes") as string | null, "likes");
    comments = parseRequiredNumber(formData.get("comments") as string | null, "comments");
    shares = parseRequiredNumber(formData.get("shares") as string | null, "shares");
    favorites = parseRequiredNumber(formData.get("favorites") as string | null, "favorites");
    follower_gain = parseRequiredNumber(formData.get("follower_gain") as string | null, "follower_gain");
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : "数字字段解析失败" };
  }
  const completion_rate = formData.get("completion_rate") ? `${formData.get("completion_rate")}%` : null;
  const avg_play_duration = formData.get("avg_play_duration") ? `${formData.get("avg_play_duration")}秒` : null;
  const bounce_rate_2s = formData.get("bounce_rate_2s") ? `${formData.get("bounce_rate_2s")}%` : null;
  const completion_rate_5s = formData.get("completion_rate_5s") ? `${formData.get("completion_rate_5s")}%` : null;
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

  const uploadedAt = new Date().toISOString();

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
    uploaded_at: uploadedAt,
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

  const today = formatShanghaiDateOnly();
  const teamId = await loadApplicantTeamId(
    supabase,
    user.id,
    getTeamMeta(user.user_metadata).teamId,
  );

  // 校验 team_id 必须存在
  if (!teamId) {
    console.error("[exemptions] missing team_id for user", user.id);
    return { error: "账号未分配团队，请联系管理员" };
  }

  const drafts =
    input.dates && input.dates.length > 0
      ? buildRequestDraftsForDates({
          applicantUserId: user.id,
          teamId,
          category: input.category,
          reason: input.reason,
          dates: input.dates,
          today,
        })
      : [
          buildRequestDraft({
            applicantUserId: user.id,
            teamId,
            mode: input.mode,
            category: input.category,
            reason: input.reason,
            today,
            startDate: input.startDate,
            endDate: input.endDate,
          }),
        ];

  try {
    const { error } = await supabase.from("exemption_request").insert(drafts);
    if (error) {
      if (!isMissingExemptionRequestCategoryError(error)) {
        console.error("[exemptions] failed to submit dashboard request", {
          error,
          userId: user.id,
          teamId,
          draftCount: drafts.length,
        });
        return { error: "提交豁免申请失败" };
      }

      const fallback = await supabase
        .from("exemption_request")
        .insert(drafts.map((draft) => stripExemptionCategoryFromRequestDraft(draft)));

      if (fallback.error) {
        console.error("[exemptions] failed to submit legacy dashboard request", {
          error: fallback.error,
          userId: user.id,
          teamId,
        });
        return { error: "提交豁免申请失败" };
      }
    }
  } catch (error) {
    console.error("[exemptions] dashboard request threw", { error, userId: user.id, teamId });
    return { error: "提交豁免申请失败（系统异常）" };
  }

  revalidatePath("/dashboard");
  return {};
}

export async function updateProfile(name: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "请先登录" };

  const trimmed = name?.trim();
  if (!trimmed) return { error: "显示名称不能为空" };
  if (trimmed.length > 20) return { error: "显示名称最多 20 个字符" };

  const { error } = await supabase
    .from("profiles")
    .update({ name: trimmed })
    .eq("id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/dashboard");
  revalidatePath("/growth");
  revalidatePath("/analytics");
  revalidatePath("/admin");
  return { success: true };
}

export async function createAccount(name: string, contentDirection?: string, remark?: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "请先登录" };

  if (!name?.trim()) return { error: "账号名称不能为空" };
  if (isUuidLike(name)) return { error: "账号名不能是一串系统编号，请填写正确的账号名称" };

  const { error } = await supabase.from("accounts").insert({
    profile_id: user.id,
    name: name.trim(),
    content_direction: contentDirection?.trim() || null,
    remark: remark?.trim() || null,
  });

  if (error) return { error: error.message };

  revalidatePath("/dashboard");
  return { success: true };
}

export async function updateAccountName(accountId: string, newName: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "请先登录" };

  const trimmed = newName?.trim();
  if (!trimmed) return { error: "账号名称不能为空" };
  if (trimmed.length > 30) return { error: "账号名称最多 30 个字符" };
  if (isUuidLike(trimmed)) return { error: "账号名称不能是一串系统编号" };

  const { error } = await supabase
    .from("accounts")
    .update({ name: trimmed })
    .eq("id", accountId)
    .eq("profile_id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/dashboard");
  revalidatePath("/growth");
  revalidatePath("/analytics");
  revalidatePath("/admin");
  return { success: true };
}

export async function updateAccountRemark(accountId: string, newRemark: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "请先登录" };

  const trimmed = newRemark?.trim();
  if (trimmed && trimmed.length > 30) return { error: "备注最多 30 个字符" };

  const { error } = await supabase
    .from("accounts")
    .update({ remark: trimmed || null })
    .eq("id", accountId)
    .eq("profile_id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/dashboard");
  revalidatePath("/growth");
  revalidatePath("/analytics");
  revalidatePath("/admin");
  return { success: true };
}

async function notifyFeishu(submitter: string, title: string, playCount: number) {
  const content = `**${submitter}** 提交了日报\n视频：${title}\n播放量：${playCount.toLocaleString("zh-CN")}`;

  const result = await sendFeishuWebhook({
    msg_type: "interactive",
    card: {
      header: {
        title: { tag: "plain_text", content: "日报提交通知" },
        template: "green",
      },
      elements: [{ tag: "div", text: { tag: "lark_md", content } }],
    },
  });

  // 通知失败不影响日报提交主流程，但必须留下真实失败记录，禁止静默伪装成功
  if (!result.ok) {
    console.error(
      JSON.stringify({
        level: "error",
        kind: "api",
        ts: new Date().toISOString(),
        route: "dashboard/actions.notifyFeishu",
        outcome: "feishu_notify_failed",
        reason: result.reason,
        httpStatus: result.status ?? null,
      }),
    );
  }
}
