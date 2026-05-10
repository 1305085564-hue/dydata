import { redirect } from "next/navigation";

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
    <div className="space-y-8">
      <div>
        <p className="text-[10px] uppercase tracking-[0.25em] font-medium text-zinc-400">Feature Modules</p>
        <h1 className="mt-2 text-[20px] font-semibold tracking-tight text-zinc-800">功能模块</h1>
        <p className="mt-1 text-[13px] leading-[1.7] text-zinc-500">权限管理、数据修正、操作审计和数据导出</p>
      </div>
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
    </div>
  );
}
