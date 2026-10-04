import { getRoleLabel } from "@/lib/role-label";
import { resolveProfileCompanyRole } from "@/lib/company-permissions";
import type { CompanyRole, DataScope, UserRole, UserStatus } from "@/types";
import type { ProfileSummary } from "@/lib/modules/types";

/* ─── Helpers ─── */

export function truncateTeamName(name?: string | null, maxLen = 8): string {
  if (!name) return "未分配";
  if (name.length <= maxLen) return name;
  return name.slice(0, maxLen) + "…";
}

export function normalizeUserStatus(value: string | null | undefined): UserStatus {
  return value === "exempt" ? "exempt" : "active";
}

export function formatDataScope(scope: DataScope | null | undefined): string {
  if (scope === "all") return "全部范围";
  if (scope === "team") return "所属公司";
  return "仅自己";
}

export function resolveProfileCompanyRoleForView(profile: Pick<ProfileSummary, "role" | "company_role">) {
  const resolution = resolveProfileCompanyRole(profile.role, profile.company_role);
  if (resolution.conflict) return null;
  if (resolution.companyRole) return resolution.companyRole;
  const hasRoleValue = [profile.role, profile.company_role].some(
    (value) => typeof value === "string" && value.trim().length > 0,
  );
  return hasRoleValue ? null : "member";
}

export function runtimeRoleForView(companyRole: CompanyRole | null): UserRole {
  if (companyRole === "company_owner") return "owner";
  return companyRole ?? "member";
}

export function archiveSnapshotRoleLabel(snapshot: Record<string, unknown> | null | undefined) {
  const resolution = resolveProfileCompanyRole(snapshot?.role, snapshot?.company_role);
  return resolution.conflict || !resolution.companyRole
    ? "历史记录未保留"
    : getRoleLabel(runtimeRoleForView(resolution.companyRole));
}
