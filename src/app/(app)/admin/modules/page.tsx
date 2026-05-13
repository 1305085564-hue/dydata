import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { AdminWorkspaceLayout } from "@/components/admin-workspace-layout";
import { loadAdminModulesData } from "@/lib/loaders/admin-modules";

import { AdminModulesContent } from "./modules-content";

interface AdminModulesPageProps {
  searchParams: Promise<{ date?: string }>;
}

export default async function AdminModulesPage({ searchParams }: AdminModulesPageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const params = await searchParams;
  const data = await loadAdminModulesData({
    supabase,
    searchDate: params.date,
  });

  if (!data) {
    redirect("/login");
  }

  return (
    <AdminWorkspaceLayout
      eyebrow="Permission Modules"
      title="权限模块"
      description="成员、角色、权限、团队、分组和邀请码都在这里维护；数据修正、审计和导出保留为后台治理能力。"
      indexItems={[
        { id: "permissions", label: "成员" },
        { id: "teams-groups", label: "团队" },
        { label: "更多", items: [
          { id: "team-directory", label: "目录" },
          { id: "data-tools", label: "治理" },
        ]},
      ]}
    >
      <AdminModulesContent
        currentUserId={data.currentUserId}
        currentUserRole={data.perm.role}
        currentUserBusinessRole={data.perm.businessRole}
        currentUserPermissions={data.perm.permissions}
        permissionManagerCapabilities={data.permissionManagerCapabilities}
        allProfiles={data.allProfiles}
        teams={data.teams}
        teamManagement={data.teamManagement}
        fullReports={data.fullReports}
        defaultDate={data.queryDate}
        avgPlayBySubmitter={data.avgPlayBySubmitter}
        dayCountBySubmitter={data.dayCountBySubmitter}
        avgPlayByAccount={data.avgPlayByAccount}
        dayCountByAccount={data.dayCountByAccount}
        logsWithNames={data.logsWithNames}
      />
    </AdminWorkspaceLayout>
  );
}
