/**
 * Stable user-facing labels for the four business states.
 * `owner` is accepted only as a legacy alias for `company_owner`.
 */
export interface RoleLabelOptions {
  companyRole?: unknown;
  membershipStatus?: unknown;
}

export function getRoleLabel(role: unknown, options: RoleLabelOptions = {}) {
  if (options.membershipStatus === "archived" || role === "archived") return "已归档";
  const businessRole = options.companyRole ?? role;
  if (businessRole === "owner" || businessRole === "company_owner") return "公司所有者";
  if (businessRole === "admin") return "组长 · 管理";
  return "组员";
}
