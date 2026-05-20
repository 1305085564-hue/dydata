import { redirect } from "next/navigation";

import { getUserPermissions, hasPermission } from "@/lib/permissions";
import { canAccessAdminPath } from "@/lib/analytics-access";
import { AdminSecondaryNav } from "@/components/admin-secondary-nav";

import {
  AdminQueueSection,
} from "./components/admin-cockpit";
import { AiAlertPanel } from "./components/ai-alert-panel";
import { loadAdminFirstScreenData } from "./components/admin-first-screen-loader";

interface AdminPageProps {
  searchParams: Promise<{ date?: string }>;
}

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const permissionInfo = await getUserPermissions();
  if (!permissionInfo) redirect("/login");
  if (!canAccessAdminPath("/admin", permissionInfo.businessRole, permissionInfo.permissions))
    redirect("/dashboard");

  const params = await searchParams;
  const queryDate = params.date || new Date().toISOString().split("T")[0];
  const initialData = await loadAdminFirstScreenData(queryDate);

  const canManageViolations = hasPermission(permissionInfo.businessRole, permissionInfo.permissions, "manage_violations");
  const canManageMembers = hasPermission(permissionInfo.businessRole, permissionInfo.permissions, "manage_members");
  const canViewConversion = hasPermission(permissionInfo.businessRole, permissionInfo.permissions, "view_conversion_hub");

  return (
    <div className="space-y-8">
      <div className="space-y-5">
        <div className="space-y-3">
          <div className="flex items-baseline gap-3">
            <h2 className="text-[13px] font-medium tracking-tight text-zinc-600">日常管理</h2>
          </div>
          <AdminSecondaryNav
            pathname="/admin"
            canManageAdmin
            canManageMembers={canManageMembers}
            canViewConversion={canViewConversion}
            canManageViolations={canManageViolations}
            userRole={permissionInfo.role}
            groupFilter="daily"
          />
        </div>

      </div>

      <AdminQueueSection
        date={queryDate}
        initialSummary={initialData.summary}
        initialData={{
          pendingVideos: initialData.pendingVideos,
          pendingViolations: initialData.pendingViolations,
          pendingSubmissions: initialData.pendingSubmissions,
          pendingExemptions: initialData.pendingExemptions,
          pendingJoinRequests: initialData.pendingJoinRequests,
        }}
      />
      <AiAlertPanel
        initialData={initialData.alerts}
        initialUpdatedAt={initialData.alertsUpdatedAt}
      />
    </div>
  );
}
