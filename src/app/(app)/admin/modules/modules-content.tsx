"use client";

import { useState } from "react";
import { hasPermission } from "@/lib/permission-utils";
import type { Permissions, UserRole } from "@/types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { AuditLogList } from "../audit-log-list";
import { DataManager } from "../data-manager";
import { ExportButton } from "../export-button";
import { PermissionManager } from "../permission-manager";
import { TeamGroupManager } from "../team-group-manager";
import { TeamManager } from "../team-manager";

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
    team_id?: string | null;
    group_id?: string | null;
    team_name: string | null;
    permissions: Permissions | null;
  }>;
  teams: Array<{ id: string; name: string }>;
  teamManagement: Parameters<typeof TeamGroupManager>[0];
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
  teams,
  teamManagement,
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

  const [activeTab, setActiveTab] = useState(() => {
    if (canManagePermissions) return "permissions";
    if (canEditData) return "data";
    if (canViewAuditLog) return "audit";
    if (canExportData) return "export";
    return "permissions";
  });

  if (!hasVisibleModules) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-zinc-500">当前账号没有可用的权限模块权限。</p>
      </div>
    );
  }

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
      <TabsList className="h-10 bg-zinc-100 p-1 rounded-xl">
        {canManagePermissions ? (
          <TabsTrigger
            value="permissions"
            className="rounded-lg px-4 text-sm font-medium text-zinc-500 data-[state=active]:bg-white data-[state=active]:text-zinc-800 data-[state=active]:shadow-sm"
          >
            权限管理
          </TabsTrigger>
        ) : null}
        {canEditData ? (
          <TabsTrigger
            value="data"
            className="rounded-lg px-4 text-sm font-medium text-zinc-500 data-[state=active]:bg-white data-[state=active]:text-zinc-800 data-[state=active]:shadow-sm"
          >
            数据管理
          </TabsTrigger>
        ) : null}
        {canViewAuditLog ? (
          <TabsTrigger
            value="audit"
            className="rounded-lg px-4 text-sm font-medium text-zinc-500 data-[state=active]:bg-white data-[state=active]:text-zinc-800 data-[state=active]:shadow-sm"
          >
            审计日志
          </TabsTrigger>
        ) : null}
        {canExportData ? (
          <TabsTrigger
            value="export"
            className="rounded-lg px-4 text-sm font-medium text-zinc-500 data-[state=active]:bg-white data-[state=active]:text-zinc-800 data-[state=active]:shadow-sm"
          >
            数据导出
          </TabsTrigger>
        ) : null}
      </TabsList>

      {canManagePermissions ? (
        <TabsContent value="permissions" className="mt-0">
          <div id="permissions" className="scroll-mt-8 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm space-y-4">
            <div className="space-y-1">
              <h2 className="text-[18px] font-medium text-zinc-800">角色与权限管理</h2>
              <p className="text-sm text-zinc-500">控制成员角色和管理权限，保持原有权限规则不变。</p>
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
          </div>
          {teamManagement.access.canView ? (
            <div id="teams-groups" className="mt-6 scroll-mt-8 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
              <TeamGroupManager
                access={teamManagement.access}
                teams={teamManagement.teams}
                groups={teamManagement.groups}
                profiles={teamManagement.profiles}
                leaderCandidates={teamManagement.leaderCandidates}
              />
            </div>
          ) : null}
          {canManagePermissions ? (
            <div id="team-directory" className="mt-6 scroll-mt-8 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
              <div className="mb-4 space-y-1">
                <h2 className="text-[18px] font-medium text-zinc-800">团队目录</h2>
                <p className="text-sm text-zinc-500">团队名称维护归入权限模块，便于和成员、角色、分组一起处理。</p>
              </div>
              <TeamManager teams={teams} />
            </div>
          ) : null}
        </TabsContent>
      ) : null}

      {canEditData ? (
        <TabsContent value="data" className="mt-0">
          <div id="data-tools" className="scroll-mt-8 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm space-y-4">
            <div className="space-y-1">
              <h2 className="text-[18px] font-medium text-zinc-800">数据管理与修正</h2>
              <p className="text-sm text-zinc-500">处理异常值、补录和修正，继续复用现有后台编辑逻辑。</p>
            </div>
            <DataManager
              reports={fullReports}
              defaultDate={defaultDate}
              avgPlayBySubmitter={avgPlayBySubmitter}
              dayCountBySubmitter={dayCountBySubmitter}
              avgPlayByAccount={avgPlayByAccount}
              dayCountByAccount={dayCountByAccount}
            />
          </div>
        </TabsContent>
      ) : null}

      {canViewAuditLog ? (
        <TabsContent value="audit" className="mt-0">
          <div id="audit-log" className="scroll-mt-8 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm space-y-4">
            <div className="space-y-1">
              <h2 className="text-[18px] font-medium text-zinc-800">近期操作审计</h2>
              <p className="text-sm text-zinc-500">查看最近后台操作日志，保留原有日志数据来源和展示能力。</p>
            </div>
            <AuditLogList logs={logsWithNames} />
          </div>
        </TabsContent>
      ) : null}

      {canExportData ? (
        <TabsContent value="export" className="mt-0">
          <div id="export-data" className="scroll-mt-8 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm space-y-4">
            <div className="space-y-1">
              <h2 className="text-[18px] font-medium text-zinc-800">数据导出</h2>
              <p className="text-sm text-zinc-500">继续使用原有导出接口，按日期范围导出 Excel。</p>
            </div>
            <ExportButton />
          </div>
        </TabsContent>
      ) : null}
    </Tabs>
  );
}
