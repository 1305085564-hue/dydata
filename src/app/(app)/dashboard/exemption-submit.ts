import type { SupabaseClient, User } from "@supabase/supabase-js";
import { isActiveTeamMembership, TEAM_MEMBERSHIP_REQUIRED_MESSAGE } from "@/app/api/topics/_shared";
import { buildRequestDraft, buildRequestDraftsForDates, isMissingExemptionRequestCategoryError, type GrantMode } from "@/lib/豁免流程";
import type { ExemptionCategory } from "@/types";
import { formatShanghaiDateOnly } from "@/lib/business-time";
import { checkPendingExemptionOverlap } from "@/lib/exemption-application-precheck";
import { writePendingExemptionRequests } from "@/lib/exemption-application-write";

export interface SubmitExemptionRequestInput {
  mode: GrantMode;
  category: ExemptionCategory;
  reason: string;
  dateReasons?: Record<string, string>;
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
      return { error: "申请原因还没填" };
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
              dateReasons: input.dateReasons,
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
    const precheck = await checkPendingExemptionOverlap(supabase, {
      applicantUserId: user.id,
      category: input.category,
      ranges: drafts,
    });
    if (!precheck.ok) {
      console.error(
        precheck.stage === "requests"
          ? "[exemptions] failed to check pending dashboard request"
          : "[exemptions] failed to check pending dashboard request dates",
        { error: precheck.error, userId: user.id },
      );
      return { error: "暂时无法确认申请状态，请稍后重试" };
    }

    const { overlappingDates } = precheck;
    if (overlappingDates.length > 0) {
      return {
        error: `以下日期已有申请在审批中：${overlappingDates.join("、")}。这些日期请等审批完成，其他日期仍可提交。`,
      };
    }

    const writeResult = await writePendingExemptionRequests(supabase, drafts);
    if (!writeResult.ok) {
      const error = writeResult.error as { code?: string; message: string };
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

