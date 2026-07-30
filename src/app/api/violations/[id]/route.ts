import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildDeleteViolationResponse,
  buildPatchViolationResponse,
} from "../id-route-helpers";

import {
  canAccessPrivateViolationCases,
  getAuthenticatedContext,
  getUserProfile,
  jsonNotFound,
  jsonUnauthorized,
} from "@/lib/violations/api";
import { loadViolationCaseDetail } from "@/lib/violations/read-model";

type DetailRouteDeps = {
  getAuthenticatedContext: typeof getAuthenticatedContext;
  getUserProfile: typeof getUserProfile;
  createAdminClient: typeof createAdminClient;
  loadViolationCaseDetail: typeof loadViolationCaseDetail;
};

const defaultDeps: DetailRouteDeps = { getAuthenticatedContext, getUserProfile, createAdminClient, loadViolationCaseDetail };

export async function buildViolationDetailResponse(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
  deps: DetailRouteDeps = defaultDeps,
) {
  const { supabase, user } = await deps.getAuthenticatedContext();

  if (!user) return jsonUnauthorized();

  const profile = await deps.getUserProfile(supabase, user.id);
  const canViewPrivate = profile ? canAccessPrivateViolationCases(profile) : false;
  const { id } = await context.params;
  const { data, errorMessage } = await deps.loadViolationCaseDetail({
    supabase: (canViewPrivate ? deps.createAdminClient() : supabase) as never,
    id,
  });

  if (errorMessage || !data || (!canViewPrivate && data.status !== "verified")) {
    return jsonNotFound("违规话术不存在");
  }

  return NextResponse.json({ data });
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return buildViolationDetailResponse(request, context);
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
