import { redirect } from "next/navigation";

import { Card, CardContent } from "@/components/ui/card";
import { AdminSecondaryNav, AppShell, AppShellHero } from "@/components/app-shell";
import { hasPermission } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { loadAdminPageData } from "@/lib/loaders/admin-page";
import type { Permissions, UserRole } from "@/types";

import { AuditLogList } from "../audit-log-list";
import { DataManager } from "../data-manager";
import { ExportButton } from "../export-button";
import { PermissionManager } from "../permission-manager";

export default async function AdminModulesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const data = await loadAdminPageData({
    supabase,
  });

  if (!data) {
    redirect("/login");
  }

  const canManagePermissions =
    data.permissionManagerCapabilities.canRemoveMember ||
    data.permissionManagerCapabilities.canChangeRole ||
    data.permissionManagerCapabilities.canEditPermissions;
  const canEditData = hasPermission(data.perm.role, data.perm.permissions, "edit_data");
  const canExportData = hasPermission(data.perm.role, data.perm.permissions, "export_data");
  const canViewAuditLog = hasPermission(data.perm.role, data.perm.permissions, "view_audit_log");
  const hasVisibleModules = canManagePermissions || canEditData || canExportData || canViewAuditLog;

  return (
    <AppShell width="full" className="max-w-[1440px] pb-24">
      <AppShellHero
        eyebrow="Feature Modules"
        title="功能模块"
        description="把角色权限、数据修正、操作审计和数据导出集中到单独分组里处理，保留现有权限和原始数据链路。"
      >
        <AdminSecondaryNav pathname="/admin/modules" canManageAdmin />
      </AppShellHero>

      {hasVisibleModules ? (
        <div className="grid grid-flow-row-dense gap-6 lg:grid-cols-2">
          {canManagePermissions ? (
            <Card className="glass-card-static h-full border-white/60 glass-panel">
              <CardContent className="space-y-4 p-5 sm:p-6">
                <div className="space-y-1">
                  <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">角色与权限管理</h2>
                  <p className="text-sm text-[var(--color-text-secondary)]">
                    控制成员角色和管理权限，保持原有权限规则不变。
                  </p>
                </div>
                <div className="max-h-[720px] overflow-y-auto pr-1">
                  <PermissionManager
                    members={data.allProfiles.map((profile) => ({
                      id: profile.id,
                      name: profile.name,
                      email: profile.email ?? null,
                      role: profile.role as UserRole,
                      teamName: profile.team_name ?? null,
                      permissions: (profile.permissions ?? {}) as Permissions,
                    }))}
                    currentUserId={user.id}
                    currentUserRole={data.perm.role}
                    currentUserPermissions={data.perm.permissions}
                  />
                </div>
              </CardContent>
            </Card>
          ) : null}

          {canExportData ? (
            <Card className="glass-card-static h-full border-white/60 glass-panel">
              <CardContent className="space-y-4 p-5 sm:p-6">
                <div className="space-y-1">
                  <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">数据导出</h2>
                  <p className="text-sm text-[var(--color-text-secondary)]">
                    继续使用原有导出接口，按日期范围导出 Excel。
                  </p>
                </div>
                <ExportButton />
              </CardContent>
            </Card>
          ) : null}

          {canEditData ? (
            <div className="lg:col-span-2">
              <Card className="glass-card-static h-full border-white/60 glass-panel">
                <CardContent className="space-y-4 p-5 sm:p-6">
                  <div className="space-y-1">
                    <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">数据管理与修正</h2>
                    <p className="text-sm text-[var(--color-text-secondary)]">
                      处理异常值、补录和修正，继续复用现有后台编辑逻辑。
                    </p>
                  </div>
                  <DataManager
                    reports={data.fullReports}
                    defaultDate={data.queryDate}
                    avgPlayBySubmitter={data.avgPlayBySubmitter}
                    dayCountBySubmitter={data.dayCountBySubmitter}
                    avgPlayByAccount={data.avgPlayByAccount}
                    dayCountByAccount={data.dayCountByAccount}
                  />
                </CardContent>
              </Card>
            </div>
          ) : null}

          {canViewAuditLog ? (
            <Card className="glass-card-static h-full border-white/60 glass-panel">
              <CardContent className="space-y-4 p-5 sm:p-6">
                <div className="space-y-1">
                  <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">近期操作审计</h2>
                  <p className="text-sm text-[var(--color-text-secondary)]">
                    查看最近后台操作记录，保留原有日志数据来源和展示能力。
                  </p>
                </div>
                <AuditLogList logs={data.logsWithNames} />
              </CardContent>
            </Card>
          ) : null}
        </div>
      ) : (
        <Card className="glass-card-static border-white/60 glass-panel">
          <CardContent className="p-6 text-sm text-[var(--color-text-secondary)]">
            当前账号没有可用的功能模块权限。
          </CardContent>
        </Card>
      )}
    </AppShell>
  );
}
