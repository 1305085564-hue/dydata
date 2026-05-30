import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

import {
  getAuthenticatedContext,
  jsonNotFound,
  jsonUnauthorized,
  requireViolationAdmin,
} from "@/lib/violations/api";
import { loadViolationCaseDetail } from "@/lib/violations/read-model";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { supabase, user } = await getAuthenticatedContext();

  if (!user) {
    return jsonUnauthorized();
  }

  const { id } = await context.params;
  const { data, errorMessage } = await loadViolationCaseDetail({
    supabase,
    fallbackDetailClient: createAdminClient(),
    id,
  });

  if (errorMessage || !data) {
    return jsonNotFound("违规话术不存在");
  }

  return NextResponse.json({ data });
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { supabase, user } = await getAuthenticatedContext();

  if (!user) {
    return jsonUnauthorized();
  }

  const admin = await requireViolationAdmin(supabase, user);
  if (!admin.ok) {
    return admin.response;
  }

  const { id } = await context.params;
  const { data, error } = await supabase
    .from("violation_cases")
    .update({ is_deleted: true })
    .eq("id", id)
    .eq("is_deleted", false)
    .eq("purpose", "violation")
    .select("id")
    .single();

  if (error || !data) {
    return jsonNotFound("违规话术不存在");
  }

  return NextResponse.json({ ok: true });
}
