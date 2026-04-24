import { redirect } from "next/navigation";

import { AdminSecondaryNav, AppShell, AppShellHero } from "@/components/app-shell";
import { createClient } from "@/lib/supabase/server";
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
    <AppShell width="full" className="max-w-[1440px] pb-24">
      <AppShellHero
        eyebrow="Feature Modules"
        title="功能模块"
        description="把角色权限、数据修正、操作审计和数据导出集中到一个工作台里处理，保留现有权限和原始数据链路。"
      >
        <AdminSecondaryNav
          pathname="/admin/modules"
          canManageAdmin
          panelBasePath="/admin"
          userRole={data.perm.role}
        />
      </AppShellHero>

      <AdminModulesContent
        currentUserId={data.currentUserId}
        currentUserRole={data.perm.role}
        currentUserPermissions={data.perm.permissions}
        permissionManagerCapabilities={data.permissionManagerCapabilities}
        allProfiles={data.allProfiles}
        fullReports={data.fullReports}
        defaultDate={data.queryDate}
        avgPlayBySubmitter={data.avgPlayBySubmitter}
        dayCountBySubmitter={data.dayCountBySubmitter}
        avgPlayByAccount={data.avgPlayByAccount}
        dayCountByAccount={data.dayCountByAccount}
        logsWithNames={data.logsWithNames}
      />
    </AppShell>
  );
}
