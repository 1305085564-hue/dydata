import { Card, CardContent } from "@/components/ui/card";
import { hasPermission } from "@/lib/permission-utils";
import type { Permissions, UserRole } from "@/types";

import { AuditLogList } from "../audit-log-list";
import { DataManager } from "../data-manager";
import { ExportButton } from "../export-button";
import { PermissionManager } from "../permission-manager";

interface AdminModulesContentProps {
  currentUserId: string;
  currentUserRole: UserRole;
  currentUserPermissions: Permissions;
  permissionManagerCapabilities: {
    canRemoveMember: boolean;
    canChangeRole: boolean;
    canEditPermissions: boolean;
  };
  allProfiles: Array<{
    id: string;
    name: string;
    email: string | null;
    role: string;
    team_name: string | null;
    permissions: Permissions | null;
  }>;
  fullReports: Parameters<typeof DataManager>[0]["reports"];
  defaultDate: string;
  avgPlayBySubmitter: Record<string, number>;
  dayCountBySubmitter: Record<string, number>;
  avgPlayByAccount: Record<string, number>;
  dayCountByAccount: Record<string, number>;
  logsWithNames: Parameters<typeof AuditLogList>[0]["logs"];
}

export function AdminModulesContent({
  currentUserId,
  currentUserRole,
  currentUserPermissions,
  permissionManagerCapabilities,
  allProfiles,
  fullReports,
  defaultDate,
  avgPlayBySubmitter,
  dayCountBySubmitter,
  avgPlayByAccount,
  dayCountByAccount,
  logsWithNames,
}: AdminModulesContentProps) {
  const canManagePermissions =
    permissionManagerCapabilities.canRemoveMember ||
    permissionManagerCapabilities.canChangeRole ||
    permissionManagerCapabilities.canEditPermissions;
  const canEditData = hasPermission(currentUserRole, currentUserPermissions, "edit_data");
  const canExportData = hasPermission(currentUserRole, currentUserPermissions, "export_data");
  const canViewAuditLog = hasPermission(currentUserRole, currentUserPermissions, "view_audit_log");
  const hasVisibleModules = canManagePermissions || canEditData || canExportData || canViewAuditLog;

  if (!hasVisibleModules) {
    return (
      <Card className="glass-card-static border-white/60 glass-panel">
        <CardContent className="p-6 text-sm text-[var(--color-text-secondary)]">
          当前账号没有可用的功能模块权限。
        </CardContent>
      </Card>
    );
  }

  return (
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
                members={allProfiles.map((profile) => ({
                  id: profile.id,
                  name: profile.name,
                  email: profile.email,
                  role: profile.role as UserRole,
                  teamName: profile.team_name,
                  permissions: (profile.permissions ?? {}) as Permissions,
                }))}
                currentUserId={currentUserId}
                currentUserRole={currentUserRole}
                currentUserPermissions={currentUserPermissions}
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
                reports={fullReports}
                defaultDate={defaultDate}
                avgPlayBySubmitter={avgPlayBySubmitter}
                dayCountBySubmitter={dayCountBySubmitter}
                avgPlayByAccount={avgPlayByAccount}
                dayCountByAccount={dayCountByAccount}
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
                查看最近后台操作日志，保留原有日志数据来源和展示能力。
              </p>
            </div>
            <AuditLogList logs={logsWithNames} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
