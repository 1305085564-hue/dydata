import type { CompanyRole, Permissions, UserRole } from "@/types";

export type MembershipStatus = "active" | "archived";

export interface MembershipQueryResult<T> {
  data: T[] | null;
  error: { message?: string } | null;
}

export interface MemberArchiveSnapshot {
  role: UserRole;
  company_role?: CompanyRole | null;
  permissions: Permissions;
  team_id: string | null;
  team_name?: string | null;
}

export interface MemberLifecycleProfile {
  id: string;
  role: UserRole;
  company_role?: CompanyRole | null;
  permissions: Permissions | null;
  team_id: string | null;
  membership_status?: MembershipStatus | string | null;
  archive_snapshot?: { team_id?: string | null } | null;
}

export interface ArchiveMemberProfilePatch {
  membership_status: "archived";
  archived_at: string;
  archived_by: string;
  archive_reason: string;
  archive_snapshot: MemberArchiveSnapshot;
  role: "member";
  company_role: "member";
  permissions: Permissions;
  team_id: null;
}

export interface RestoreMemberProfilePatch {
  membership_status: "active";
  archived_at: null;
  archived_by: null;
  archive_reason: null;
  archive_snapshot: null;
  role: "member";
  company_role: "member";
  permissions: Permissions;
  team_id: null;
}

export function normalizeMembershipStatus(value: unknown): MembershipStatus {
  return value === "archived" ? "archived" : "active";
}

export function isActiveMembership(profile: Pick<MemberLifecycleProfile, "membership_status">) {
  return normalizeMembershipStatus(profile.membership_status) === "active";
}

export function isArchivedMembership(profile: Pick<MemberLifecycleProfile, "membership_status">) {
  return normalizeMembershipStatus(profile.membership_status) === "archived";
}

export function filterActiveMemberships<T extends { membership_status?: string | null }>(rows: T[]) {
  return rows.filter((row) => isActiveMembership(row));
}

export function filterArchivedMemberships<T extends { membership_status?: string | null }>(rows: T[]) {
  return rows.filter((row) => isArchivedMembership(row));
}

export function isMissingMembershipStatusError(error: { message?: string } | null | undefined) {
  const message = error?.message ?? "";
  return (
    message.includes("profiles.membership_status") ||
    message.includes("column membership_status does not exist") ||
    message.includes("Could not find the 'membership_status' column")
  );
}

export type MembershipAccessStatus = MembershipStatus | "unavailable";

export function resolveMembershipStatusFromQuery(input: {
  data: { membership_status?: unknown } | null;
  error: { message?: string } | null;
}): MembershipAccessStatus {
  if (isMissingMembershipStatusError(input.error)) return "active";
  if (input.error || !input.data) return "unavailable";
  return normalizeMembershipStatus(input.data.membership_status);
}

export async function loadWithMembershipFallback<T>(input: {
  loadWithMembership: () => Promise<MembershipQueryResult<T>>;
  loadWithoutMembership: () => Promise<MembershipQueryResult<T>>;
}) {
  const primary = await input.loadWithMembership();
  if (!isMissingMembershipStatusError(primary.error)) {
    return { ...primary, usedFallback: false };
  }

  const fallback = await input.loadWithoutMembership();
  return { ...fallback, usedFallback: true };
}

export function canArchiveMember(input: {
  actorRole: UserRole;
  actorCompanyRole?: CompanyRole | null;
  actorPermissions?: Permissions | null;
  actorTeamId?: string | null;
  groupMode?: boolean;
  actorId: string;
  target: MemberLifecycleProfile;
}) {
  if (input.groupMode !== true && input.actorPermissions?.manage_members !== true) return false;
  if (input.actorId === input.target.id) return false;
  if (input.target.role === "owner" || input.target.company_role === "company_owner") return false;
  if (input.groupMode === true) return true;
  if (
    input.actorCompanyRole !== "company_owner"
    && input.actorRole !== "owner"
    && (input.target.role === "admin" || input.target.company_role === "admin")
  ) return false;
  const targetTeamId = input.target.team_id ?? input.target.archive_snapshot?.team_id ?? null;
  return Boolean(input.actorTeamId && targetTeamId && input.actorTeamId === targetTeamId);
}

export function canRestoreMember(input: {
  actorRole: UserRole;
  actorCompanyRole?: CompanyRole | null;
  actorPermissions?: Permissions | null;
  actorTeamId?: string | null;
  groupMode?: boolean;
  actorId: string;
  target: MemberLifecycleProfile;
}) {
  if (input.groupMode !== true && input.actorPermissions?.manage_members !== true) return false;
  if (input.actorId === input.target.id) return false;
  if (input.target.role === "owner" || input.target.company_role === "company_owner") return false;
  if (input.groupMode === true) return true;
  if (
    input.actorCompanyRole !== "company_owner"
    && input.actorRole !== "owner"
    && (input.target.role === "admin" || input.target.company_role === "admin")
  ) return false;
  const targetTeamId = input.target.team_id ?? input.target.archive_snapshot?.team_id ?? null;
  return Boolean(input.actorTeamId && targetTeamId && input.actorTeamId === targetTeamId);
}

export function buildArchiveMemberProfilePatch(input: {
  target: MemberLifecycleProfile;
  archivedBy: string;
  reason: string;
  archivedAt: string;
  snapshot: MemberArchiveSnapshot;
}): ArchiveMemberProfilePatch {
  return {
    membership_status: "archived",
    archived_at: input.archivedAt,
    archived_by: input.archivedBy,
    archive_reason: input.reason.trim(),
    archive_snapshot: input.snapshot,
    role: "member",
    company_role: "member",
    permissions: {},
    team_id: null,
  };
}

export function buildRestoreMemberProfilePatch(): RestoreMemberProfilePatch {
  return {
    membership_status: "active",
    archived_at: null,
    archived_by: null,
    archive_reason: null,
    archive_snapshot: null,
    role: "member",
    company_role: "member",
    permissions: {},
    team_id: null,
  };
}
