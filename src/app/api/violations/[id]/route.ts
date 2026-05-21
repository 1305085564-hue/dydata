import { NextRequest, NextResponse } from "next/server";

import {
  getAuthenticatedContext,
  jsonNotFound,
  jsonUnauthorized,
  requireViolationAdmin,
} from "@/lib/violations/api";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { supabase, user } = await getAuthenticatedContext();

  if (!user) {
    return jsonUnauthorized();
  }

  const { id } = await context.params;

  const { data, error } = await supabase
    .from("violation_cases")
    .select(
      `
        *,
        submitter:profiles!violation_cases_submitted_by_fkey(id, name),
        team:teams(id, name),
        reviewer:profiles!violation_cases_reviewed_by_fkey(id, name),
        test_records:violation_test_records(
          *,
          tester:profiles!violation_test_records_tested_by_fkey(id, name),
          account:accounts(id, name)
        )
      `,
    )
    .eq("id", id)
    .eq("is_deleted", false)
    .single();

  if (error || !data) {
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
