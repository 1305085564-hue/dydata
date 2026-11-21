"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserContext } from "@/lib/current-user-context";
import { getCurrentPermissionContext } from "@/lib/current-permission-context";
import { getActiveVisibleUserIds } from "@/lib/data-access-scope";
import { GRANT_COOKIE_NAME, GRANT_COOKIE_PATH } from "@/lib/screenshot-grant";

function isUuidLike(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim());
}

async function getActiveActionUserId() {
  const { user, authError } = await getCurrentUserContext();
  if (authError || !user) return { error: "请先登录" } as const;

  const permissionContext = await getCurrentPermissionContext();
  if (
    !permissionContext
    || permissionContext.permissionInfo.userId !== user.id
    || !getActiveVisibleUserIds(permissionContext.scope).includes(user.id)
  ) {
    return { error: "当前账号暂不能使用" } as const;
  }

  return { userId: user.id } as const;
}

export async function updateProfile(name: string) {
  const actor = await getActiveActionUserId();
  if ("error" in actor) return actor;

  const trimmed = name?.trim();
  if (!trimmed) return { error: "显示名称不能为空" };
  if (trimmed.length > 20) return { error: "显示名称最多 20 个字符" };

  const { error } = await createAdminClient()
    .from("profiles")
    .update({ name: trimmed })
    .eq("id", actor.userId);

  if (error) return { error: error.message };

  revalidatePath("/dashboard");
  revalidatePath("/admin");
  return { success: true };
}

export async function createAccount(name: string, contentDirection?: string, remark?: string) {
  const actor = await getActiveActionUserId();
  if ("error" in actor) return actor;

  if (!name?.trim()) return { error: "账号名称不能为空" };
  if (isUuidLike(name)) return { error: "账号名不能是一串系统编号，换个正常的账号名称" };

  const { error } = await createAdminClient().from("accounts").insert({
    profile_id: actor.userId,
    name: name.trim(),
    content_direction: contentDirection?.trim() || null,
    remark: remark?.trim() || null,
  });

  if (error) return { error: error.message };

  revalidatePath("/dashboard");
  return { success: true };
}

export async function updateAccountName(accountId: string, newName: string) {
  const actor = await getActiveActionUserId();
  if ("error" in actor) return actor;

  const trimmed = newName?.trim();
  if (!trimmed) return { error: "账号名称不能为空" };
  if (trimmed.length > 30) return { error: "账号名称最多 30 个字符" };
  if (isUuidLike(trimmed)) return { error: "账号名称不能是一串系统编号" };

  const { error } = await createAdminClient()
    .from("accounts")
    .update({ name: trimmed })
    .eq("id", accountId)
    .eq("profile_id", actor.userId);

  if (error) return { error: error.message };

  revalidatePath("/dashboard");
  revalidatePath("/admin");
  return { success: true };
}

export async function updateAccountRemark(accountId: string, newRemark: string) {
  const actor = await getActiveActionUserId();
  if ("error" in actor) return actor;

  const trimmed = newRemark?.trim();
  if (trimmed && trimmed.length > 30) return { error: "备注最多 30 个字符" };

  const { error } = await createAdminClient()
    .from("accounts")
    .update({ remark: trimmed || null })
    .eq("id", accountId)
    .eq("profile_id", actor.userId);

  if (error) return { error: error.message };

  revalidatePath("/dashboard");
  revalidatePath("/admin");
  return { success: true };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const cookieStore = await cookies();
  cookieStore.set(GRANT_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: GRANT_COOKIE_PATH,
    maxAge: 0,
    expires: new Date(0),
  });
  redirect("/login");
}
