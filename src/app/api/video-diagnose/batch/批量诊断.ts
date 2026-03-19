type BatchBody = {
  user_id?: string;
  account_id?: string;
  days?: number;
  limit?: number;
};

export interface BatchRequestPayload {
  userId: string | null;
  accountId: string | null;
  days: number;
  limit: number;
}

export interface BatchSummary {
  total: number;
  diagnosed: number;
  failed: Array<{ video_id: string; error: string }>;
}

export function resolveBatchRequest(body: BatchBody): BatchRequestPayload {
  return {
    userId: typeof body.user_id === "string" && body.user_id.trim() ? body.user_id.trim() : null,
    accountId: typeof body.account_id === "string" && body.account_id.trim() ? body.account_id.trim() : null,
    days: typeof body.days === "number" && Number.isFinite(body.days) && body.days > 0 ? Math.floor(body.days) : 7,
    limit: typeof body.limit === "number" && Number.isFinite(body.limit) && body.limit > 0 ? Math.floor(body.limit) : 20,
  };
}

export function buildBatchResponse(input: {
  candidates: string[];
  summary: BatchSummary;
}) {
  return {
    candidate_count: input.candidates.length,
    total: input.summary.total,
    diagnosed: input.summary.diagnosed,
    failed: input.summary.failed,
  };
}
