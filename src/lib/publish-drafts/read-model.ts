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

export type ReviewQueuePayload = {
  pending_count: number;
  queue: ReviewQueueItem[];
};

type ApprovedListParams = {
  limit?: number;
  accountId?: string | null;
  search?: string | null;
};

function asRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export async function loadReviewQueue(userId: string): Promise<{
  data: ReviewQueuePayload | null;
  errorMessage?: string;
}> {
  const supabase = createAdminClient();
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
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("publish_drafts_approved_list", {
    p_limit: limit,
    p_account_id: accountId,
    p_search: search,
  });

  if (error) {
    console.error("[loadApprovedList] RPC error:", JSON.stringify(error));
    return { data: null, errorMessage: `获取已通过列表失败: ${error.message}` };
  }

  if (!Array.isArray(data)) {
    return { data: null, errorMessage: "已通过列表返回格式不合法" };
  }

  return {
    data: data.flatMap((item) => {
      const parsed = parseApprovedDraftItem(item);
      return parsed ? [parsed] : [];
    }),
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
    .select("*")
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
    .select("*")
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
