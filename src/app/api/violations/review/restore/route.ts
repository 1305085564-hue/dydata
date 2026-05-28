import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  getAuthenticatedContext,
  isPlainObject,
  jsonBadRequest,
  jsonUnauthorized,
  requireViolationAdmin,
} from "@/lib/violations/api";

type ReviewSnapshot = {
  id: string;
  status: string;
  usage_state: string | null;
  risk_level: string | null;
  admin_conclusion: string | null;
  suggested_action: string | null;
};

type MinimalRestoreMutation = {
  eq: (column: string, value: unknown) => MinimalRestoreMutation;
  select: (query: string) => { single: () => Promise<{ data: unknown; error: unknown }> };
};

type MinimalRestoreSupabase = {
  from: (table: string) => {
    update: (payload: Record<string, unknown>) => MinimalRestoreMutation;
  };
};

type RestoreViolationReviewDeps = {
  getAuthenticatedContext: () => Promise<{
    supabase: MinimalRestoreSupabase;
    user: { id: string } | null;
  }>;
  requireViolationAdmin: (
    supabase: MinimalRestoreSupabase,
    user: { id: string },
  ) => Promise<
    | { ok: false; response: Response }
    | { ok: true; profile: unknown }
  >;
  createAdminClient?: () => MinimalRestoreSupabase;
};

const defaultDeps: RestoreViolationReviewDeps = {
  getAuthenticatedContext: getAuthenticatedContext as unknown as RestoreViolationReviewDeps["getAuthenticatedContext"],
  requireViolationAdmin: requireViolationAdmin as unknown as RestoreViolationReviewDeps["requireViolationAdmin"],
  createAdminClient: createAdminClient as unknown as RestoreViolationReviewDeps["createAdminClient"],
};

function isSnapshot(value: unknown): value is ReviewSnapshot {
  if (!isPlainObject(value)) return false;
  return typeof value.id === "string"
    && typeof value.status === "string"
    && (typeof value.usage_state === "string" || value.usage_state === null)
    && (typeof value.risk_level === "string" || value.risk_level === null)
    && (typeof value.admin_conclusion === "string" || value.admin_conclusion === null)
    && (typeof value.suggested_action === "string" || value.suggested_action === null);
}

function parseRestorePayload(body: unknown):
  | { ok: false; response: Response }
  | { ok: true; snapshots: ReviewSnapshot[] } {
  if (!isPlainObject(body)) {
    return { ok: false, response: jsonBadRequest("请求体必须是对象") };
  }

  if (!Array.isArray(body.snapshots) || body.snapshots.length === 0) {
    return { ok: false, response: jsonBadRequest("snapshots 至少需要一条记录") };
  }

  const snapshots = body.snapshots.filter(isSnapshot).map((snapshot) => ({
    id: snapshot.id.trim(),
    status: snapshot.status.trim(),
    usage_state: snapshot.usage_state,
    risk_level: snapshot.risk_level,
    admin_conclusion: snapshot.admin_conclusion,
    suggested_action: snapshot.suggested_action,
  })).filter((snapshot) => snapshot.id && snapshot.status);

  if (snapshots.length !== body.snapshots.length) {
    return { ok: false, response: jsonBadRequest("snapshots 格式不合法") };
  }

  return { ok: true, snapshots };
}

export async function buildRestoreViolationReviewResponse(
  request: NextRequest,
  deps: RestoreViolationReviewDeps = defaultDeps,
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

  const payload = parseRestorePayload(body);
  if (!payload.ok) {
    return payload.response;
  }

  let restored = 0;
  let failed = 0;
  const errors: string[] = [];
  const adminSupabase = deps.createAdminClient ? deps.createAdminClient() : supabase;

  for (const snapshot of payload.snapshots) {
    const { data, error } = await adminSupabase
      .from("violation_cases")
      .update({
        status: snapshot.status,
        usage_state: snapshot.usage_state,
        risk_level: snapshot.risk_level,
        admin_conclusion: snapshot.admin_conclusion,
        suggested_action: snapshot.suggested_action,
      })
      .eq("id", snapshot.id)
      .eq("is_deleted", false)
      .select("id")
      .single();

    if (error || !data) {
      failed += 1;
      errors.push(`${snapshot.id}: 恢复失败`);
      continue;
    }

    restored += 1;
  }

  return NextResponse.json({
    restored,
    failed,
    ...(errors.length > 0 ? { errors } : {}),
  });
}

export async function POST(request: NextRequest) {
  return buildRestoreViolationReviewResponse(request);
}
