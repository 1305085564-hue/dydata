import type { OrphanExemptionRequest } from "@/lib/exemption-orphan";
import type { WorkGroupRow, WorkGroupRosterMember } from "@/lib/work-groups";
import type {
  CompanyRole,
  DataScope,
  Permissions,
  UserRole,
} from "@/types";

/* ─── Types ─── */

export interface ProfileSummary {
  id: string;
  name: string;
  email: string | null;
  last_sign_in_at?: string | null;
  role: UserRole;
  company_role?: CompanyRole | null;
  team_id?: string | null;
  data_scope?: DataScope | null;
  team_name: string | null;
  permissions: Permissions | null;
  status?: string | null;
  membership_status?: "active" | "archived" | string | null;
  archived_at?: string | null;
  archived_by?: string | null;
  archived_by_name?: string | null;
  archive_reason?: string | null;
  archive_snapshot?: Record<string, unknown> | null;
  exempt_type?: string | null;
  exempt_start_date?: string | null;
  exempt_end_date?: string | null;
  exempt_reason?: string | null;
  exemption_category?: string | null;
  monthly_published_count?: number;
  monthly_required_count?: number;
  monthly_published_days?: number;
}

export interface TeamOption {
  id: string;
  name: string;
}

export interface PendingRequest {
  id: string;
  applicantUserId: string;
  applicantName: string;
  applicantEmail: string | null;
  targetTeamId: string;
  targetTeamName: string;
  createdAt: string;
}

export interface AdminModulesContentProps {
  currentUserId: string;
  currentUserRole: UserRole;
  currentUserBusinessRole?: UserRole;
  currentUserCompanyRole?: CompanyRole;
  currentUserGroupMode?: boolean;
  currentUserPermissions: Permissions;
  permissionManagerCapabilities: {
    canRemoveMember: boolean;
    canChangeRole: boolean;
    canEditPermissions: boolean;
  };
  allProfiles: ProfileSummary[];
  archivedProfiles?: ProfileSummary[];
  teams: TeamOption[];
  teamManagement: {
    access: {
      canView: boolean;
      canEditMembers?: boolean;
      teamIds: string[] | null;
    };
    teams: TeamOption[];
    profiles: unknown[];
  };
  pendingRequests: PendingRequest[];
  orphanExemptionRequests: OrphanExemptionRequest[];
  orphanExemptionCount: number;
  workGroups?: WorkGroupRow[];
  workGroupRoster?: WorkGroupRosterMember[];
  defaultDate: string;
  focusMemberId?: string;
  initialMemberView?: string;
  initialTeamId?: string;
  initialSearchQuery?: string;
}
