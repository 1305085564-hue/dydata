import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdviceAction, Profile, Video } from "@/types";

type LoaderSupabase = Pick<SupabaseClient, "from">;

type JoinedProfile = Pick<Profile, "id" | "name"> | Pick<Profile, "id" | "name">[] | null;
type JoinedAccount = { id: string; name: string } | { id: string; name: string }[] | null;
type JoinedVideo =
  | Pick<Video, "id" | "video_title" | "video_url" | "published_at">
  | Pick<Video, "id" | "video_title" | "video_url" | "published_at">[]
  | null;

type FilterOption = Pick<Profile, "id" | "name">;
type AccountOption = { id: string; name: string };

export type AdviceListItemRow = Pick<
  AdviceAction,
  "id" | "target_user_id" | "target_account_id" | "advice_content" | "advice_source" | "status" | "created_at"
> & {
  target_profile: JoinedProfile;
  target_account: JoinedAccount;
};

export type AdviceDetailRow = AdviceListItemRow &
  Pick<
    AdviceAction,
    "evidence" | "assigned_by" | "executed_video_id" | "review_result" | "reviewed_by" | "updated_at"
  > & {
    assigned_profile: JoinedProfile;
    reviewed_profile: JoinedProfile;
    related_video: JoinedVideo;
  };

export type AdviceRow = AdviceListItemRow;

export interface AdminAdvicePageData {
  advice: AdviceListItemRow[];
  profiles: FilterOption[];
  accounts: AccountOption[];
}

const ADVICE_LIST_SELECT = [
  "id",
  "target_user_id",
  "target_account_id",
  "advice_content",
  "advice_source",
  "status",
  "created_at",
  "target_profile:profiles!advice_actions_target_user_id_fkey(id, name)",
  "target_account:accounts!advice_actions_target_account_id_fkey(id, name)",
].join(", ");

const ADVICE_DETAIL_SELECT = [
  "id",
  "target_user_id",
  "target_account_id",
  "advice_content",
  "evidence",
  "advice_source",
  "status",
  "assigned_by",
  "executed_video_id",
  "review_result",
  "reviewed_by",
  "created_at",
  "updated_at",
  "target_profile:profiles!advice_actions_target_user_id_fkey(id, name)",
  "target_account:accounts!advice_actions_target_account_id_fkey(id, name)",
  "assigned_profile:profiles!advice_actions_assigned_by_fkey(id, name)",
  "reviewed_profile:profiles!advice_actions_reviewed_by_fkey(id, name)",
  "related_video:videos!advice_actions_executed_video_id_fkey(id, video_title, video_url, published_at)",
].join(", ");

export async function loadAdminAdvicePageData({ supabase }: { supabase: LoaderSupabase }): Promise<AdminAdvicePageData> {
  const [{ data: advice }, { data: profiles }, { data: accounts }] = await Promise.all([
    supabase
      .from("advice_actions")
      .select(ADVICE_LIST_SELECT)
      .order("created_at", { ascending: false }),
    supabase.from("profiles").select("id, name").order("name", { ascending: true }),
    supabase.from("accounts").select("id, name").order("name", { ascending: true }),
  ]);

  return {
    advice: (advice ?? []) as unknown as AdviceListItemRow[],
    profiles: (profiles ?? []).map((profile) => ({ id: profile.id, name: profile.name ?? "未命名成员" })),
    accounts: (accounts ?? []).map((account) => ({ id: account.id, name: account.name ?? "未命名账号" })),
  };
}

export async function loadAdminAdviceDetail({
  supabase,
  id,
}: {
  supabase: LoaderSupabase;
  id: string;
}): Promise<AdviceDetailRow | null> {
  const { data, error } = await supabase
    .from("advice_actions")
    .select(ADVICE_DETAIL_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as unknown as AdviceDetailRow;
}

export function hydrateAdviceListItems(
  rows: AdviceListItemRow[],
  detailsById: Record<string, AdviceDetailRow | undefined>,
): Array<AdviceListItemRow | AdviceDetailRow> {
  return rows.map((row) => {
    const detail = detailsById[row.id];
    if (!detail) return row;

    return {
      ...row,
      ...detail,
      target_profile: detail.target_profile ?? row.target_profile,
      target_account: detail.target_account ?? row.target_account,
    };
  });
}

export const __internal = {
  ADVICE_LIST_SELECT,
  ADVICE_DETAIL_SELECT,
};
