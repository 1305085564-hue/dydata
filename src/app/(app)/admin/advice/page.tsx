import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getUserPermissions, isAdminLevel } from "@/lib/permissions";
import type { AdviceAction, Profile, Video } from "@/types";

import { AdviceList } from "./advice-list";

export type AdviceRow = AdviceAction & {
  target_profile: Pick<Profile, "id" | "name"> | Pick<Profile, "id" | "name">[] | null;
  target_account: { id: string; name: string } | { id: string; name: string }[] | null;
  assigned_profile: Pick<Profile, "id" | "name"> | Pick<Profile, "id" | "name">[] | null;
  reviewed_profile: Pick<Profile, "id" | "name"> | Pick<Profile, "id" | "name">[] | null;
  related_video: Pick<Video, "id" | "video_title" | "video_url" | "published_at"> | Pick<Video, "id" | "video_title" | "video_url" | "published_at">[] | null;
};

type FilterOption = Pick<Profile, "id" | "name">;
type AccountOption = { id: string; name: string };

export default async function AdminAdvicePage() {
  const permission = await getUserPermissions();

  if (!permission) {
    redirect("/login");
  }

  if (!isAdminLevel(permission.role)) {
    redirect("/dashboard");
  }

  const supabase = await createClient();
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

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div className="space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">建议管理</h1>
        <p className="text-sm text-muted-foreground">按员工、账号、状态和来源查看建议闭环，并支持批量生成与复核。</p>
      </div>

      <AdviceList
        advice={(advice ?? []) as AdviceRow[]}
        profiles={(profiles ?? []) as FilterOption[]}
        accounts={(accounts ?? []) as AccountOption[]}
        currentUserId={permission.userId}
      />
    </div>
  );
}
