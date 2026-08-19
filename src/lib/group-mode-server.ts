import { cookies } from "next/headers";

import { createAdminClient } from "@/lib/supabase/admin";
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
    const [qualification, session] = await Promise.all([
      adminSupabase
        .from("group_permission_qualifications")
        .select("user_id")
        .eq("user_id", userId)
        .is("revoked_at", null)
        .maybeSingle(),
      adminSupabase
        .from("group_mode_sessions")
        .select("token_hash, expires_at, revoked_at")
        .eq("user_id", userId)
        .eq("token_hash", tokenHash)
        .is("revoked_at", null)
        .maybeSingle(),
    ]);

    if (qualification.error || session.error || !qualification.data || !session.data) {
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
