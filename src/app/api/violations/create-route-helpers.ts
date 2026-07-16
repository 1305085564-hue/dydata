import { NextRequest, NextResponse } from "next/server";

import {
  getAuthenticatedContext,
  getOwnedAccount,
  getUserProfile,
  jsonBadRequest,
  jsonServerError,
  jsonUnauthorized,
  jsonValidationError,
} from "@/lib/violations/api";
import { validateCreateViolationPayload } from "@/lib/violations/validation";

type MinimalCreateSupabase = {
  from: (table: string) => unknown;
};

type MinimalCreateProfile = {
  team_id?: string | null;
};

export type CreateViolationRouteDeps = {
  getAuthenticatedContext: () => Promise<{
    supabase: MinimalCreateSupabase;
    user: { id: string } | null;
  }>;
  getUserProfile: (
    supabase: MinimalCreateSupabase,
    userId: string,
  ) => Promise<MinimalCreateProfile | null>;
  getOwnedAccount?: (
    supabase: MinimalCreateSupabase,
    userId: string,
    accountId: string | null,
  ) => Promise<
    | { ok: true; account: { id: string; name: string; profile_id: string } | null }
    | { ok: false; response: NextResponse }
  >;
};

const defaultCreateDeps: CreateViolationRouteDeps = {
  getAuthenticatedContext: getAuthenticatedContext as unknown as CreateViolationRouteDeps["getAuthenticatedContext"],
  getUserProfile: getUserProfile as unknown as CreateViolationRouteDeps["getUserProfile"],
  getOwnedAccount: getOwnedAccount as unknown as CreateViolationRouteDeps["getOwnedAccount"],
};

type InsertTable = {
  insert: (payload: Record<string, unknown>) => {
    select: (columns: string) => {
      single: () => Promise<{ data: unknown; error: unknown }>;
    };
  };
};

export async function buildCreateViolationResponse(
  request: NextRequest,
  deps: CreateViolationRouteDeps = defaultCreateDeps,
) {
  const { supabase, user } = await deps.getAuthenticatedContext();

  if (!user) {
    return jsonUnauthorized();
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonBadRequest("请求体不是合法 JSON");
  }

  const validation = validateCreateViolationPayload(body);
  if (!validation.ok) {
    return jsonValidationError(validation.message, validation.details);
  }

  const profile = await deps.getUserProfile(supabase, user.id);
  if (!profile) {
    return jsonServerError("用户资料不存在");
  }

  const invalidScreenshotPath = validation.data.screenshot_paths.find(
    (path) => !path.startsWith(`${user.id}/`) || path.includes(".."),
  );
  if (invalidScreenshotPath) {
    return jsonValidationError("screenshot_paths 包含无效路径");
  }

  const getOwnedAccountDep = deps.getOwnedAccount ?? defaultCreateDeps.getOwnedAccount;
  if (!getOwnedAccountDep) {
    return jsonServerError("账号校验器未初始化");
  }

  const accountResult = await getOwnedAccountDep(supabase, user.id, validation.data.account_id);
  if (!accountResult.ok) {
    return accountResult.response;
  }

  if (!validation.data.is_violation) {
    const { data, error } = await (supabase.from("knowledge_cases") as InsertTable)
      .insert({
        submitted_by: user.id,
        team_id: profile.team_id ?? null,
        account_id: accountResult.account?.id ?? null,
        account_name_snapshot: accountResult.account?.name ?? null,
        source_script_text: validation.data.script_text,
        source_notes: validation.data.scene_description,
        screenshot_paths: validation.data.screenshot_paths,
        status: "submitted",
        source_payload: {
          category: validation.data.category,
          result: validation.data.result,
          tags: validation.data.tags,
          platforms: validation.data.platforms,
          is_violation: false,
        },
      })
      .select("*")
      .single();

    if (error) {
      return jsonServerError("提交高转化话术失败");
    }

    return NextResponse.json({ data }, { status: 201 });
  }

  const { data, error } = await (supabase.from("violation_cases") as InsertTable)
    .insert({
      submitted_by: user.id,
      script_text: validation.data.script_text,
      is_violation: validation.data.is_violation,
      category: validation.data.category,
      account_id: accountResult.account?.id ?? null,
      account_name_snapshot: accountResult.account?.name ?? null,
      team_id: profile.team_id ?? null,
      scene_description: validation.data.scene_description,
      screenshot_paths: validation.data.screenshot_paths,
      result: validation.data.result,
      tags: validation.data.tags,
      status: "submitted",
      purpose: "violation",
      platforms: validation.data.platforms,
    })
    .select("*")
    .single();

  if (error) {
    return jsonServerError("提交违规话术失败");
  }

  return NextResponse.json({ data }, { status: 201 });
}
