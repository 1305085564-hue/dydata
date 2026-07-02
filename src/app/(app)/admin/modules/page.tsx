import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { AdminWorkspaceLayout } from "@/components/admin-workspace-layout";
import { loadAdminModulesData } from "@/lib/loaders/admin-modules";
import { listPendingRequestsForAdmin } from "@/lib/team-join/service";
import { canAccessAdminPath } from "@/lib/analytics-access";
import { getUserPermissions } from "@/lib/permissions";

import { AdminModulesContentV2 } from "./modules-content-v2";
import { TeamV2Skeleton } from "./modules-skeleton-v2";

interface AdminModulesPageProps {
  searchParams: Promise<{ date?: string; focus?: string }>;
}

export default async function AdminModulesPage({ searchParams }: AdminModulesPageProps) {
  const permission = await getUserPermissions();
  if (!permission) redirect("/login");
  
  // 沿用与 modules 相同的权限守卫，确保符合系统的角色授权规定
  if (!canAccessAdminPath("/admin/modules", permission.businessRole, permission.permissions)) {
    redirect("/admin");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const params = await searchParams;

  return (
    <AdminWorkspaceLayout
      eyebrow="团队与成员"
      title="团队管理工作台"
      description="系统团队架构、分组归属维护及成员权限审批"
      indexItems={[
        { id: "workspace", label: "全景工作台" }
      ]}
    >
      <Suspense fallback={<TeamV2Skeleton />}>
        <ModulesDataContainer searchDate={params.date} />
      </Suspense>
    </AdminWorkspaceLayout>
  );
}

async function ModulesDataContainer({ searchDate }: { searchDate?: string }) {
  const supabase = await createClient();
  
  // 并发加载完整的团队管理上下文和入团审批请求
  const [data, pendingJoinRequestsResult] = await Promise.all([
    loadAdminModulesData({
      supabase,
      searchDate,
    }),
    listPendingRequestsForAdmin(),
  ]);

  if (!data) {
    redirect("/login");
  }

  const pendingJoinRequests = pendingJoinRequestsResult.ok ? pendingJoinRequestsResult.data : [];

  return (
    <AdminModulesContentV2
      currentUserId={data.currentUserId}
      currentUserRole={data.perm.role}
      currentUserBusinessRole={data.perm.businessRole}
      currentUserPermissions={data.perm.permissions}
      permissionManagerCapabilities={data.permissionManagerCapabilities}
      allProfiles={data.allProfiles}
      teams={data.teams}
      teamManagement={data.teamManagement}
      pendingRequests={pendingJoinRequests}
      defaultDate={data.queryDate}
    />
  );
}
