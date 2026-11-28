import {
type MemberArchiveSnapshot,
type MemberLifecycleProfile
} from "@/lib/member-lifecycle";
import type { CompanyRole,Permissions,UserRole } from "@/types";
import type { SupabaseClient } from "@supabase/supabase-js";


export type PostgrestErrorLike = { code?: string; message?: string } | null;

export type MemberLifecycleClient = SupabaseClient;

export type MemberLifecycleProfileRow = MemberLifecycleProfile & {
  name?: string | null;
  permissions: Permissions | null;
  team_id: string | null;
  membership_status: string | null;
  archived_at?: string | null;
  archived_by?: string | null;
  archive_reason?: string | null;
  archive_snapshot?: MemberArchiveSnapshot | null;
};

export type MemberLifecycleActor = {
  id: string;
  role: UserRole;
  companyRole?: CompanyRole | null;
  permissions?: Permissions | null;
  teamId?: string | null;
};

export type MemberLifecycleOperationResult =
  | {
      ok: true;
      changed: boolean;
      target: MemberLifecycleProfileRow;
      beforeSnapshot: Record<string, unknown>;
      afterSnapshot: Record<string, unknown>;
      affectedData?: Record<string, unknown>;
    }
  | {
      ok: false;
      error: string;
      firstError: string;
    };

export type AuthUserSnapshot = {
  metadata: Record<string, unknown>;
  banned: boolean;
};
