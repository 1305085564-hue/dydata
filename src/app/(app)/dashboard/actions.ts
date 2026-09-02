"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  isActiveTeamMembership,
  TEAM_MEMBERSHIP_REQUIRED_MESSAGE,
} from "@/app/api/topics/_shared";
import { normalizePublishedAtForStorage } from "@/lib/日报";
import {
  buildRequestDraft,
  buildRequestDraftsForDates,
  isMissingExemptionRequestCategoryError,
  type GrantMode,
} from "@/lib/豁免流程";
import type { ExemptionCategory } from "@/types";
import { formatShanghaiDateOnly, shiftDateOnly } from "@/lib/loaders/shared";
import { sendFeishuWebhook } from "@/lib/飞书webhook";

function isUuidLike(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim());
}

export function isHistoryVideoSyncFailure(
  videoId: string | null,
  result: { data?: unknown; error?: unknown } | null | undefined,
) {
  return Boolean(result?.error) || Boolean(videoId && !result?.data);
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
  const video_id = formData.get("video_id") as string | null;
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
  const script_author_user_id = (formData.get("script_author_user_id") as string) || null;
  const video_editor_user_id = (formData.get("video_editor_user_id") as string) || null;
  const operator_user_id = (formData.get("operator_user_id") as string) || null;

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
  if (video_id && !isUuidLike(video_id)) {
    return { error: "原视频编号格式不正确，请重新打开编辑窗口" };
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
    script_author_user_id,
    video_editor_user_id,
    operator_user_id,
  };

  const { error } = existing
    ? await supabase.from("daily_reports").update(payload).eq("id", existing.id)
    : await supabase.from("daily_reports").insert(payload);

  if (error) {
    return { error: error.message };
  }

  // 历史编辑已经通过 edit-detail 唯一确认原视频。视频更新使用 service-role
  // 客户端，避免用户态 videos RLS 把“更换共创伙伴”静默拦截，造成日报已写入但视频未同步。
  const videoClient = video_id ? createAdminClient() : supabase;
  const videoUpdate = videoClient
    .from("videos")
    .update({
      title,
      content,
      script_author_user_id,
      video_editor_user_id,
      operator_user_id,
    })
    .eq("account_id", account_id);
  const videoResult = await (video_id
    ? videoUpdate.eq("id", video_id).eq("lifecycle_state", "active").select("id").maybeSingle()
    : videoUpdate.eq("published_at", published_at || uploadedAt));

  if (isHistoryVideoSyncFailure(video_id, videoResult)) {
    return { error: "日报已保存，但原视频责任人同步失败，请重试" };
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

export interface SubmitExemptionRequestInput {
  mode: GrantMode;
  category: ExemptionCategory;
  reason: string;
  dates?: string[];
  startDate?: string;
  endDate?: string;
}

export interface SubmitExemptionRequestResult {
  success?: boolean;
  error?: string;
  submittedDates?: string[];
}

interface ExemptionSubmitContext {
  supabase: Pick<SupabaseClient, "from">;
  user: Pick<User, "id" | "user_metadata">;
}

interface ExemptionSubmitOptions {
  today?: string;
}

const PENDING_EXEMPTION_REQUEST_ERROR = "申请正在提交中，请稍候";

// 同一运行实例内挡住两次并发点击；跨实例仍依赖数据库侧后续唯一约束。
const activeExemptionSubmissions = new Set<string>();

function collectOverlappingPendingDates(
  drafts: Array<{ start_date: string; end_date: string | null }>,
  pendingRows: Array<{ start_date: string | null; end_date: string | null }>,
): string[] {
  const pendingRanges = pendingRows
    .map((row) => {
      const start = typeof row.start_date === "string" ? row.start_date : "";
      const end = typeof row.end_date === "string" && row.end_date >= start ? row.end_date : start;
      return start ? { start, end } : null;
    })
    .filter((range): range is { start: string; end: string } => range !== null);

  const overlapping = new Set<string>();
  for (const draft of drafts) {
    const draftEnd = draft.end_date ?? draft.start_date;
    for (const range of pendingRanges) {
      if (draft.start_date <= range.end && range.start <= draftEnd) {
        const overlapStart = draft.start_date > range.start ? draft.start_date : range.start;
        const overlapEnd = draftEnd < range.end ? draftEnd : range.end;
        // Date-only values are business dates. Keep the fixed +08:00 offset so
        // calendar iteration cannot be affected by the process timezone.
        for (
          let date = overlapStart;
          date <= overlapEnd;
          date = shiftDateOnly(new Date(`${date}T00:00:00+08:00`), 1)
        ) {
          overlapping.add(date);
        }
      }
    }
  }
  return Array.from(overlapping).sort();
}

/**
 * 可测试的 dashboard 豁免申请核心。Server Action 只负责鉴权和缓存失效，
 * 这样分类、pending 防重和失败结果可以直接用小型 Supabase fake 回归。
 */
export async function submitExemptionRequestWithClient(
  input: SubmitExemptionRequestInput,
  context: ExemptionSubmitContext,
  options: ExemptionSubmitOptions = {},
): Promise<SubmitExemptionRequestResult> {
  const { supabase, user } = context;

  if (activeExemptionSubmissions.has(user.id)) {
    return { error: PENDING_EXEMPTION_REQUEST_ERROR };
  }

  activeExemptionSubmissions.add(user.id);

  try {
    if (input.category !== "leave" && input.category !== "waive") {
      return { error: "申请类型不正确" };
    }

    if (!input.reason?.trim()) {
      return { error: "请填写申请原因" };
    }

    const today = options.today ?? formatShanghaiDateOnly();
    const { data: applicantProfile, error: applicantProfileError } = await supabase
      .from("profiles")
      .select("team_id, membership_status")
      .eq("id", user.id)
      .maybeSingle();

    if (applicantProfileError || !applicantProfile || !isActiveTeamMembership(applicantProfile)) {
      console.error("[exemptions] missing team_id for user", user.id);
      return { error: TEAM_MEMBERSHIP_REQUIRED_MESSAGE };
    }

    const teamId = applicantProfile.team_id;

    let drafts;
    try {
      drafts =
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
    } catch (error) {
      return { error: error instanceof Error ? error.message : "申请日期不正确" };
    }

    // 防重口径与 REST API 对齐：只拦日期重叠，不拦「有任意 pending 就禁止再申请」
    const { data: pendingRows, error: pendingError } = await supabase
      .from("exemption_request")
      .select("start_date, end_date")
      .eq("applicant_user_id", user.id)
      .eq("request_status", "pending")
      .eq("exemption_category", input.category)
      .limit(500);

    if (pendingError) {
      console.error("[exemptions] failed to check pending dashboard request", {
        error: pendingError,
        userId: user.id,
      });
      return { error: "暂时无法确认申请状态，请稍后重试" };
    }

    const overlappingDates = collectOverlappingPendingDates(
      drafts,
      (pendingRows ?? []) as Array<{ start_date: string | null; end_date: string | null }>,
    );
    if (overlappingDates.length > 0) {
      return {
        error: `以下日期已有申请在审批中：${overlappingDates.join("、")}。这些日期请等审批完成，其他日期仍可提交。`,
      };
    }

    const { error } = await supabase.from("exemption_request").insert(drafts);
    if (error) {
      console.error("[exemptions] failed to submit dashboard request", {
        error,
        userId: user.id,
        teamId,
        draftCount: drafts.length,
      });

      // 分类字段缺失时不能降级为默认 waive，否则 leave 会被静默改义。
      if (isMissingExemptionRequestCategoryError(error)) {
        return { error: "申请分类字段未就绪，请联系管理员" };
      }

      if (error.code === "23P01" || error.code === "23505") {
        return { error: "已有重叠的待处理申请，请刷新后重试" };
      }

      return { error: "提交豁免申请失败" };
    }

    return {
      success: true,
      submittedDates: drafts.map((draft) => draft.start_date),
    };
  } catch (error) {
    console.error("[exemptions] dashboard request threw", { error, userId: user.id });
    return { error: "豁免申请没能交上去，请稍后再试" };
  } finally {
    activeExemptionSubmissions.delete(user.id);
  }
}

export async function submitExemptionRequest(
  input: SubmitExemptionRequestInput,
): Promise<SubmitExemptionRequestResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "请先登录" };

  const result = await submitExemptionRequestWithClient(input, { supabase, user });
  if (!result.error) revalidatePath("/dashboard");
  return result;
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
