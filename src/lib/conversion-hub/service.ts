import type { SupabaseClient } from "@supabase/supabase-js";

import {
  normalizePermissionsForBusinessRole,
  resolveBusinessRole,
  type BusinessGroup,
  type BusinessRole,
} from "@/lib/business-role";
import { hasPermission } from "@/lib/permission-utils";
import type { Permissions, UserRole } from "@/types";

import { buildScriptHash, type CreateUsageRecordPayload, type CreateViolationEventPayload } from "./validation";

const USAGE_RECORD_FIELDS = [
  "id",
  "case_id",
  "recorded_by",
  "account_id",
  "account_name_snapshot",
  "team_id",
  "used_at",
  "views",
  "follows",
  "conversion_rate",
  "source",
  "daily_report_id",
  "note",
  "result_flag",
  "created_at",
  "updated_at",
] as const;

export const USAGE_RECORD_SELECT = USAGE_RECORD_FIELDS.join(", ");
export const VIOLATION_EVENT_SELECT =
  "id, case_id, account_id, event_type, occurred_at, platform_notice, screenshot_paths, suspected_reason, appeal_status, appeal_result, recovered_at, reported_by, note, created_at";

export type ConversionHubResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; code: "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "VALIDATION_ERROR" | "SERVER_ERROR"; message: string };

type AccountRow = {
  id: string;
  name: string | null;
  profile_id: string;
};

export function pickUsageRecordFields(row: unknown) {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    return null;
  }

  const record = row as Record<string, unknown>;
  return Object.fromEntries(USAGE_RECORD_FIELDS.map((field) => [field, record[field]]));
}

type ProfileRow = {
  id: string;
  role: UserRole;
  businessRole: BusinessRole;
  permissions: Permissions;
  team_id: string | null;
  group_id: string | null;
};

function toServerError(message: string): ConversionHubResult<never> {
  return { ok: false, status: 500, code: "SERVER_ERROR", message };
}

function hasViolationPermission(profile: ProfileRow) {
  return hasPermission(profile.businessRole, profile.permissions, "manage_violations");
}

async function getProfile(supabase: SupabaseClient, userId: string): Promise<ConversionHubResult<ProfileRow>> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, role, permissions, team_id, group_id")
    .eq("id", userId)
    .single();

  if (error || !data) {
    return toServerError("用户资料不存在");
  }

  const role = data.role as UserRole;
  const rawPermissions = (data.permissions ?? {}) as Permissions;
  const { data: ledGroups } = await supabase
    .from("groups")
    .select("id, team_id, leader_user_id")
    .eq("leader_user_id", userId);
  const businessRole = resolveBusinessRole(
    {
      id: data.id as string,
      role,
      permissions: rawPermissions,
      team_id: (data.team_id ?? null) as string | null,
      group_id: (data.group_id ?? null) as string | null,
    },
    (ledGroups ?? []) as BusinessGroup[],
  );

  return {
    ok: true,
    data: {
      id: data.id as string,
      role,
      businessRole,
      permissions: normalizePermissionsForBusinessRole(businessRole, rawPermissions),
      team_id: (data.team_id ?? null) as string | null,
      group_id: (data.group_id ?? null) as string | null,
    },
  };
}

async function getOwnedAccount(
  supabase: SupabaseClient,
  userId: string,
  accountId: string | null,
): Promise<ConversionHubResult<AccountRow | null>> {
  if (!accountId) {
    return { ok: true, data: null };
  }

  const { data, error } = await supabase
    .from("accounts")
    .select("id, name, profile_id")
    .eq("id", accountId)
    .single();

  if (error || !data) {
    return { ok: false, status: 403, code: "FORBIDDEN", message: "account_id 不属于当前用户" };
  }

  const account = {
    id: data.id as string,
    name: (data.name ?? null) as string | null,
    profile_id: data.profile_id as string,
  };

  if (account.profile_id !== userId) {
    return { ok: false, status: 403, code: "FORBIDDEN", message: "account_id 不属于当前用户" };
  }

  return { ok: true, data: account };
}

async function getDailyReportAccountId(
  supabase: SupabaseClient,
  userId: string,
  dailyReportId: string | null,
): Promise<ConversionHubResult<string | null>> {
  if (!dailyReportId) {
    return { ok: true, data: null };
  }

  const { data, error } = await supabase
    .from("daily_reports")
    .select("id, user_id, account_id")
    .eq("id", dailyReportId)
    .single();

  if (error || !data) {
    return { ok: false, status: 404, code: "NOT_FOUND", message: "日报记录不存在" };
  }

  if (data.user_id !== userId) {
    return { ok: false, status: 403, code: "FORBIDDEN", message: "daily_report_id 不属于当前用户" };
  }

  return { ok: true, data: (data.account_id ?? null) as string | null };
}

async function assertOpenCase(supabase: SupabaseClient, caseId: string): Promise<ConversionHubResult<string>> {
  const { data, error } = await supabase
    .from("violation_cases")
    .select("id, status, is_deleted")
    .eq("id", caseId)
    .eq("is_deleted", false)
    .single();

  if (error || !data) {
    return { ok: false, status: 404, code: "NOT_FOUND", message: "话术案例不存在" };
  }

  if (data.status === "archived") {
    return { ok: false, status: 409, code: "CONFLICT", message: "已归档案例不能追加使用记录" };
  }

  return { ok: true, data: data.id as string };
}

async function findOrCreateConversionCase(
  supabase: SupabaseClient,
  params: {
    userId: string;
    teamId: string | null;
    account: AccountRow | null;
    scriptText: string;
    scriptFormat: string;
  },
): Promise<ConversionHubResult<string>> {
  const scriptHash = buildScriptHash(params.scriptText);

  const existing = await supabase
    .from("violation_cases")
    .select("id, status")
    .eq("purpose", "conversion")
    .eq("script_hash", scriptHash)
    .eq("is_deleted", false)
    .neq("status", "archived")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existing.error) {
    return toServerError("查询话术案例失败");
  }

  if (existing.data?.id) {
    return { ok: true, data: existing.data.id as string };
  }

  const { data, error } = await supabase
    .from("violation_cases")
    .insert({
      submitted_by: params.userId,
      script_text: params.scriptText,
      is_violation: false,
      category: "下粉",
      account_id: params.account?.id ?? null,
      account_name_snapshot: params.account?.name ?? null,
      team_id: params.teamId,
      status: "verified",
      purpose: "conversion",
      script_format: params.scriptFormat,
      script_hash: scriptHash,
    })
    .select("id")
    .single();

  if (error || !data) {
    return toServerError("创建话术案例失败");
  }

  return { ok: true, data: data.id as string };
}

async function insertUsageRecord(
  supabase: SupabaseClient,
  userId: string,
  payload: CreateUsageRecordPayload,
): Promise<ConversionHubResult<unknown>> {
  const prepared = await prepareUsageRecord(supabase, userId, payload);
  if (!prepared.ok) return prepared;

  const { data, error } = await supabase
    .from("script_usage_records")
    .insert(prepared.data)
    .select(USAGE_RECORD_SELECT)
    .single();

  if (error || !data) {
    return toServerError("创建话术使用记录失败");
  }

  return { ok: true, data };
}

type PreparedUsageRecord = {
  case_id: string;
  recorded_by: string;
  account_id: string | null;
  account_name_snapshot: string | null;
  team_id: string | null;
  used_at: string;
  views: number;
  follows: number;
  source: CreateUsageRecordPayload["source"];
  daily_report_id: string | null;
  note: string | null;
  result_flag: CreateUsageRecordPayload["result_flag"];
};

async function prepareUsageRecord(
  supabase: SupabaseClient,
  userId: string,
  payload: CreateUsageRecordPayload,
): Promise<ConversionHubResult<PreparedUsageRecord>> {
  const profile = await getProfile(supabase, userId);
  if (!profile.ok) return profile;

  const reportAccountId = await getDailyReportAccountId(supabase, userId, payload.daily_report_id);
  if (!reportAccountId.ok) return reportAccountId;

  const effectiveAccountId = payload.account_id ?? reportAccountId.data;
  const account = await getOwnedAccount(supabase, userId, effectiveAccountId);
  if (!account.ok) return account;

  let caseId = payload.case_id;

  if (caseId) {
    const openCase = await assertOpenCase(supabase, caseId);
    if (!openCase.ok) return openCase;
    caseId = openCase.data;
  } else if (payload.script_text) {
    const createdCase = await findOrCreateConversionCase(supabase, {
      userId,
      teamId: profile.data.team_id,
      account: account.data,
      scriptText: payload.script_text,
      scriptFormat: payload.script_format,
    });
    if (!createdCase.ok) return createdCase;
    caseId = createdCase.data;
  }

  if (!caseId) {
    return { ok: false, status: 422, code: "VALIDATION_ERROR", message: "case_id 或 script_text 至少提供一个" };
  }

  return {
    ok: true,
    data: {
      case_id: caseId,
      recorded_by: userId,
      account_id: account.data?.id ?? null,
      account_name_snapshot: account.data?.name ?? null,
      team_id: profile.data.team_id,
      used_at: payload.used_at,
      views: payload.views,
      follows: payload.follows,
      source: payload.source,
      daily_report_id: payload.daily_report_id,
      note: payload.note,
      result_flag: payload.result_flag,
    },
  };
}

export async function createUsageRecordForUser(
  supabase: SupabaseClient,
  userId: string,
  payload: CreateUsageRecordPayload,
) {
  return insertUsageRecord(supabase, userId, payload);
}

export async function replaceDailyReportUsageRecord(
  supabase: SupabaseClient,
  userId: string,
  payload: CreateUsageRecordPayload,
) {
  if (!payload.daily_report_id) {
    return { ok: false as const, status: 422, code: "VALIDATION_ERROR" as const, message: "daily_report_id 为必填项" };
  }

  const prepared = await prepareUsageRecord(supabase, userId, payload);
  if (!prepared.ok) return prepared;

  const { data, error } = await supabase.rpc("replace_daily_report_usage_record", {
    p_daily_report_id: payload.daily_report_id,
    p_case_id: prepared.data.case_id,
    p_recorded_by: prepared.data.recorded_by,
    p_account_id: prepared.data.account_id,
    p_account_name_snapshot: prepared.data.account_name_snapshot,
    p_team_id: prepared.data.team_id,
    p_used_at: prepared.data.used_at,
    p_views: prepared.data.views,
    p_follows: prepared.data.follows,
    p_source: prepared.data.source,
    p_note: prepared.data.note,
    p_result_flag: prepared.data.result_flag,
  });

  const replaced = pickUsageRecordFields(Array.isArray(data) ? data[0] : data);
  if (error || !replaced) {
    return toServerError("替换话术使用记录失败");
  }

  return { ok: true as const, data: replaced };
}


export async function createViolationEventForUser(
  supabase: SupabaseClient,
  userId: string,
  payload: CreateViolationEventPayload,
) {
  const profile = await getProfile(supabase, userId);
  if (!profile.ok) return profile;

  const account = await getOwnedAccount(supabase, userId, payload.account_id);
  if (!account.ok) return account;

  if (payload.case_id) {
    const openCase = await assertOpenCase(supabase, payload.case_id);
    if (!openCase.ok) return openCase;
  }

  const invalidScreenshotPath = payload.screenshot_paths.find(
    (path) => !path.startsWith(`${userId}/`) || path.includes(".."),
  );

  if (invalidScreenshotPath) {
    return { ok: false as const, status: 422, code: "VALIDATION_ERROR" as const, message: "screenshot_paths 包含无效路径" };
  }

  const { data, error } = await supabase
    .from("violation_events")
    .insert({
      case_id: payload.case_id,
      account_id: account.data?.id,
      event_type: payload.event_type,
      occurred_at: payload.occurred_at,
      platform_notice: payload.platform_notice,
      screenshot_paths: payload.screenshot_paths,
      suspected_reason: payload.suspected_reason,
      appeal_status: payload.appeal_status,
      appeal_result: payload.appeal_result,
      recovered_at: payload.recovered_at,
      reported_by: userId,
      note: payload.note,
    })
    .select(VIOLATION_EVENT_SELECT)
    .single();

  if (error || !data) {
    return toServerError("创建违规事件失败");
  }

  return { ok: true as const, data };
}

export async function canSeeAllUsageRecords(supabase: SupabaseClient, userId: string) {
  const profile = await getProfile(supabase, userId);
  return profile.ok && hasViolationPermission(profile.data);
}
