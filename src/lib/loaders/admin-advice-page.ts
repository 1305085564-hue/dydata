import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdviceAction, Profile, Video } from "@/types";

type LoaderSupabase = Pick<SupabaseClient, "from">;

export type AdviceRow = AdviceAction & {
  target_profile: Pick<Profile, "id" | "name"> | Pick<Profile, "id" | "name">[] | null;
  target_account: { id: string; name: string } | { id: string; name: string }[] | null;
  assigned_profile: Pick<Profile, "id" | "name"> | Pick<Profile, "id" | "name">[] | null;
  reviewed_profile: Pick<Profile, "id" | "name"> | Pick<Profile, "id" | "name">[] | null;
  related_video: Pick<Video, "id" | "video_title" | "video_url" | "published_at"> | Pick<Video, "id" | "video_title" | "video_url" | "published_at">[] | null;
};

type FilterOption = Pick<Profile, "id" | "name">;
type AccountOption = { id: string; name: string };

export interface AdminAdvicePageData {
  advice: AdviceRow[];
  profiles: FilterOption[];
  accounts: AccountOption[];
  summary: {
    total: number;
    pending: number;
    done: number;
    aiSource: number;
  };
}

export async function loadAdminAdvicePageData({ supabase }: { supabase: LoaderSupabase }): Promise<AdminAdvicePageData> {
  const [{ data: advice }, { data: profiles }, { data: accounts }] = await Promise.all([
    supabase
      .from("advice_actions")
      .select(
        "*, target_profile:profiles!advice_actions_target_user_id_fkey(id, name), target_account:accounts!advice_actions_target_account_id_fkey(id, name), assigned_profile:profiles!advice_actions_assigned_by_fkey(id, name), reviewed_profile:profiles!advice_actions_reviewed_by_fkey(id, name), related_video:videos!advice_actions_executed_video_id_fkey(id, video_title, video_url, published_at)"
      )
      .order("created_at", { ascending: false }),
    supabase.from("profiles").select("id, name").order("name", { ascending: true }),
    supabase.from("accounts").select("id, name").order("name", { ascending: true }),
  ]);

  const rows = (advice ?? []) as AdviceRow[];

  return {
    advice: rows,
    profiles: (profiles ?? []).map((profile) => ({ id: profile.id, name: profile.name ?? "未命名成员" })),
    accounts: (accounts ?? []).map((account) => ({ id: account.id, name: account.name ?? "未命名账号" })),
    summary: {
      total: rows.length,
      pending: rows.filter((row) => row.status === "待执行" || row.status === "待查看").length,
      done: rows.filter((row) => row.status === "已执行" || row.status === "已复核").length,
      aiSource: rows.filter((row) => row.advice_source === "ai").length,
    },
  };
}
