import { canAccessAdminPath } from "@/lib/analytics-access";
import { createAdminClient } from "@/lib/supabase/admin";

import type { HubTabKey } from "./hub-shell";

export interface InboxBucketEntry {
  id: string;
  script_text: string;
  submitted_by_name: string;
  created_at: string;
  risk_level: "high" | "medium" | "low" | null;
  screenshot_paths?: string[] | null;
  missing_fields?: string[];
  total_views?: number | null;
  weighted_conversion_rate?: number | null;
  usage_count?: number | null;
  promotion_level?: string | null;
  status?: string | null;
}

export interface InboxData {
  pending_review: InboxBucketEntry[];
  missing_data: InboxBucketEntry[];
  high_risk_pending: InboxBucketEntry[];
  /** @deprecated RPC 兼容字段，前端应忽略该桶。 */
  promotion_candidates: InboxBucketEntry[];
}

export interface InboxCounts {
  pending_review: number;
  missing_data: number;
  high_risk_pending: number;
  promotion_candidates: number;
}

export interface ProcessedEntry {
  id: string;
  script_text: string;
  purpose: string | null;
  screenshot_paths: string[] | null;
  submitted_by_name: string;
  created_at: string;
  reviewed_at: string | null;
  reviewed_by_name: string | null;
  status: string;
  admin_conclusion: string | null;
  risk_level: "high" | "medium" | "low" | null;
}

export interface ProcessedData {
  processed: ProcessedEntry[];
}

export const PROCESSED_RPC_READY = true;

export const VALID_TABS: HubTabKey[] = ["scripts", "violations", "weekly", "analytics", "advice"];

export function getWeekStartDate(now = new Date()) {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - day + 1);
  return date.toISOString().slice(0, 10);
}

export async function loadInboxData(userId: string): Promise<{ data: InboxData; counts: InboxCounts }> {
  const supabase = createAdminClient();
  const [inboxResult, countsResult] = await Promise.all([
    supabase.rpc("case_library_inbox", { p_user_id: userId }),
    supabase.rpc("case_library_inbox_counts", { p_user_id: userId }),
  ]);

  const empty: InboxData = {
    pending_review: [],
    missing_data: [],
    high_risk_pending: [],
    promotion_candidates: [],
  };
  const emptyCounts: InboxCounts = {
    pending_review: 0,
    missing_data: 0,
    high_risk_pending: 0,
    promotion_candidates: 0,
  };

  const data = (inboxResult.data ?? empty) as Partial<InboxData>;
  const counts = (countsResult.data ?? emptyCounts) as Partial<InboxCounts>;

  return {
    data: {
      pending_review: Array.isArray(data.pending_review) ? data.pending_review : [],
      missing_data: Array.isArray(data.missing_data) ? data.missing_data : [],
      high_risk_pending: Array.isArray(data.high_risk_pending) ? data.high_risk_pending : [],
      promotion_candidates: Array.isArray(data.promotion_candidates) ? data.promotion_candidates : [],
    },
    counts: {
      pending_review: Number(counts.pending_review ?? 0),
      missing_data: Number(counts.missing_data ?? 0),
      high_risk_pending: Number(counts.high_risk_pending ?? 0),
      promotion_candidates: Number(counts.promotion_candidates ?? 0),
    },
  };
}

export async function loadProcessedData(userId: string): Promise<ProcessedData> {
  const supabase = createAdminClient();
  const { data } = await supabase.rpc("case_library_processed", { p_user_id: userId });
  const payload = data as { processed?: ProcessedEntry[] } | null;
  return { processed: Array.isArray(payload?.processed) ? payload.processed : [] };
}

export { canAccessAdminPath };
