import type { SupabaseClient } from "@supabase/supabase-js";
import { assertSupabaseQuerySucceeded } from "@/lib/supabase/query-error";
import {
  filterActiveMemberships,
  loadWithMembershipFallback,
} from "@/lib/member-lifecycle";
import { fixedPermissions } from "@/lib/permission-utils";
import {
  resolveProfileCompanyRole,
  runtimeRoleForCompanyRole,
} from "@/lib/company-permissions";
import { resolveGroupModeForUser } from "@/lib/group-mode-server";
import type { CompanyRole, DataScope, Permissions, UserRole } from "@/types";

export type DataAccessScopeKind = DataScope;

export interface DataAccessScope {
  userId: string;
  role: UserRole;
  companyRole?: CompanyRole;
  permissions: Permissions;
  teamId: string | null;
  kind: DataAccessScopeKind;
  visibleUserIds: string[];
  activeVisibleUserIds?: string[];
  groupMode?: boolean;
}

export interface BuildDataAccessScopeOptions {
  perspective?: "company" | "team";
  teamId?: string | null;
  profile?: ScopeProfileInput | null;
}

type ScopeSupabase = SupabaseClient;

export type ScopeProfileInput = {
  id: string;
  role: UserRole | string | null;
  permissions: Permissions | null;
  data_scope?: DataScope | null;
  team_id: string | null;
  membership_status?: string | null;
  company_role?: CompanyRole | string | null;
  group_mode?: boolean;
  group_mode_token_hash?: string;
};

function isMissingColumn(error: { message?: string } | null | undefined, column: string) {
  const message = error?.message ?? "";
  return message.includes(column) || message.includes("Could not find");
}

export function inferDataScope(
  role: UserRole | string | null | undefined,
  _permissions: Permissions | null | undefined,
  companyRole?: CompanyRole | string | null,
  groupMode = false,
): DataScope {
  const roleResolution = resolveProfileCompanyRole(role, companyRole);
  if (roleResolution.conflict) return "self";
  const resolvedRole = roleResolution.companyRole;
  if (groupMode && resolvedRole === "company_owner") return "all";
  return resolvedRole === "admin" || resolvedRole === "company_owner" ? "team" : "self";
}

export function resolveDataScope(
  role: UserRole | string | null | undefined,
  configuredScope: DataScope | null | undefined,
  permissions: Permissions | null | undefined,
  companyRole?: CompanyRole | string | null,
  groupMode = false,
): DataScope {
  void configuredScope;
  return inferDataScope(role, permissions, companyRole, groupMode);
}

async function loadProfile(adminSupabase: ScopeSupabase, userId: string): Promise<ScopeProfileInput | null> {
  const primary = await adminSupabase
    .from("profiles")
    .select("id, role, company_role, permissions, data_scope, membership_status, team_id")
    .eq("id", userId)
    .single();

  if (!isMissingColumn(primary.error, "data_scope") && !isMissingColumn(primary.error, "company_role")) {
    assertSupabaseQuerySucceeded(primary.error, "加载权限资料失败");
    return (primary.data as unknown as ScopeProfileInput | null) ?? null;
  }

  const fallback = await adminSupabase
    .from("profiles")
    .select("id, role, permissions, membership_status, team_id")
    .eq("id", userId)
    .single();

  assertSupabaseQuerySucceeded(fallback.error, "加载权限资料失败");
  const profile = fallback.data as unknown as Omit<ScopeProfileInput, "data_scope"> | null;
  if (!profile) return null;

  return {
    ...profile,
    data_scope: inferDataScope(profile.role, profile.permissions, null, false),
  };
}

/** 本公司可见成员行（在职成员 + 归档前属于本公司的历史成员）。 */
type CompanyVisibleRow = {
  id: string;
  membership_status?: string | null;
};

type CompanyHistoricalRow = CompanyVisibleRow & {
  archive_snapshot?: { team_id?: string | null } | null;
  archived_by?: string | null;
};

/**
 * 加载「本公司可见成员」行集：在职成员（team_id 匹配）+ 归档前属于本公司的历史成员。
 * buildDataAccessScope 的 team 分支与 resolveCollaborationScope 共用同一份口径，
 * 保证组长范围与组员在数据管理内放宽后的范围结构同源。模块私有，不导出。
 */
async function loadCompanyVisibleRows(
  supabase: ScopeSupabase,
  teamId: string,
): Promise<CompanyVisibleRow[]> {
  // 团队成员与历史归档成员两查互不依赖，并行取（省一次串行往返）
  const [teamResult, historicalResult] = await Promise.all([
    loadWithMembershipFallback({
      loadWithMembership: async () => supabase.from("profiles").select("id, membership_status").eq("team_id", teamId),
      loadWithoutMembership: async () => supabase.from("profiles").select("id").eq("team_id", teamId),
    }),
    loadWithMembershipFallback({
      loadWithMembership: async () =>
        supabase.from("profiles").select("id, membership_status, archive_snapshot, archived_by"),
      loadWithoutMembership: async () => supabase.from("profiles").select("id, archive_snapshot, archived_by"),
    }),
  ]);
  assertSupabaseQuerySucceeded(teamResult.error, "加载团队可见成员失败");
  const teamRows = (teamResult.data ?? []) as CompanyVisibleRow[];
  const teamMemberIds = new Set(teamRows.map((row) => row.id).filter(Boolean));

  // Archived profiles lose their active team assignment, but their snapshot
  // still identifies the company that owns their historical records.
  assertSupabaseQuerySucceeded(historicalResult.error, "加载历史成员范围失败");
  const historicalRows = (historicalResult.data ?? []) as CompanyHistoricalRow[];
  const snapshotTeamById = new Map(
    historicalRows.map((row) => [row.id, row.archive_snapshot?.team_id ?? null]),
  );

  // 快照记录了团队：按快照归属。归档时本人就没有团队（快照为 null）时，
  // 退回按「归档操作人」判定 —— 归档动作只能由被归档成员所属公司的管理者
  // 执行，故操作人所属团队即该成员历史产出的归属公司；否则其历史作品会对
  // 所有人不可见（不依赖任一时间点的 team_id，避免历史资产凭空消失）。
  const belongsToCompany = (row: CompanyHistoricalRow) => {
    const snapshotTeamId = row.archive_snapshot?.team_id ?? null;
    if (snapshotTeamId) return snapshotTeamId === teamId;
    if (!row.archived_by) return false;
    return teamMemberIds.has(row.archived_by) || snapshotTeamById.get(row.archived_by) === teamId;
  };

  const archivedHistoricalRows = historicalRows
    .filter((row) => row.membership_status === "archived")
    .filter(belongsToCompany);
  return [...teamRows, ...archivedHistoricalRows];
}

export async function buildDataAccessScope(
  adminSupabase: ScopeSupabase,
  userId: string,
  options: BuildDataAccessScopeOptions = {},
): Promise<DataAccessScope | null> {
  const profile = options.profile ?? await loadProfile(adminSupabase, userId);
  if (!profile) return null;

  const roleResolution = resolveProfileCompanyRole(profile.role, profile.company_role);
  if (roleResolution.conflict || !roleResolution.companyRole) return null;
  const companyRole = roleResolution.companyRole;
  const role = runtimeRoleForCompanyRole(companyRole);
  let groupMode = profile.group_mode === true;
  if (!options.profile) {
    try {
      groupMode = (await resolveGroupModeForUser(userId, adminSupabase)).active;
    } catch {
      groupMode = false;
    }
  }
  const kind = resolveDataScope(
    profile.role,
    profile.data_scope,
    profile.permissions,
    profile.company_role,
    groupMode,
  ) as DataAccessScopeKind;
  // Team scope comes only from the trusted profile. Request parameters must
  // never create or replace an actor's team assignment.
  const effectiveTeamId = profile.team_id ?? null;

  let visibleRows: Array<{
    id: string;
    membership_status?: string | null;
    archive_snapshot?: { team_id?: string | null } | null;
  }> = [
    { id: userId, membership_status: profile.membership_status },
  ];

  if (kind === "all") {
    const result = await loadWithMembershipFallback({
      loadWithMembership: async () => adminSupabase.from("profiles").select("id, membership_status"),
      loadWithoutMembership: async () => adminSupabase.from("profiles").select("id"),
    });
    assertSupabaseQuerySucceeded(result.error, "加载全公司可见成员失败");
    visibleRows = (result.data ?? []) as typeof visibleRows;
  } else if (kind === "team" && effectiveTeamId) {
    visibleRows = await loadCompanyVisibleRows(adminSupabase, effectiveTeamId);
  }

  let visibleUserIds = visibleRows.map((item) => item.id).filter(Boolean);
  if (!visibleUserIds.includes(userId)) {
    visibleUserIds = [userId, ...visibleUserIds];
    visibleRows = [{ id: userId, membership_status: profile.membership_status }, ...visibleRows];
  }

  const activeVisibleUserIds = filterActiveMemberships(visibleRows)
    .map((item) => item.id)
    .filter(Boolean);

  return {
    userId,
    role,
    companyRole,
    permissions: fixedPermissions(companyRole, profile.permissions),
    teamId: effectiveTeamId,
    kind,
    visibleUserIds: Array.from(new Set(visibleUserIds)),
    activeVisibleUserIds: Array.from(new Set(activeVisibleUserIds)),
    groupMode,
  };
}

export function canAccessOwner(scope: DataAccessScope, ownerUserId: string | null | undefined) {
  if (scope.kind === "all") return true;
  return typeof ownerUserId === "string" && scope.visibleUserIds.includes(ownerUserId);
}

/** 数据管理模块（/admin/collaboration）的可见范围解析结果。 */
export interface CollaborationScopeResolution {
  visibleUserIds: string[];
  activeVisibleUserIds: string[];
  /** true = 该账号在本模块内仍只看自己（无公司归属的安全降级）。 */
  restrictToSelf: boolean;
}

/**
 * 数据管理模块的可见范围。
 * 唯一判定处：调用方只消费结果，不得自行判断 kind / team_id。
 * 当前唯一调用方：/admin/collaboration 页面与其只读接口。
 *
 * - all / team：沿用全局范围原值，与改动前行为一致；
 * - self + 本公司归属：组员在本模块内放宽为全体本公司可见成员
 *   （含归档前属于本公司的历史成员），仅此模块，不外溢；
 * - self 无公司归属：安全降级为只看自己，不报错。
 */
export async function resolveCollaborationScope(
  supabase: ScopeSupabase,
  scope: DataAccessScope,
): Promise<CollaborationScopeResolution> {
  if (scope.kind !== "self") {
    return {
      visibleUserIds: scope.visibleUserIds,
      activeVisibleUserIds: getActiveVisibleUserIds(scope),
      restrictToSelf: false,
    };
  }
  if (!scope.teamId) {
    return {
      visibleUserIds: [scope.userId],
      activeVisibleUserIds: [scope.userId],
      restrictToSelf: true,
    };
  }
  const rows = await loadCompanyVisibleRows(supabase, scope.teamId);
  if (!rows.some((row) => row.id === scope.userId)) {
    rows.unshift({ id: scope.userId });
  }
  return {
    visibleUserIds: Array.from(new Set(rows.map((row) => row.id).filter(Boolean))),
    activeVisibleUserIds: Array.from(
      new Set(filterActiveMemberships(rows).map((row) => row.id).filter(Boolean)),
    ),
    restrictToSelf: false,
  };
}

export function getActiveVisibleUserIds(scope: Pick<DataAccessScope, "activeVisibleUserIds" | "visibleUserIds">) {
  return scope.activeVisibleUserIds ?? scope.visibleUserIds;
}

export function filterRowsByDataScope<T>(
  scope: DataAccessScope,
  rows: T[],
  getOwnerUserId: (row: T) => string | null | undefined,
) {
  if (scope.kind === "all") return rows;
  return rows.filter((row) => canAccessOwner(scope, getOwnerUserId(row)));
}
