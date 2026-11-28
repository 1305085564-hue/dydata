import type { SupabaseClient } from "@supabase/supabase-js";

/** 本人账号更新必须返回实际命中的记录，零行不能当作保存成功。 */
export async function saveOwnAccountUpdate(
  supabase: SupabaseClient,
  userId: string,
  accountId: string,
  patch: { name?: string; remark?: string | null },
) {
  const { data, error } = await supabase.from("accounts").update(patch)
    .eq("id", accountId).eq("profile_id", userId).select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "未保存：账号不存在或无权限修改" };
  return { success: true } as const;
}
