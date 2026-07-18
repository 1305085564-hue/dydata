import type { SupabaseClient } from "@supabase/supabase-js";

import { createAdminClient } from "@/lib/supabase/admin";

import {
  parseApprovedDraftItem,
  parsePublishDraft,
  parseReviewQueueItem,
  type ApprovedDraftItem,
  type PublishDraft,
  type ReviewQueueItem,
} from "./types";

type PublishDraftReadModelClientFactories = {
  createAdminClient: typeof createAdminClient;
};

const defaultPublishDraftReadModelClientFactories: PublishDraftReadModelClientFactories = {
  createAdminClient,
};

let publishDraftReadModelClientFactories = defaultPublishDraftReadModelClientFactories;

export const PUBLISH_DRAFT_SELECT =
  "id, submitted_by, account_id, account_name_snapshot, team_id, script_text, screenshot_paths, status, current_round, feedback_history, reviewed_by, reviewed_at, approved_at, is_deleted, created_at, updated_at";

export type ReviewQueuePayload = {
  pending_count: number;
  queue: ReviewQueueItem[];
};

type ApprovedListParams = {
  limit?: number;
  accountId?: string | null;
  search?: string | null;
};

export function setPublishDraftReadModelClientsForTest(
  factories: Partial<PublishDraftReadModelClientFactories>,
): void {
  publishDraftReadModelClientFactories = {
    ...defaultPublishDraftReadModelClientFactories,
    ...factories,
  };
}

export function resetPublishDraftReadModelClientsForTest(): void {
  publishDraftReadModelClientFactories = defaultPublishDraftReadModelClientFactories;
}

type ApprovedListRow = {
  id?: unknown;
  script_text?: unknown;
  screenshot_paths?: unknown;
  account_id?: unknown;
  account_name_snapshot?: unknown;
  approved_at?: unknown;
  submitted_by_name?: unknown;
  submitted_by?: unknown;
  profiles?: {
    name?: unknown;
  } | null;
};

function asRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isSchemaCacheMiss(error: { message?: string | null; details?: string | null; hint?: string | null } | null) {
  if (!error) return false;
  const text = [error.message, error.details, error.hint].filter(Boolean).join(" ").toLowerCase();
  return text.includes("schema cache") || text.includes("could not find the function");
}

function mapApprovedRows(rows: unknown[]): ApprovedDraftItem[] {
  return rows.flatMap((item) => {
    const parsed = parseApprovedDraftItem(item);
    return parsed ? [parsed] : [];
  });
}

function normalizeApprovedFallbackRow(row: ApprovedListRow) {
  const submittedByName = typeof row.submitted_by_name === "string" && row.submitted_by_name.trim()
    ? row.submitted_by_name
    : typeof row.profiles?.name === "string" && row.profiles.name.trim()
      ? row.profiles.name
      : "未命名成员";

  return {
    ...row,
    submitted_by_name: submittedByName,
  };
}

async function loadApprovedListFallback(
  supabase: SupabaseClient,
  { limit, accountId, search }: Required<ApprovedListParams>,
): Promise<{
  data: ApprovedDraftItem[] | null;
  errorMessage?: string;
}> {
  let query = supabase
    .from("publish_drafts")
    .select(
      "id, script_text, screenshot_paths, account_id, account_name_snapshot, approved_at, submitted_by, profiles!publish_drafts_submitted_by_fkey(name)",
    )
    .eq("is_deleted", false)
    .eq("status", "approved")
    .order("approved_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 200));

  if (accountId) {
    query = query.eq("account_id", accountId);
  }

  if (search) {
    query = query.ilike("script_text", `%${search}%`);
  }

  const { data, error } = await query;

  if (error) {
    return { data: null, errorMessage: `获取已通过列表失败: ${error.message}` };
  }

  return {
    data: mapApprovedRows(
      (data ?? []).map((item) => normalizeApprovedFallbackRow((item ?? {}) as ApprovedListRow)),
    ),
  };
}

export async function loadReviewQueue(userId: string): Promise<{
  data: ReviewQueuePayload | null;
  errorMessage?: string;
}> {
  const supabase = publishDraftReadModelClientFactories.createAdminClient();
  const { data, error } = await supabase.rpc("publish_drafts_review_queue", {
    p_user_id: userId,
  });

  if (error) {
    return { data: null, errorMessage: "获取审核队列失败" };
  }

  if (!asRecord(data)) {
    return { data: null, errorMessage: "审核队列返回格式不合法" };
  }

  const pendingCount = typeof data.pending_count === "number" ? data.pending_count : 0;
  const queueSource = Array.isArray(data.queue) ? data.queue : [];
  const queue = queueSource.flatMap((item) => {
    const parsed = parseReviewQueueItem(item);
    return parsed ? [parsed] : [];
  });

  return {
    data: {
      pending_count: pendingCount,
      queue,
    },
  };
}

export async function loadApprovedList({
  limit = 50,
  accountId = null,
  search = null,
}: ApprovedListParams): Promise<{
  data: ApprovedDraftItem[] | null;
  errorMessage?: string;
}> {
  const supabase = publishDraftReadModelClientFactories.createAdminClient();
  const params: Record<string, unknown> = { p_limit: limit };
  if (accountId) params.p_account_id = accountId;
  if (search) params.p_search = search;

  const { data, error } = await supabase.rpc("publish_drafts_approved_list", params);

  if (error) {
    if (isSchemaCacheMiss(error)) {
      return loadApprovedListFallback(supabase, {
        limit,
        accountId,
        search,
      });
    }
    console.error("[loadApprovedList] RPC error:", JSON.stringify(error));
    return { data: null, errorMessage: `获取已通过列表失败: ${error.message}` };
  }

  if (!Array.isArray(data)) {
    return { data: null, errorMessage: "已通过列表返回格式不合法" };
  }

  return {
    data: mapApprovedRows(data),
  };
}

export async function loadDraftById(
  supabase: SupabaseClient,
  id: string,
): Promise<{
  data: PublishDraft | null;
  errorMessage?: string;
}> {
  const { data, error } = await supabase
    .from("publish_drafts")
    .select(PUBLISH_DRAFT_SELECT)
    .eq("id", id)
    .eq("is_deleted", false)
    .maybeSingle();

  if (error) {
    return { data: null, errorMessage: "获取稿件详情失败" };
  }

  if (!data) {
    return { data: null };
  }

  const parsed = parsePublishDraft(data);
  if (!parsed) {
    return { data: null, errorMessage: "稿件详情返回格式不合法" };
  }

  return { data: parsed };
}

export async function loadOwnDrafts(
  supabase: SupabaseClient,
  userId: string,
): Promise<{
  data: PublishDraft[] | null;
  errorMessage?: string;
}> {
  const { data, error } = await supabase
    .from("publish_drafts")
    .select(PUBLISH_DRAFT_SELECT)
    .eq("submitted_by", userId)
    .eq("is_deleted", false)
    .order("updated_at", { ascending: false });

  if (error) {
    return { data: null, errorMessage: "获取我的稿件失败" };
  }

  return {
    data: (data ?? []).flatMap((item) => {
      const parsed = parsePublishDraft(item);
      return parsed ? [parsed] : [];
    }),
  };
}
