import type { SupabaseClient } from "@supabase/supabase-js";
import type { ContentToolAccount } from "@/app/(app)/content-tools/types";

type LoaderSupabase = Pick<SupabaseClient, "from">;

export interface ContentToolsPageData {
  accounts: ContentToolAccount[];
  summary: {
    accountCount: number;
    directionCount: number;
  };
}

export async function loadContentToolsPageData({
  supabase,
  userId,
}: {
  supabase: LoaderSupabase;
  userId: string;
}): Promise<ContentToolsPageData> {
  const { data: accounts } = await supabase
    .from("accounts")
    .select("id, name, content_direction")
    .eq("user_id", userId)
    .order("name", { ascending: true });

  const normalizedAccounts: ContentToolAccount[] = (accounts ?? []).map((account) => ({
    id: account.id,
    name: account.name ?? "未命名账号",
    contentDirection: account.content_direction,
  }));

  const directionCount = new Set(
    normalizedAccounts.map((account) => account.contentDirection?.trim()).filter((value): value is string => Boolean(value)),
  ).size;

  return {
    accounts: normalizedAccounts,
    summary: {
      accountCount: normalizedAccounts.length,
      directionCount,
    },
  };
}
