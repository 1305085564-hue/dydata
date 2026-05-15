"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { hasPermission } from "@/lib/permission-utils";
import { cn } from "@/lib/utils";
import type { BusinessRole } from "@/lib/business-role";
import type { Permissions, UserRole } from "@/types";

import { DataManager } from "../data-manager";
import { ExportButton } from "../export-button";
import { PermissionManager } from "../permission-manager";
import { TeamGroupManager } from "../team-group-manager";
import { TeamManager } from "../team-manager";

interface AdminModulesContentProps {
  currentUserId: string;
  currentUserRole: UserRole;
  currentUserBusinessRole?: BusinessRole;
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
}

export function AdminModulesContent({
  currentUserId,
  currentUserRole,
  currentUserBusinessRole,
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
  const [governanceOpen, setGovernanceOpen] = useState(false);

  const canManagePermissions =
    permissionManagerCapabilities.canRemoveMember ||
    permissionManagerCapabilities.canChangeRole ||
    permissionManagerCapabilities.canEditPermissions;
  const effectiveRole = currentUserBusinessRole ?? currentUserRole;
  const canEditData = hasPermission(effectiveRole, currentUserPermissions, "edit_data");
  const canExportData = hasPermission(effectiveRole, currentUserPermissions, "export_data");
  const showTeams = canManagePermissions && teamManagement.access.canView;
  const showGovernance = canEditData || canExportData;
  const hasVisibleModules = canManagePermissions || showGovernance;

  if (!hasVisibleModules) {
    return (
      <p className="text-[13px] text-zinc-500">当前账号没有可用的权限模块权限。</p>
    );
  }

  const defaultTab = canManagePermissions ? "members" : "teams";

  return (
    <div className="space-y-8">
      {(canManagePermissions || showTeams) ? (
        <Tabs defaultValue={defaultTab}>
          <TabsList>
            {canManagePermissions ? (
              <TabsTrigger value="members">成员权限</TabsTrigger>
            ) : null}
            {showTeams ? (
              <TabsTrigger value="teams">团队与分组</TabsTrigger>
            ) : null}
          </TabsList>

          {canManagePermissions ? (
            <TabsContent value="members" id="members" className="mt-6 scroll-mt-8">
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
                currentUserBusinessRole={currentUserBusinessRole}
                currentUserPermissions={currentUserPermissions}
              />
            </TabsContent>
          ) : null}

          {showTeams ? (
            <TabsContent value="teams" id="teams" className="mt-6 scroll-mt-8">
              <section className="space-y-6 rounded-2xl border border-zinc-200 bg-white p-6">
                <div className="flex items-center border-l-2 border-[#D97757] pl-3">
                  <h2 className="text-[14px] font-medium tracking-tight text-zinc-800">
                    团队与分组
                  </h2>
                </div>
                <TeamGroupManager
                  access={teamManagement.access}
                  teams={teamManagement.teams}
                  groups={teamManagement.groups}
                  profiles={teamManagement.profiles}
                  leaderCandidates={teamManagement.leaderCandidates}
                />
                <div className="space-y-4 border-t border-zinc-200 pt-6">
                  <div className="flex items-center border-l-2 border-[#D97757] pl-3">
                    <h3 className="text-[13px] font-medium tracking-tight text-zinc-800">
                      团队目录
                    </h3>
                  </div>
                  <TeamManager teams={teams} />
                </div>
              </section>
            </TabsContent>
          ) : null}
        </Tabs>
      ) : null}

      {showGovernance ? (
        <Collapsible open={governanceOpen} onOpenChange={setGovernanceOpen}>
          <section className="rounded-2xl border border-zinc-200 bg-white">
            <CollapsibleTrigger
              className={cn(
                "flex w-full items-center justify-between gap-4 px-6 py-4 text-left",
                "transition-[background-color] duration-150 hover:bg-zinc-50",
              )}
            >
              <div className="flex items-center gap-3">
                <span className="block h-4 w-[2px] bg-[#D97757]" aria-hidden />
                <div>
                  <h2 className="text-[14px] font-medium tracking-tight text-zinc-800">
                    数据治理
                  </h2>
                  <p className="mt-0.5 text-[12px] text-zinc-500">
                    数据修正与导出能力，仅在需要时展开
                  </p>
                </div>
              </div>
              <ChevronDown
                className={cn(
                  "size-4 stroke-[1.5] text-zinc-400 transition-transform duration-150",
                  governanceOpen ? "rotate-180" : "rotate-0",
                )}
              />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="space-y-4 border-t border-zinc-200 px-6 py-6">
                {canExportData ? (
                  <div className="flex justify-end">
                    <ExportButton />
                  </div>
                ) : null}
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
              </div>
            </CollapsibleContent>
          </section>
        </Collapsible>
      ) : null}
    </div>
  );
}
