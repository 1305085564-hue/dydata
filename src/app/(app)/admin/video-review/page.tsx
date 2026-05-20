import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { canAccessAdminPath } from "@/lib/analytics-access";
import { buildDataAccessScope, filterRowsByDataScope } from "@/lib/data-access-scope";
import { getUserPermissions } from "@/lib/permissions";
import { VideoReviewClient } from "./video-review-client";

interface Props {
  searchParams: Promise<{ q?: string }>;
}

export default async function AdminVideoReviewPage({ searchParams }: Props) {
  const perm = await getUserPermissions();
  if (!perm) redirect("/login");
  if (!canAccessAdminPath("/admin/video-review", perm.businessRole, perm.permissions)) redirect("/dashboard");

  const supabase = createAdminClient();
  const scope = await buildDataAccessScope(supabase, perm.userId);
  if (!scope) redirect("/dashboard");
  const { data: items } = await supabase
    .from("video_review")
    .select(`
      id, video_id, reviewer_id, status, ai_diagnosis, feedback_card,
      ai_diagnosis_at, feedback_sent_at, created_at,
      video:videos(id, video_title, account_id, user_id, video_url, uploaded_at),
      reviewer:profiles!reviewer_id(id, name)
    `)
    .order("created_at", { ascending: false })
    .limit(100);

  const params = await searchParams;
  const query = (await params).q || "";

  const visibleItems = filterRowsByDataScope(scope, items ?? [], (item) => {
    const video = Array.isArray(item.video) ? item.video[0] : item.video;
    return video?.user_id;
  });

  return <VideoReviewClient initialItems={visibleItems} initialQuery={query} />;
}
