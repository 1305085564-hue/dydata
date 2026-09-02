import type { SupabaseClient } from "@supabase/supabase-js";

import type { buildGrantDraft, ReviewDecision } from "@/lib/豁免流程";

type GrantDraft = ReturnType<typeof buildGrantDraft>;
type ExemptionRpcClient = Pick<SupabaseClient, "rpc">;

export type ExemptionRpcResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; status: number; message: string; readonly cause?: unknown };

const SAFE_RPC_MESSAGES = new Map<string, { status: number; message: string }>([
  ["申请不存在", { status: 404, message: "豁免申请不存在" }],
  ["用户资料不存在", { status: 404, message: "用户信息不存在" }],
  ["该申请已处理", { status: 409, message: "该申请已处理" }],
  ["仅支持改判已审批的申请", { status: 409, message: "仅支持改判已审批的申请" }],
  ["审核决定不正确", { status: 400, message: "审核决定不正确" }],
  ["豁免类型不正确", { status: 400, message: "豁免类型不正确" }],
  ["豁免分类不正确", { status: 400, message: "豁免分类不正确" }],
  ["豁免日期不正确", { status: 400, message: "豁免日期不正确" }],
  ["永久豁免必须填写原因", { status: 400, message: "永久豁免必须填写原因" }],
  ["申请人与团队不一致", { status: 409, message: "申请信息已失效，请重新提交" }],
]);

function toFailure(error: unknown): ExemptionRpcResult<never> {
  let status = 500;
  let message = "豁免操作失败";
  const rpcError = error && typeof error === "object"
    ? error as { code?: unknown; message?: unknown }
    : null;

  if (rpcError?.code === "42501") {
    status = 403;
    message = "不能操作当前管理范围外的成员";
  } else if (typeof rpcError?.message === "string") {
    const safe = SAFE_RPC_MESSAGES.get(rpcError.message);
    if (safe) {
      status = safe.status;
      message = safe.message;
    }
  }

  const failure: ExemptionRpcResult<never> = { ok: false, status, message };
  Object.defineProperty(failure, "cause", { value: error, enumerable: false });
  return failure;
}

export async function applyExemptionGrantAtomically(input: {
  supabase: ExemptionRpcClient;
  draft: GrantDraft;
  replaceExisting: boolean;
  groupModeTokenHash?: string;
}): Promise<ExemptionRpcResult> {
  try {
    const rpcName = input.groupModeTokenHash ? "apply_exemption_grant_atomically_v2" : "apply_exemption_grant_atomically";
    const params = {
      p_user_id: input.draft.grant.user_id,
      p_grant_start_date: input.draft.grant.start_date,
      p_grant_end_date: input.draft.grant.end_date,
      p_grant_type: input.draft.grant.grant_type,
      p_exemption_category: input.draft.grant.exemption_category,
      p_reason: input.draft.profile.exempt_reason,
      p_replace_existing: input.replaceExisting,
      ...(input.groupModeTokenHash ? { p_group_mode_token_hash: input.groupModeTokenHash } : {}),
    };
    const { data, error } = await input.supabase.rpc(rpcName, params);

    return error ? toFailure(error) : { ok: true, data };
  } catch (error) {
    return toFailure(error);
  }
}

export async function clearExemptionGrantAtomically(input: {
  supabase: ExemptionRpcClient;
  userId: string;
  groupModeTokenHash?: string;
}): Promise<ExemptionRpcResult> {
  try {
    const rpcName = input.groupModeTokenHash ? "clear_exemption_grant_atomically_v2" : "clear_exemption_grant_atomically";
    const { data, error } = await input.supabase.rpc(rpcName, {
      p_user_id: input.userId,
      ...(input.groupModeTokenHash ? { p_group_mode_token_hash: input.groupModeTokenHash } : {}),
    });

    return error ? toFailure(error) : { ok: true, data };
  } catch (error) {
    return toFailure(error);
  }
}

export async function reReviewExemptionRequestAtomically(input: {
  supabase: ExemptionRpcClient;
  requestId: string;
  decision: ReviewDecision;
  groupModeTokenHash?: string;
}): Promise<ExemptionRpcResult> {
  try {
    const { data, error } = await input.supabase.rpc("re_review_exemption_request_atomically", {
      p_request_id: input.requestId,
      p_decision: input.decision,
      ...(input.groupModeTokenHash ? { p_group_mode_token_hash: input.groupModeTokenHash } : {}),
    });

    return error ? toFailure(error) : { ok: true, data };
  } catch (error) {
    return toFailure(error);
  }
}

export async function reviewExemptionRequestAtomically(input: {
  supabase: ExemptionRpcClient;
  requestId: string;
  decision: ReviewDecision;
  dates?: string[];
  feedback?: string | null;
  groupModeTokenHash?: string;
}): Promise<ExemptionRpcResult> {
  try {
    if (input.dates?.length || input.feedback !== undefined) {
      const { data, error } = await input.supabase.rpc("review_exemption_request_dates_atomically", {
        p_request_id: input.requestId,
        p_decision: input.decision,
        p_dates: input.dates?.length ? input.dates : null,
        p_feedback: input.feedback ?? null,
        ...(input.groupModeTokenHash ? { p_group_mode_token_hash: input.groupModeTokenHash } : {}),
      });
      return error ? toFailure(error) : { ok: true, data };
    }
    const rpcName = input.groupModeTokenHash ? "review_exemption_request_atomically_v2" : "review_exemption_request_atomically";
    const { data, error } = await input.supabase.rpc(rpcName, {
      p_request_id: input.requestId,
      p_decision: input.decision,
      ...(input.groupModeTokenHash ? { p_group_mode_token_hash: input.groupModeTokenHash } : {}),
    });

    return error ? toFailure(error) : { ok: true, data };
  } catch (error) {
    return toFailure(error);
  }
}
