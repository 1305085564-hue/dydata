import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildDeleteViolationResponse,
  buildPatchViolationResponse,
} from "../id-route-helpers";

import {
  getAuthenticatedContext,
  jsonNotFound,
  jsonUnauthorized,
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
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return buildDeleteViolationResponse(request, context);
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return buildPatchViolationResponse(request, context);
}
