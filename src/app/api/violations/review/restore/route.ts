import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  getAuthenticatedContext,
  isPlainObject,
  jsonBadRequest,
  jsonUnauthorized,
  requireViolationAdmin,
} from "@/lib/violations/api";

type ViolationReviewSnapshot = {
  id: string;
  status: string;
  source_table?: "violation_cases";
  usage_state: string | null;
  risk_level: string | null;
  admin_conclusion: string | null;
  suggested_action: string | null;
  is_deleted?: boolean;
};

type KnowledgeCaseReviewSnapshot = {
  id: string;
  status: string;
  source_table: "knowledge_cases";
  deprecated_reason: string | null;
};

type ReviewSnapshot = ViolationReviewSnapshot | KnowledgeCaseReviewSnapshot;

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

function isNullableString(value: unknown): value is string | null {
  return typeof value === "string" || value === null;
}

function isKnowledgeSnapshot(value: Record<string, unknown>): value is KnowledgeCaseReviewSnapshot {
  return value.source_table === "knowledge_cases"
    && typeof value.id === "string"
    && typeof value.status === "string"
    && (value.deprecated_reason === undefined || isNullableString(value.deprecated_reason));
}

function isViolationSnapshot(value: Record<string, unknown>): value is ViolationReviewSnapshot {
  return (value.source_table === undefined || value.source_table === "violation_cases")
    && typeof value.id === "string"
    && typeof value.status === "string"
    && isNullableString(value.usage_state)
    && isNullableString(value.risk_level)
    && isNullableString(value.admin_conclusion)
    && isNullableString(value.suggested_action)
    && (value.is_deleted === undefined || typeof value.is_deleted === "boolean");
}

function isSnapshot(value: unknown): value is ReviewSnapshot {
  if (!isPlainObject(value)) return false;
  return isKnowledgeSnapshot(value) || isViolationSnapshot(value);
}

function normalizeSnapshot(snapshot: ReviewSnapshot): ReviewSnapshot {
  if (snapshot.source_table === "knowledge_cases") {
    return {
      source_table: "knowledge_cases",
      id: snapshot.id.trim(),
      status: snapshot.status.trim(),
      deprecated_reason: snapshot.deprecated_reason ?? null,
    };
  }

  return {
    source_table: "violation_cases",
    id: snapshot.id.trim(),
    status: snapshot.status.trim(),
    usage_state: snapshot.usage_state,
    risk_level: snapshot.risk_level,
    admin_conclusion: snapshot.admin_conclusion,
    suggested_action: snapshot.suggested_action,
    is_deleted: snapshot.is_deleted ?? false,
  };
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

  const snapshots = body.snapshots
    .filter(isSnapshot)
    .map(normalizeSnapshot)
    .filter((snapshot) => snapshot.id && snapshot.status);

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
    if (snapshot.source_table === "knowledge_cases") {
      const { data, error } = await adminSupabase
        .from("knowledge_cases")
        .update({
          status: snapshot.status,
          deprecated_reason: snapshot.deprecated_reason,
        })
        .eq("id", snapshot.id)
        .select("id")
        .single();

      if (error || !data) {
        failed += 1;
        errors.push(`${snapshot.id}: 恢复失败`);
        continue;
      }

      restored += 1;
      continue;
    }

    const { data, error } = await adminSupabase
      .from("violation_cases")
      .update({
        status: snapshot.status,
        is_deleted: snapshot.is_deleted ?? false,
        usage_state: snapshot.usage_state,
        risk_level: snapshot.risk_level,
        admin_conclusion: snapshot.admin_conclusion,
        suggested_action: snapshot.suggested_action,
      })
      .eq("id", snapshot.id)
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
