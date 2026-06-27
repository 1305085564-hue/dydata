import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { AdminWorkspaceLayout } from "@/components/admin-workspace-layout";
import { TableSkeleton } from "@/components/ui/table-skeleton";
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
      <Suspense fallback={
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 mt-4">
          <TableSkeleton columnCount={4} rowCount={6} showHeader={true} />
        </div>
      }>
        <ModulesDataContainer searchDate={params.date} focus={params.focus} />
      </Suspense>
    </AdminWorkspaceLayout>
  );
}

async function ModulesDataContainer({ searchDate, focus }: { searchDate?: string, focus?: string }) {
  const supabase = await createClient();
  const data = await loadAdminModulesFirstScreenData({
    supabase,
    searchDate: searchDate,
  });

  if (!data) {
    redirect("/login");
  }

  return (
    <AdminModulesContent
      currentUserId={data.currentUserId}
      currentUserRole={data.perm.role}
      currentUserBusinessRole={data.perm.businessRole}
      currentUserPermissions={data.perm.permissions}
      permissionManagerCapabilities={data.permissionManagerCapabilities}
      allProfiles={data.allProfiles}
      teams={data.teams}
      defaultDate={data.queryDate}
      defaultTab={normalizeFocus(focus)}
    />
  );
}
