"use client";

import { type Dispatch, type SetStateAction, useEffect, useRef, useState, useTransition } from "react";
import { Plus, Trash2, UsersRound } from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { hasPermission } from "@/lib/permission-utils";
import type { BusinessRole } from "@/lib/business-role";
import type { Permissions, UserRole } from "@/types";

import { GovernanceDialog } from "../governance-dialog";
import { PermissionManager } from "../permission-manager";
import { TeamGroupManager } from "../team-group-manager";
import { createTeam, deleteTeam } from "../actions";
import { feedbackToast } from "@/components/ui/feedback-toast";
import type { AdminModulesTeamManagementData } from "@/lib/loaders/admin-modules";
import { TeamManagementSkeleton } from "./团队管理骨架";

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
    status?: string | null;
    exempt_type?: import("@/types").ExemptType | null;
    exempt_start_date?: string | null;
    exempt_end_date?: string | null;
    exempt_reason?: string | null;
    exemption_category?: import("@/types").ExemptionCategory | null;
  }>;
  teams: Array<{ id: string; name: string }>;
  defaultDate: string;
  defaultTab?: "members" | "teams";
}

function ManageTeamSheet({
  teams,
  open,
  onOpenChange,
  onTeamsChange,
}: {
  teams: Array<{ id: string; name: string }>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTeamsChange: Dispatch<SetStateAction<Array<{ id: string; name: string }>>>;
}) {
  const [teamName, setTeamName] = useState("");
  const [localTeams, setLocalTeams] = useState(teams);
  const [isPending, startTransition] = useTransition();
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    setLocalTeams(teams);
  }, [teams]);

  function handleCreate() {
    const normalizedName = teamName.trim();
    if (!normalizedName) return;
    const optimisticTeam = { id: `pending-${Date.now()}`, name: normalizedName };

    setLocalTeams((current) => [...current, optimisticTeam]);
    onTeamsChange((current) => [...current, optimisticTeam]);
    setTeamName("");
    feedbackToast.success(`已新增团队：${normalizedName}`);

    startTransition(async () => {
      const result = await createTeam(normalizedName);
      if (result.error) {
        setLocalTeams((current) =>
          current.filter((team) => team.id !== optimisticTeam.id),
        );
        onTeamsChange((current) =>
          current.filter((team) => team.id !== optimisticTeam.id),
        );
        setTeamName(normalizedName);
        feedbackToast.error(result.error);
        return;
      }

      const createdTeam = result.team ?? { id: optimisticTeam.id, name: normalizedName };
      setLocalTeams((current) =>
        current.map((team) => (team.id === optimisticTeam.id ? createdTeam : team)),
      );
      onTeamsChange((current) =>
        current.map((team) => (team.id === optimisticTeam.id ? createdTeam : team)),
      );
    });
  }

  function handleDelete() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    const previousTeams = localTeams;

    setLocalTeams((current) => current.filter((team) => team.id !== target.id));
    onTeamsChange((current) => current.filter((team) => team.id !== target.id));
    setDeleteTarget(null);
    feedbackToast.success(`已删除团队：${target.name}`);

    startTransition(async () => {
      const result = await deleteTeam(target.id);
      if (result.error) {
        setLocalTeams(previousTeams);
        onTeamsChange(previousTeams);
        feedbackToast.error(result.error);
        return;
      }
    });
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-[400px] sm:max-w-none">
          <SheetHeader>
            <SheetTitle className="text-[18px] font-medium tracking-tight text-zinc-800">
              管理团队
            </SheetTitle>
          </SheetHeader>
          <SheetBody className="space-y-6">
            <div className="space-y-1.5">
              <Label htmlFor="new-team-name">新增团队</Label>
              <div className="flex gap-2">
                <Input
                  id="new-team-name"
                  value={teamName}
                  onChange={(event) => setTeamName(event.target.value)}
                  placeholder="例如：上海一部"
                  className="h-10 flex-1 rounded-xl bg-zinc-50 border-transparent focus:bg-white focus:border-zinc-200 focus:shadow-sm transition-[background-color,border-color,box-shadow] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]"
                />
                <Button
                  onClick={handleCreate}
                  disabled={isPending || !teamName.trim()}
                  className="h-10 bg-[#D97757] text-white rounded-[10px] hover:bg-[#C9604D] hover:-translate-y-[1px] active:translate-y-0"
                >
                  <Plus className="size-4" />
                </Button>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2 text-[13px] font-medium text-zinc-800">
                <UsersRound className="size-4 text-zinc-400" />
                当前团队
              </div>
              <div className="space-y-1">
                {localTeams.map((team) => (
                  <div
                    key={team.id}
                    className="group flex items-center justify-between gap-2 rounded-lg px-3 py-2 transition-colors hover:bg-zinc-50"
                  >
                    <span className="text-[13px] text-zinc-700">{team.name}</span>
                    <button
                      type="button"
                      className="active:translate-y-0 rounded-md p-1 text-zinc-300 transition-colors hover:text-[#C9604D] opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-150 pointer-events-none group-hover:pointer-events-auto focus-within:pointer-events-auto"
                      onClick={() => setDeleteTarget(team)}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </SheetBody>
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="确认删除团队"
        description={
          deleteTarget
            ? `确定删除团队「${deleteTarget.name}」吗？此操作不可恢复，且仅允许删除无成员、无分组的空团队。`
            : ""
        }
        confirmText="确认删除"
        destructive
        loading={isPending}
        className="rounded-2xl border border-zinc-200 bg-white shadow-sm"
        onConfirm={handleDelete}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      />
    </>
  );
}

export function AdminModulesContent({
  currentUserId,
  currentUserRole,
  currentUserBusinessRole,
  currentUserPermissions,
  permissionManagerCapabilities,
  allProfiles,
  teams,
  defaultDate,
  defaultTab: requestedDefaultTab,
}: AdminModulesContentProps) {
  const [governanceOpen, setGovernanceOpen] = useState(false);
  const [manageTeamOpen, setManageTeamOpen] = useState(false);
  const [localTeams, setLocalTeams] = useState(teams);
  const [hydratedProfiles, setHydratedProfiles] = useState(allProfiles);
  const [teamManagement, setTeamManagement] = useState<AdminModulesTeamManagementData | null>(null);
  const [isTeamManagementLoading, setIsTeamManagementLoading] = useState(false);
  const [teamManagementError, setTeamManagementError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"members" | "teams" | null>(null);
  const hasRequestedEmails = useRef(false);
  const hasRequestedTeamManagement = useRef(false);

  useEffect(() => {
    setLocalTeams(teams);
  }, [teams]);

  useEffect(() => {
    setHydratedProfiles(allProfiles);
  }, [allProfiles]);

  const canManagePermissions =
    permissionManagerCapabilities.canRemoveMember ||
    permissionManagerCapabilities.canChangeRole ||
    permissionManagerCapabilities.canEditPermissions;
  const effectiveRole = currentUserBusinessRole ?? currentUserRole;
  const canEditData = hasPermission(effectiveRole, currentUserPermissions, "edit_data");
  const canExportData = hasPermission(effectiveRole, currentUserPermissions, "export_data");
  const canViewTeamsTab =
    effectiveRole === "owner" ||
    effectiveRole === "team_admin" ||
    effectiveRole === "group_leader";
  const showTeams = canManagePermissions && canViewTeamsTab;
  const showGovernance = canEditData || canExportData;
  const hasVisibleModules = canManagePermissions || showGovernance;
  const defaultTab = requestedDefaultTab === "teams" && showTeams ? "teams" : canManagePermissions ? "members" : "teams";

  useEffect(() => {
    if (hasRequestedEmails.current) return;
    hasRequestedEmails.current = true;

    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/admin/modules/member-emails", { cache: "no-store" });
        const payload = (await response.json()) as { error?: string; emails?: Record<string, string | null> };
        if (!response.ok || payload.error || !payload.emails || cancelled) return;

        setHydratedProfiles((current) =>
          current.map((profile) => ({
            ...profile,
            email: payload.emails?.[profile.id] ?? profile.email,
          })),
        );
      } catch {
        // 邮箱补全失败不影响首屏可用性
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const nextActiveTab = activeTab ?? defaultTab;
    if (nextActiveTab !== "teams" || !showTeams || hasRequestedTeamManagement.current) return;
    hasRequestedTeamManagement.current = true;
    setIsTeamManagementLoading(true);
    setTeamManagementError(null);

    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/admin/modules/team-management", { cache: "no-store" });
        const payload = (await response.json()) as (AdminModulesTeamManagementData & { error?: string });
        if (!response.ok || payload.error) {
          throw new Error(payload.error || "加载团队与分组失败");
        }
        if (!cancelled) {
          setTeamManagement(payload);
        }
      } catch (error) {
        if (!cancelled) {
          setTeamManagementError(error instanceof Error ? error.message : "加载团队与分组失败");
        }
      } finally {
        if (!cancelled) {
          setIsTeamManagementLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeTab, defaultTab, showTeams]);

  if (!hasVisibleModules) {
    return (
      <p className="text-[13px] text-zinc-500">当前账号没有可用的权限模块权限。</p>
    );
  }

  return (
    <div className="space-y-8">
      {canManagePermissions || showTeams ? (
        <Tabs
          defaultValue={defaultTab}
          onValueChange={(value) => setActiveTab(value === "teams" ? "teams" : "members")}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center justify-end gap-3">
              <TabsList className="bg-zinc-100/70 p-1">
                {canManagePermissions ? (
                  <TabsTrigger
                    value="members"
                    className="rounded-md px-4 py-1.5 text-[13px] font-medium data-[state=active]:bg-white data-[state=active]:text-zinc-800 data-[state=active]:shadow-sm"
                  >
                    成员权限
                  </TabsTrigger>
                ) : null}
                {showTeams ? (
                  <TabsTrigger
                    value="teams"
                    className="rounded-md px-4 py-1.5 text-[13px] font-medium data-[state=active]:bg-white data-[state=active]:text-zinc-800 data-[state=active]:shadow-sm"
                  >
                    团队与分组
                  </TabsTrigger>
                ) : null}
              </TabsList>
            </div>

            <div className="flex items-center gap-3">
              {showTeams ? (
                <Button
                  variant="outline"
                  className="h-9 rounded-lg text-[13px]"
                  onClick={() => setManageTeamOpen(true)}
                >
                  <Plus className="mr-1 size-4" />
                  管理团队
                </Button>
              ) : null}
              {showGovernance ? (
                <Button
                  variant="outline"
                  className="h-9 rounded-lg text-[13px]"
                  onClick={() => setGovernanceOpen(true)}
                >
                  数据管理
                </Button>
              ) : null}
            </div>
          </div>

          {canManagePermissions ? (
            <TabsContent value="members" id="members" className="mt-6 scroll-mt-8">
              <PermissionManager
                members={hydratedProfiles.map((profile) => ({
                  id: profile.id,
                  name: profile.name,
                  email: profile.email,
                  role: profile.role as UserRole,
                  teamId: profile.team_id,
                  teamName: profile.team_name,
                  permissions: (profile.permissions ?? {}) as Permissions,
                  status: (profile.status ?? null) as import("@/types").UserStatus | null,
                  exempt_type: profile.exempt_type ?? null,
                  exempt_start_date: profile.exempt_start_date ?? null,
                  exempt_end_date: profile.exempt_end_date ?? null,
                  exempt_reason: profile.exempt_reason ?? null,
                  exemption_category: profile.exemption_category ?? null,
                }))}
                teams={localTeams}
                currentUserId={currentUserId}
                currentUserRole={currentUserRole}
                currentUserBusinessRole={currentUserBusinessRole}
                currentUserPermissions={currentUserPermissions}
              />
            </TabsContent>
          ) : null}

          {showTeams ? (
            <TabsContent value="teams" id="teams" className="mt-6 scroll-mt-8">
              {isTeamManagementLoading && !teamManagement ? <TeamManagementSkeleton /> : null}
              {teamManagementError && !teamManagement ? (
                <div className="rounded-2xl border border-zinc-200 border-l-[2px] border-l-[#C9604D] bg-zinc-50 px-4 py-3 text-[13px] text-[#C9604D]">
                  {teamManagementError}
                </div>
              ) : null}
              {teamManagement ? (
                <section className="space-y-6 rounded-2xl border border-zinc-200 bg-white p-6">
                  <TeamGroupManager
                    access={teamManagement.access}
                    teams={localTeams}
                    groups={teamManagement.groups}
                    profiles={teamManagement.profiles}
                    leaderCandidates={teamManagement.leaderCandidates}
                  />
                </section>
              ) : null}
            </TabsContent>
          ) : null}
        </Tabs>
      ) : null}

      <ManageTeamSheet
        teams={localTeams}
        open={manageTeamOpen}
        onOpenChange={setManageTeamOpen}
        onTeamsChange={setLocalTeams}
      />

      <GovernanceDialog
        open={governanceOpen}
        onOpenChange={setGovernanceOpen}
        canExportData={canExportData}
        canEditData={canEditData}
        defaultDate={defaultDate}
      />
    </div>
  );
}
