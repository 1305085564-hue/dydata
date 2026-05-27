import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdminActor, type AdminActor } from "@/app/api/admin/ai-assistant/_shared";
import { canAccessAdminPath } from "@/lib/analytics-access";
import { buildDataAccessScope, type DataAccessScope } from "@/lib/data-access-scope";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Video } from "@/types";

type JoinedAccount = { name: string | null; profile_id?: string | null } | Array<{ name: string | null; profile_id?: string | null }> | null;
type JoinedProfile = { name: string | null } | Array<{ name: string | null }> | null;

export type ScopedVideoRow = Video & {
  accounts: JoinedAccount;
  profiles: JoinedProfile;
};

export type ScopedAdminVideoAccess = {
  actor: AdminActor;
  scope: DataAccessScope;
  supabase: SupabaseClient;
  video: ScopedVideoRow & {
    accounts: { name: string | null; profile_id?: string | null } | null;
    profiles: { name: string | null } | null;
  };
};

export type ScopedAdminVideoError = {
  error: string;
  status: 401 | 403 | 404;
};

function firstJoined<T>(value: T | T[] | null): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export async function requireScopedAdminVideo({
  videoId,
  pathname,
}: {
  videoId: string;
  pathname: "/admin/videos" | "/admin/content";
}): Promise<ScopedAdminVideoAccess | ScopedAdminVideoError> {
  const auth = await requireAdminActor();
  if ("error" in auth && typeof auth.error === "string" && typeof auth.status === "number") {
    return { error: auth.error, status: auth.status as 401 | 403 | 404 };
  }

  if (!canAccessAdminPath(pathname, auth.actor.businessRole, auth.actor.permissions)) {
    return { error: "无权限", status: 403 as const };
  }

  const supabase = createAdminClient();
  const scope = await buildDataAccessScope(supabase, auth.actor.userId);
  if (!scope) {
    return { error: "用户权限范围加载失败", status: 403 as const };
  }

  const { data, error } = await supabase
    .from("videos")
    .select(
      "id, account_id, user_id, video_url, video_title, content, published_at, uploaded_at, anomaly_status, asset_level, asset_note, asset_reviewed_by, asset_reviewed_at, created_at, accounts(name, profile_id), profiles!videos_user_id_fkey(name)",
    )
    .eq("id", videoId)
    .maybeSingle();

  if (error || !data) {
    return { error: "视频不存在", status: 404 as const };
  }

  const video = data as ScopedVideoRow;
  const account = firstJoined(video.accounts);
  const ownerUserId = account?.profile_id ?? video.user_id;

  if (scope.kind !== "all" && !scope.visibleUserIds.includes(ownerUserId)) {
    return { error: "无权限查看该视频", status: 403 as const };
  }

  return {
    actor: auth.actor,
    scope,
    supabase,
    video: {
      ...video,
      accounts: account,
      profiles: firstJoined(video.profiles),
    } as ScopedVideoRow & {
      accounts: { name: string | null; profile_id?: string | null } | null;
      profiles: { name: string | null } | null;
    },
  };
}
