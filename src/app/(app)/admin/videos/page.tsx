import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canAccessAdminPath } from "@/lib/analytics-access";
import { getUserPermissions } from "@/lib/permissions";
import { loadAdminVideosPageData } from "@/lib/loaders/admin-videos-page";
import { AdminWorkspaceLayout } from "@/components/admin-workspace-layout";
import { VideoPageClient } from "./video-page-client";

type VideoView = "pending" | "all";

interface Props {
  searchParams: Promise<{ view?: string }>;
}

function normalizeView(value: string | undefined): VideoView {
  return value === "all" ? "all" : "pending";
}

export default async function AdminVideosPage({ searchParams }: Props) {
  const perm = await getUserPermissions();
  if (!perm) redirect("/login");
  if (!canAccessAdminPath("/admin/videos", perm.businessRole, perm.permissions)) redirect("/dashboard");

  const params = await searchParams;
  const view = normalizeView(params.view);

  const supabase = await createClient();
  const data = await loadAdminVideosPageData({ supabase, view });

  return (
    <AdminWorkspaceLayout
      eyebrow="视频素材"
      title="视频资产"
      description="原始视频、24h 快照、标签与异常状态"
      indexItems={[]}
    >
      <VideoPageClient initialView={view} initialData={data} />
    </AdminWorkspaceLayout>
  );
}
