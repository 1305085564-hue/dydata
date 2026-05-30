import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { AdminWorkspaceLayout } from "@/components/admin-workspace-layout";
import { loadAdminModulesFirstScreenData } from "@/lib/loaders/admin-modules";
import { canAccessAdminPath } from "@/lib/analytics-access";
import { getUserPermissions } from "@/lib/permissions";

import { AdminModulesContent } from "./modules-content";

interface AdminModulesPageProps {
  searchParams: Promise<{ date?: string; focus?: string }>;
}

function normalizeFocus(value: string | undefined): "members" | "teams" {
  return value === "teams" || value === "team" ? "teams" : "members";
}

export default async function AdminModulesPage({ searchParams }: AdminModulesPageProps) {
  const permission = await getUserPermissions();
  if (!permission) redirect("/login");
  if (!canAccessAdminPath("/admin/modules", permission.businessRole, permission.permissions)) redirect("/admin");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const params = await searchParams;
  const data = await loadAdminModulesFirstScreenData({
    supabase,
    searchDate: params.date,
  });

  if (!data) {
    redirect("/login");
  }

  return (
    <AdminWorkspaceLayout
      eyebrow="成员与权限"
      title="团队与成员"
      description="成员权限管理、团队与分组维护"
      indexItems={[
        { id: "members", label: "成员权限" },
        { id: "teams", label: "团队与分组" },
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
        defaultDate={data.queryDate}
        defaultTab={normalizeFocus(params.focus)}
      />
    </AdminWorkspaceLayout>
  );
}
