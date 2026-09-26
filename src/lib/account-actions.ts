"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function isUuidLike(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim());
}

export async function updateProfile(name: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "请先登录" };

  const trimmed = name?.trim();
  if (!trimmed) return { error: "显示名称不能为空" };
  if (trimmed.length > 20) return { error: "显示名称最多 20 个字符" };

  const { error } = await supabase
    .from("profiles")
    .update({ name: trimmed })
    .eq("id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/dashboard");
  revalidatePath("/admin");
  return { success: true };
}

export async function createAccount(name: string, contentDirection?: string, remark?: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "请先登录" };

  if (!name?.trim()) return { error: "账号名称不能为空" };
  if (isUuidLike(name)) return { error: "账号名不能是一串系统编号，请填写正确的账号名称" };

  const { error } = await supabase.from("accounts").insert({
    profile_id: user.id,
    name: name.trim(),
    content_direction: contentDirection?.trim() || null,
    remark: remark?.trim() || null,
  });

  if (error) return { error: error.message };

  revalidatePath("/dashboard");
  return { success: true };
}

export async function updateAccountName(accountId: string, newName: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "请先登录" };

  const trimmed = newName?.trim();
  if (!trimmed) return { error: "账号名称不能为空" };
  if (trimmed.length > 30) return { error: "账号名称最多 30 个字符" };
  if (isUuidLike(trimmed)) return { error: "账号名称不能是一串系统编号" };

  const { error } = await supabase
    .from("accounts")
    .update({ name: trimmed })
    .eq("id", accountId)
    .eq("profile_id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/dashboard");
  revalidatePath("/admin");
  return { success: true };
}

export async function updateAccountRemark(accountId: string, newRemark: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "请先登录" };

  const trimmed = newRemark?.trim();
  if (trimmed && trimmed.length > 30) return { error: "备注最多 30 个字符" };

  const { error } = await supabase
    .from("accounts")
    .update({ remark: trimmed || null })
    .eq("id", accountId)
    .eq("profile_id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/dashboard");
  revalidatePath("/admin");
  return { success: true };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
