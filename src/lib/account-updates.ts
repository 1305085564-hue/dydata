import type { SupabaseClient } from "@supabase/supabase-js";

export async function saveOwnProfileName(supabase: SupabaseClient, userId: string, name: string) {
  const { data, error } = await supabase.from("profiles").update({ name })
    .eq("id", userId).select("id").maybeSingle();
  if (error) return { error: "保存失败，请稍后重试" };
  if (!data) return { error: "未保存：成员资料不存在，请刷新后重试" };
  return { success: true } as const;
}

/** 本人账号更新必须返回实际命中的记录，零行不能当作保存成功。 */
export async function saveOwnAccountUpdate(
  supabase: SupabaseClient,
  userId: string,
  accountId: string,
  patch: { name?: string; remark?: string | null },
) {
  const { data, error } = await supabase.from("accounts").update(patch)
    .eq("id", accountId).eq("profile_id", userId).select("id");
  if (error) return { error: "保存失败，请稍后重试" };
  if (!data?.length) return { error: "未保存：账号不存在或无权限修改" };
  return { success: true } as const;
}
