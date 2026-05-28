import { NextRequest, NextResponse } from "next/server";

import {
  getAuthenticatedContext,
  isPlainObject,
  jsonBadRequest,
  jsonUnauthorized,
  normalizeOptionalText,
  requireViolationAdmin,
} from "@/lib/violations/api";
import { createAdminClient } from "@/lib/supabase/admin";

type BatchReviewAction = "approve" | "reject";

type ReviewSnapshot = {
  id: string;
  status: string;
  usage_state: string | null;
  risk_level: string | null;
  admin_conclusion: string | null;
  suggested_action: string | null;
};

const REVIEW_SNAPSHOT_SELECT = "id,status,usage_state,risk_level,admin_conclusion,suggested_action";

type MinimalBatchReviewSelectQuery = {
  eq: (column: string, value: unknown) => MinimalBatchReviewSelectQuery;
  single: () => Promise<{ data: unknown; error: unknown }>;
};

type MinimalBatchReviewMutation = {
  eq: (column: string, value: unknown) => MinimalBatchReviewMutation;
  select: (query: string) => { single: () => Promise<{ data: unknown; error: unknown }> };
};

type MinimalBatchReviewSupabase = {
  from: (table: string) => {
    select: (query: string) => MinimalBatchReviewSelectQuery;
    update: (payload: Record<string, unknown>) => MinimalBatchReviewMutation;
  };
};

type BatchReviewRouteDeps = {
  getAuthenticatedContext: () => Promise<{
    supabase: MinimalBatchReviewSupabase;
    user: { id: string } | null;
  }>;
  requireViolationAdmin: (
    supabase: MinimalBatchReviewSupabase,
    user: { id: string },
  ) => Promise<
    | { ok: false; response: Response }
    | { ok: true; profile: unknown }
  >;
  createAdminClient?: () => MinimalBatchReviewSupabase;
};

type BatchReviewPayload = {
  ids: string[];
  action: BatchReviewAction;
  conclusion: string | null;
};

const defaultDeps: BatchReviewRouteDeps = {
  getAuthenticatedContext: getAuthenticatedContext as unknown as BatchReviewRouteDeps["getAuthenticatedContext"],
  requireViolationAdmin: requireViolationAdmin as unknown as BatchReviewRouteDeps["requireViolationAdmin"],
  createAdminClient: createAdminClient as unknown as BatchReviewRouteDeps["createAdminClient"],
};

function parseBatchReviewPayload(body: unknown):
  | { ok: false; response: Response }
  | { ok: true; data: BatchReviewPayload } {
  if (!isPlainObject(body)) {
    return { ok: false, response: jsonBadRequest("请求体必须是对象") };
  }

  const ids = Array.isArray(body.ids)
    ? Array.from(
      new Set(
        body.ids
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter(Boolean),
      ),
    )
    : [];

  if (ids.length === 0) {
    return { ok: false, response: jsonBadRequest("ids 至少需要一条记录") };
  }

  if (body.action !== "approve" && body.action !== "reject") {
    return { ok: false, response: jsonBadRequest("action 只能是 approve 或 reject") };
  }

  const conclusion = normalizeOptionalText(body.conclusion);
  if (body.action === "reject" && !conclusion) {
    return { ok: false, response: jsonBadRequest("reject 时必须填写 conclusion") };
  }

  return {
    ok: true,
    data: {
      ids,
      action: body.action,
      conclusion,
    },
  };
}

export async function buildBatchReviewViolationsResponse(
  request: NextRequest,
  deps: BatchReviewRouteDeps = defaultDeps,
) {
  const { supabase, user } = await deps.getAuthenticatedContext();
  if (!user) {
    return jsonUnauthorized();
  }

  const admin = await deps.requireViolationAdmin(supabase, user);
  if (!admin.ok) {
    return admin.response;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonBadRequest("请求体不是合法 JSON");
  }

  const payload = parseBatchReviewPayload(body);
  if (!payload.ok) {
    return payload.response;
  }

  const reviewedAt = new Date().toISOString();
  const basePatch =
    payload.data.action === "approve"
      ? {
        status: "verified",
        usage_state: "available",
      }
      : {
        status: "rejected",
        usage_state: "banned",
        admin_conclusion: payload.data.conclusion,
      };

  let success = 0;
  let failed = 0;
  const errors: string[] = [];
  const snapshots: ReviewSnapshot[] = [];
  const adminSupabase = deps.createAdminClient ? deps.createAdminClient() : supabase;

  for (const id of payload.data.ids) {
    const { data: snapshot, error: snapshotError } = await adminSupabase
      .from("violation_cases")
      .select(REVIEW_SNAPSHOT_SELECT)
      .eq("id", id)
      .eq("is_deleted", false)
      .single();

    if (snapshotError || !snapshot) {
      failed += 1;
      errors.push(`${id}: 审批失败`);
      continue;
    }

    const updatePayload = {
      ...basePatch,
      ...(payload.data.action === "approve" && payload.data.conclusion
        ? { admin_conclusion: payload.data.conclusion }
        : {}),
      reviewed_by: user.id,
      reviewed_at: reviewedAt,
    };

    const { data, error } = await adminSupabase
      .from("violation_cases")
      .update(updatePayload)
      .eq("id", id)
      .eq("is_deleted", false)
      .select("id")
      .single();

    if (error || !data) {
      failed += 1;
      errors.push(`${id}: 审批失败`);
      continue;
    }

    success += 1;
    snapshots.push(snapshot as ReviewSnapshot);
  }

  return NextResponse.json({
    success,
    failed,
    snapshots,
    ...(errors.length > 0 ? { errors } : {}),
  });
}

export async function POST(request: NextRequest) {
  return buildBatchReviewViolationsResponse(request);
}
