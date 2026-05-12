import { hasPermission } from "@/lib/permission-utils";
import type { Permissions, UserRole } from "@/types";

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
  logsWithNames: unknown;
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
}: AdminModulesContentProps) {
  const canManagePermissions =
    permissionManagerCapabilities.canRemoveMember ||
    permissionManagerCapabilities.canChangeRole ||
    permissionManagerCapabilities.canEditPermissions;
  const canEditData = hasPermission(currentUserRole, currentUserPermissions, "edit_data");
  const canExportData = hasPermission(currentUserRole, currentUserPermissions, "export_data");
  const hasVisibleModules = canManagePermissions || canEditData || canExportData;

  if (!hasVisibleModules) {
    return (
      <p className="text-[13px] text-zinc-500">当前账号没有可用的权限模块权限。</p>
    );
  }

  return (
    <div className="space-y-10">
      {canManagePermissions ? (
        <section id="permissions" className="scroll-mt-8">
          <PermissionManager
            members={allProfiles.map((profile) => ({
              id: profile.id,
              name: profile.name,
              email: profile.email,
              role: profile.role as UserRole,
              teamId: profile.team_id,
              teamName: profile.team_name,
              permissions: (profile.permissions ?? {}) as Permissions,
            }))}
            teams={teams}
            currentUserId={currentUserId}
            currentUserRole={currentUserRole}
            currentUserPermissions={currentUserPermissions}
          />
        </section>
      ) : null}

      {canManagePermissions && teamManagement.access.canView ? (
        <section
          id="teams-groups"
          className="scroll-mt-8 rounded-2xl border border-zinc-200 bg-white p-6"
        >
          <TeamGroupManager
            access={teamManagement.access}
            teams={teamManagement.teams}
            groups={teamManagement.groups}
            profiles={teamManagement.profiles}
            leaderCandidates={teamManagement.leaderCandidates}
          />
        </section>
      ) : null}

      {canManagePermissions ? (
        <section
          id="team-directory"
          className="scroll-mt-8 space-y-4 rounded-2xl border border-zinc-200 bg-white p-6"
        >
          <div className="flex items-center border-l-2 border-[#D97757] pl-3">
            <h2 className="text-[15px] font-medium tracking-tight text-zinc-800">团队目录</h2>
          </div>
          <TeamManager teams={teams} />
        </section>
      ) : null}

      {canEditData || canExportData ? (
        <section
          id="data-tools"
          className="scroll-mt-8 space-y-4 rounded-2xl border border-zinc-200 bg-white p-6"
        >
          <div className="flex items-end justify-between gap-4">
            <div className="flex items-center border-l-2 border-[#D97757] pl-3">
              <h2 className="text-[15px] font-medium tracking-tight text-zinc-800">数据治理</h2>
            </div>
            {canExportData ? <ExportButton /> : null}
          </div>
          {canEditData ? (
            <DataManager
              reports={fullReports}
              defaultDate={defaultDate}
              avgPlayBySubmitter={avgPlayBySubmitter}
              dayCountBySubmitter={dayCountBySubmitter}
              avgPlayByAccount={avgPlayByAccount}
              dayCountByAccount={dayCountByAccount}
            />
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
