import type { SupabaseClient } from "@supabase/supabase-js";

import { assertSupabaseQuerySucceeded } from "@/lib/supabase/query-error";
import { isWorkGroupSchemaMissing } from "@/lib/work-groups";
import type {
  CollaborationAccount,
  CollaborationProfile,
  CollaborationReport,
} from "../domain/types";
import { STATS_START_DATE } from "../domain/types";
import { unique } from "../domain/report-rules";

const DAILY_REPORT_FIELDS = [
  "id",
  "user_id",
  "report_date",
  "account_id",
  "video_id",
  "title",
  "play_count",
  "data_source",
  "follower_convert",
  "script_author_user_id",
  "video_editor_user_id",
  "operator_user_id",
].join(", ");
const DAILY_REPORT_FIELDS_BEFORE_DATA_SOURCE = DAILY_REPORT_FIELDS.replace(", data_source", "");

// Supabase/PostgREST 默认单次最多返回 1000 行；岗位历史样本不能因为超过上限而静默丢失。
const REPORT_PAGE_SIZE = 1000;
const PROFILE_FIELDS = "id, name, team_id";
/** 带小队归属的读列；库还没跑 work_groups migration 时由 queryProfiles 退回 PROFILE_FIELDS。 */
const PROFILE_FIELDS_WITH_WORK_GROUPS = `${PROFILE_FIELDS}, work_peer_group_id, work_operator_group_id`;

type ProfileQueryError = { message?: string; code?: string } | null;

export function mapProfileRow(row: Record<string, unknown>): CollaborationProfile {
  return {
    id: String(row.id),
    name: (row.name as string | null) ?? null,
    team_id: (row.team_id as string | null) ?? null,
    work_peer_group_id: (row.work_peer_group_id as string | null) ?? null,
    work_operator_group_id: (row.work_operator_group_id as string | null) ?? null,
  };
}

/**
 * 读成员资料：优先带小队归属列，应用先于数据库部署时退回首列，不把整页打挂。
 * 降级只针对「新列不存在」，真正的查询故障仍按 error 原样交给调用方断言（禁止伪装成空数据）。
 * 动态 select 字符串让 PostgREST 的泛型退化成 GenericStringError，这里按行形状收口。
 */
export async function queryProfiles<T>(
  run: (fields: string) => PromiseLike<unknown>,
): Promise<{ data: T | null; error: ProfileQueryError }> {
  const primary = (await run(PROFILE_FIELDS_WITH_WORK_GROUPS)) as {
    data: T | null;
    error: ProfileQueryError;
  };
  if (!primary.error || !isWorkGroupSchemaMissing(primary.error)) return primary;
  return (await run(PROFILE_FIELDS)) as { data: T | null; error: ProfileQueryError };
}
export async function queryScopedReports(input: {
  supabase: SupabaseClient;
  visibleUserIds: string[];
  start: string;
  end: string;
  assignedUserId?: string;
}) {
  if (input.visibleUserIds.length === 0 || input.end < STATS_START_DATE) return [];
  const rows: CollaborationReport[] = [];

  for (let offset = 0; ; offset += REPORT_PAGE_SIZE) {
    let query = input.supabase
      .from("daily_reports")
      .select(DAILY_REPORT_FIELDS)
      .in("user_id", input.visibleUserIds)
      .gte("report_date", STATS_START_DATE)
      .gte("report_date", input.start)
      .lte("report_date", input.end)
      .eq("is_void", false);
    if (input.assignedUserId) {
      query = query.or(
        `script_author_user_id.eq.${input.assignedUserId},video_editor_user_id.eq.${input.assignedUserId},operator_user_id.eq.${input.assignedUserId}`,
      );
    }
    let result = await query
      // Secondary ordering keeps offset pagination deterministic when many rows share a date.
      .order("report_date", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + REPORT_PAGE_SIZE - 1);
    // 允许应用先于数据库迁移部署，旧库仍可展示完整岗位数据；迁移后自动读取来源字段。
    if (result.error && /data_source|schema cache|column .* does not exist/i.test(result.error.message ?? "")) {
      let fallbackQuery = input.supabase
        .from("daily_reports")
        .select(DAILY_REPORT_FIELDS_BEFORE_DATA_SOURCE)
        .in("user_id", input.visibleUserIds)
        .gte("report_date", STATS_START_DATE)
        .gte("report_date", input.start)
        .lte("report_date", input.end);
      if (input.assignedUserId) {
        fallbackQuery = fallbackQuery.or(
          `script_author_user_id.eq.${input.assignedUserId},video_editor_user_id.eq.${input.assignedUserId},operator_user_id.eq.${input.assignedUserId}`,
        );
      }
      result = await fallbackQuery
        .order("report_date", { ascending: false })
        .order("id", { ascending: false })
        .range(offset, offset + REPORT_PAGE_SIZE - 1);
    }
    assertSupabaseQuerySucceeded(result.error, "加载协作日报失败");

    const page = (result.data ?? []) as unknown as CollaborationReport[];
    rows.push(...page);
    if (page.length < REPORT_PAGE_SIZE) break;
  }

  return rows;
}

export async function loadProfiles(supabase: SupabaseClient, ids: string[]) {
  if (ids.length === 0) return [];
  const result = await queryProfiles<Record<string, unknown>[]>((fields) =>
    supabase.from("profiles").select(fields).in("id", ids),
  );
  assertSupabaseQuerySucceeded(result.error, "加载协作成员失败");
  return (result.data ?? []).map(mapProfileRow);
}

export async function loadAccounts(supabase: SupabaseClient, ids: string[]) {
  if (ids.length === 0) return [];
  const result = await supabase
    .from("accounts")
    .select("id, name, profile_id")
    .in("id", ids);
  assertSupabaseQuerySucceeded(result.error, "加载协作账号失败");
  return (result.data ?? []) as CollaborationAccount[];
}

export async function loadLookups(supabase: SupabaseClient, rows: CollaborationReport[]) {
  const accounts = await loadAccounts(supabase, unique(rows.map((row) => row.account_id)));
  const profileIds = unique([
    ...rows.flatMap((row) => [
      row.user_id,
      row.script_author_user_id,
      row.video_editor_user_id,
      row.operator_user_id,
    ]),
    ...accounts.map((account) => account.profile_id),
  ]);
  const profiles = await loadProfiles(supabase, profileIds);
  return { profiles, accounts };
}
