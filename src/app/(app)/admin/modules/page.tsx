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
        { id: "permissions", label: "成员权限", hint: "成员、角色、权限" },
        { id: "teams-groups", label: "团队分组", hint: "团队、分组、组长" },
        { id: "team-directory", label: "团队目录", hint: "团队名称维护" },
        { id: "data-tools", label: "数据治理", hint: "修正、审计、导出" },
      ]}
    >
      <AdminModulesContent
        currentUserId={data.currentUserId}
        currentUserRole={data.perm.role}
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
