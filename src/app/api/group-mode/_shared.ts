import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  GROUP_MODE_COOKIE,
  GROUP_MODE_TTL_SECONDS,
  createGroupModeToken,
  hashGroupModeToken,
  isGroupModeActive,
} from "@/lib/group-mode";

export async function getGroupModeUser() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return { supabase, user };
}

export async function hasGroupModeQualification(userId: string) {
  const adminSupabase = createAdminClient();
  const [qualification, profile] = await Promise.all([
    adminSupabase
      .from("group_permission_qualifications")
      .select("user_id")
      .eq("user_id", userId)
      .is("revoked_at", null)
      .maybeSingle(),
    adminSupabase
      .from("profiles")
      .select("membership_status")
      .eq("id", userId)
      .single(),
  ]);

  if (qualification.error || profile.error) throw new Error("集团权限状态读取失败");
  return Boolean(qualification.data) && profile.data?.membership_status !== "archived";
}

export async function enterGroupMode(userId: string) {
  if (!(await hasGroupModeQualification(userId))) {
    return { ok: false as const, status: 403 as const, message: "没有集团权限资格" };
  }

  const adminSupabase = createAdminClient();
  const now = new Date();
  const token = createGroupModeToken(now);
  const revoke = await adminSupabase
    .from("group_mode_sessions")
    .update({ revoked_at: now.toISOString() })
    .eq("user_id", userId)
    .is("revoked_at", null);
  if (revoke.error) throw new Error("集团模式开启失败");

  const insert = await adminSupabase
    .from("group_mode_sessions")
    .insert({
      user_id: userId,
      token_hash: token.tokenHash,
      expires_at: token.expiresAt.toISOString(),
    })
    .select("expires_at")
    .single();
  if (insert.error || !insert.data) throw new Error("集团模式开启失败");

  return { ok: true as const, token: token.token, expiresAt: insert.data.expires_at };
}

export async function getGroupModeStatus(userId: string, rawToken: string | undefined) {
  if (!rawToken) return { active: false as const, expiresAt: null };

  const adminSupabase = createAdminClient();
  const result = await adminSupabase
    .from("group_mode_sessions")
    .select("token_hash, expires_at, revoked_at")
    .eq("user_id", userId)
    .eq("token_hash", hashGroupModeToken(rawToken))
    .is("revoked_at", null)
    .maybeSingle();
  if (result.error) throw new Error("集团模式状态读取失败");
  if (!result.data || !isGroupModeActive({
    tokenHash: result.data.token_hash,
    expiresAt: result.data.expires_at,
    revokedAt: result.data.revoked_at,
  })) return { active: false as const, expiresAt: null };
  return { active: true as const, expiresAt: result.data.expires_at };
}

export async function exitGroupMode(userId: string, rawToken: string | undefined) {
  if (!rawToken) return;
  const adminSupabase = createAdminClient();
  const result = await adminSupabase
    .from("group_mode_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("token_hash", hashGroupModeToken(rawToken))
    .is("revoked_at", null);
  if (result.error) throw new Error("集团模式退出失败");
}

export function groupModeCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/",
    maxAge: GROUP_MODE_TTL_SECONDS,
  };
}

export { GROUP_MODE_COOKIE };
