import { cookies } from "next/headers";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  canEnterGroupMode,
  resolveProfileCompanyRole,
} from "@/lib/company-permissions";
import {
  GROUP_MODE_COOKIE,
  hashGroupModeToken,
  isGroupModeActive,
} from "@/lib/group-mode";

type GroupModeLookupClient = ReturnType<typeof createAdminClient>;

export async function resolveGroupModeForUser(
  userId: string,
  adminSupabase: GroupModeLookupClient = createAdminClient(),
) {
  const cookieStore = await cookies();
  const rawToken = cookieStore.get(GROUP_MODE_COOKIE)?.value;
  if (!rawToken) return { active: false as const, tokenHash: null };
  const tokenHash = hashGroupModeToken(rawToken);

  try {
    const [profile, session] = await Promise.all([
      adminSupabase
        .from("profiles")
        .select("role, company_role, membership_status")
        .eq("id", userId)
        .single(),
      adminSupabase
        .from("group_mode_sessions")
        .select("token_hash, expires_at, revoked_at")
        .eq("user_id", userId)
        .eq("token_hash", tokenHash)
        .is("revoked_at", null)
        .maybeSingle(),
    ]);

    const roleResolution = profile.data
      ? resolveProfileCompanyRole(profile.data.role, profile.data.company_role)
      : null;
    const isQualified = roleResolution?.companyRole
      ? canEnterGroupMode(roleResolution.companyRole, profile.data?.membership_status)
      : false;

    if (
      profile.error
      || session.error
      || !profile.data
      || roleResolution?.conflict
      || !isQualified
      || !session.data
    ) {
      return { active: false as const, tokenHash: null };
    }

    const active = isGroupModeActive({
      tokenHash: session.data.token_hash,
      expiresAt: session.data.expires_at,
      revokedAt: session.data.revoked_at,
    });
    return { active, tokenHash: active ? tokenHash : null };
  } catch {
    return { active: false as const, tokenHash: null };
  }
}
