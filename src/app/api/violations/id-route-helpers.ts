import { NextRequest, NextResponse } from "next/server";

import {
  getAuthenticatedContext,
  isPlainObject,
  jsonBadRequest,
  jsonNotFound,
  jsonServerError,
  jsonUnauthorized,
  jsonValidationError,
  requireViolationAdmin,
} from "@/lib/violations/api";

type MinimalSingleQuery = {
  eq: (column: string, value: unknown) => MinimalSingleQuery;
  single: () => Promise<{ data: unknown; error: unknown }>;
};

type MinimalMutationQuery = {
  eq: (column: string, value: unknown) => MinimalMutationQuery;
  select: (columns: string) => {
    single: () => Promise<{ data: unknown; error: unknown }>;
  };
};

type MinimalDeleteSupabase = {
  from: (table: string) => {
    select: (columns: string) => MinimalSingleQuery;
    update: (payload: Record<string, unknown>) => MinimalMutationQuery;
  };
};

type MinimalDeleteUser = { id: string };

export type DeleteViolationsRouteDeps = {
  getAuthenticatedContext: () => Promise<{
    supabase: MinimalDeleteSupabase;
    user: MinimalDeleteUser | null;
  }>;
  requireViolationAdmin: (
    supabase: MinimalDeleteSupabase,
    user: MinimalDeleteUser,
  ) => Promise<
    | { ok: true; profile: unknown }
    | { ok: false; response: NextResponse }
  >;
};

const defaultDeleteDeps: DeleteViolationsRouteDeps = {
  getAuthenticatedContext: getAuthenticatedContext as unknown as DeleteViolationsRouteDeps["getAuthenticatedContext"],
  requireViolationAdmin: requireViolationAdmin as unknown as DeleteViolationsRouteDeps["requireViolationAdmin"],
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return isPlainObject(value) ? value : null;
}

function nullableString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function parsePatchBody(body: unknown):
  | { ok: true; scriptText: string }
  | { ok: false; response: NextResponse } {
  if (!isPlainObject(body)) {
    return { ok: false, response: jsonBadRequest("请求体必须是对象") };
  }

  const scriptText = typeof body.script_text === "string" ? body.script_text.trim() : "";
  if (!scriptText) {
    return { ok: false, response: jsonValidationError("script_text 为必填项") };
  }

  if (scriptText.length > 10000) {
    return { ok: false, response: jsonValidationError("script_text 不能超过 10000 字") };
  }

  return { ok: true, scriptText };
}

export async function buildDeleteViolationResponse(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
  deps: DeleteViolationsRouteDeps = defaultDeleteDeps,
) {
  const { supabase, user } = await deps.getAuthenticatedContext();

  if (!user) {
    return jsonUnauthorized();
  }

  const admin = await deps.requireViolationAdmin(supabase, user);
  if (!admin.ok) {
    return admin.response;
  }

  const { id } = await context.params;

  const { data: violationCase } = await supabase
    .from("violation_cases")
    .select("id,status,is_deleted,usage_state,risk_level,admin_conclusion,suggested_action")
    .eq("id", id)
    .eq("is_deleted", false)
    .eq("status", "verified")
    .single();

  const violationSnapshot = asRecord(violationCase);
  if (violationSnapshot) {
    const { data: updatedViolationCase } = await supabase
      .from("violation_cases")
      .update({ is_deleted: true, status: "archived" })
      .eq("id", id)
      .eq("is_deleted", false)
      .eq("status", "verified")
      .select("id")
      .single();

    if (!updatedViolationCase) {
      return jsonServerError("下架失败");
    }

    return NextResponse.json({
      ok: true,
      snapshot: {
        source_table: "violation_cases",
        id: String(violationSnapshot.id),
        status: String(violationSnapshot.status),
        is_deleted: Boolean(violationSnapshot.is_deleted),
        usage_state: nullableString(violationSnapshot.usage_state),
        risk_level: nullableString(violationSnapshot.risk_level),
        admin_conclusion: nullableString(violationSnapshot.admin_conclusion),
        suggested_action: nullableString(violationSnapshot.suggested_action),
      },
    });
  }

  const { data: knowledgeCase } = await supabase
    .from("knowledge_cases")
    .select("id,status,deprecated_reason")
    .eq("id", id)
    .eq("status", "verified")
    .single();

  const knowledgeSnapshot = asRecord(knowledgeCase);
  if (!knowledgeSnapshot) {
    return jsonNotFound("话术不存在或未发布");
  }

  const { data: updatedKnowledgeCase } = await supabase
    .from("knowledge_cases")
    .update({ status: "deprecated", deprecated_reason: "admin_deleted" })
    .eq("id", id)
    .eq("status", "verified")
    .select("id")
    .single();

  if (!updatedKnowledgeCase) {
    return jsonServerError("下架失败");
  }

  return NextResponse.json({
    ok: true,
    snapshot: {
      source_table: "knowledge_cases",
      id: String(knowledgeSnapshot.id),
      status: String(knowledgeSnapshot.status),
      deprecated_reason: nullableString(knowledgeSnapshot.deprecated_reason),
    },
  });
}

export async function buildPatchViolationResponse(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
  deps: DeleteViolationsRouteDeps = defaultDeleteDeps,
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

  const payload = parsePatchBody(body);
  if (!payload.ok) {
    return payload.response;
  }

  const { id } = await context.params;
  const { data: violationCase } = await supabase
    .from("violation_cases")
    .update({ script_text: payload.scriptText })
    .eq("id", id)
    .eq("is_deleted", false)
    .eq("status", "verified")
    .select("id,script_text")
    .single();

  if (violationCase) {
    const row = asRecord(violationCase);
    return NextResponse.json({
      ok: true,
      data: {
        source_table: "violation_cases",
        id: String(row?.id ?? id),
        script_text: typeof row?.script_text === "string" ? row.script_text : payload.scriptText,
      },
    });
  }

  const { data: knowledgeCase } = await supabase
    .from("knowledge_cases")
    .update({ source_script_text: payload.scriptText })
    .eq("id", id)
    .eq("status", "verified")
    .select("id,source_script_text")
    .single();

  if (!knowledgeCase) {
    return jsonNotFound("话术不存在或未发布");
  }

  const row = asRecord(knowledgeCase);
  return NextResponse.json({
    ok: true,
    data: {
      source_table: "knowledge_cases",
      id: String(row?.id ?? id),
      script_text: typeof row?.source_script_text === "string" ? row.source_script_text : payload.scriptText,
    },
  });
}
