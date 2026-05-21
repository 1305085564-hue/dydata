import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canAccessAdminPath } from "@/lib/analytics-access";
import { getUserPermissions } from "@/lib/permissions";
import { loadAdminContentPageData } from "@/lib/loaders/admin-content-page";
import { AdminWorkspaceLayout } from "@/components/admin-workspace-layout";
import { ContentPageClient } from "./content-page-client";

type ContentView = "pending" | "all";

interface Props {
  searchParams: Promise<{ view?: string }>;
}

function normalizeView(value: string | undefined): ContentView {
  return value === "all" ? "all" : "pending";
}

export default async function AdminContentPage({ searchParams }: Props) {
  const perm = await getUserPermissions();
  if (!perm) redirect("/login");
  if (!canAccessAdminPath("/admin/content", perm.businessRole, perm.permissions)) redirect("/dashboard");

  const params = await searchParams;
  const view = normalizeView(params.view);

  const supabase = await createClient();
  const data = await loadAdminContentPageData({ supabase, view });

  return (
    <AdminWorkspaceLayout
      eyebrow="内容复盘"
      title="内容复盘"
      description="文案拆解、次日复盘、内容判断和下一步动作；原始视频资产留在视频资产页。"
      indexItems={[]}
    >
      <ContentPageClient initialView={view} initialData={data} />
    </AdminWorkspaceLayout>
  );
}
