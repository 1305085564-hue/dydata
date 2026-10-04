import { Building2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ItemHeading } from "@/components/ui/item-heading";

import type { ModuleDialogsProps } from "./module-dialogs.types";

type ModuleDialogsTeamProps = Pick<
  ModuleDialogsProps,
  | "teamManagementDialogOpen"
  | "setTeamManagementDialogOpen"
  | "canManageTeamStructure"
  | "newTeamName"
  | "setNewTeamName"
  | "handleCreateTeam"
  | "localTeams"
  | "setDeleteTeamTarget"
  | "handleDeleteTeam"
  | "deleteTeamTarget"
  | "isPending"
  | "localProfiles"
>;

export function ModuleDialogsTeam({
  teamManagementDialogOpen,
  setTeamManagementDialogOpen,
  canManageTeamStructure,
  newTeamName,
  setNewTeamName,
  handleCreateTeam,
  localTeams,
  setDeleteTeamTarget,
  handleDeleteTeam,
  deleteTeamTarget,
  isPending,
  localProfiles,
}: ModuleDialogsTeamProps) {
  return (
    <>
      {/* 3.4 团队架构管理弹窗 (支持删除空团队与新建) */}
      <Dialog open={teamManagementDialogOpen} onOpenChange={setTeamManagementDialogOpen}>
        <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden max-w-[460px] p-6 rounded-2xl">
          <DialogHeader>
            <DialogTitle>团队架构管理</DialogTitle>
            <DialogDescription className="text-[13px] text-[#1F1E1D]">
              新建团队或维护现有团队架构
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="min-h-0 flex-1 space-y-4 overflow-y-auto py-2">
            {canManageTeamStructure && (
              <div className="space-y-1">
                <Label htmlFor="v3-team-name">
                  新建团队
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="v3-team-name"
                    value={newTeamName}
                    onChange={(e) => setNewTeamName(e.target.value)}
                    placeholder="例如：深圳一部、杭州运营组"
                    className="h-7 text-[12px] rounded-md"
                  />
                  <Button
                    onClick={handleCreateTeam}
                    disabled={isPending || !newTeamName.trim()}
                    className="h-7 px-3 border border-[#E2E2DF] bg-[#F1F1F0] text-[#1F1E1D] hover:bg-[#EBEBE9] hover:text-[#141413] rounded-md text-[12px] shrink-0 active:scale-[0.99] active:duration-120"
                  >
                    <Plus className="size-3.5 mr-1" />
                    创建
                  </Button>
                </div>
              </div>
            )}

            <div className="space-y-2 max-h-[260px] overflow-y-auto pt-2">
              <span className="text-[13px] font-normal text-[#78716C] uppercase tracking-wider">
                现有团队 ({localTeams.length})
              </span>
              {localTeams.length === 0 ? (
                <EmptyState variant="compact" title="还没有团队记录" />
              ) : (
                localTeams.map((team) => {
                  const count = localProfiles.filter((p) => p.team_id === team.id).length;
                  return (
                    <div
                      key={team.id}
                      className="flex items-center justify-between px-3.5 py-2.5 rounded-xl border border-[#E2E2DF]/60 bg-[#FCFCFB]/50"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Building2 className="size-3.5 text-[#78716C] shrink-0" />
                        <ItemHeading as="h4" className="truncate">{team.name}</ItemHeading>
                        <span className="text-[12px] text-[#78716C] bg-white px-2 py-0.5 rounded-full border border-[#E2E2DF]/60 tabular-nums">
                          {count} 人
                        </span>
                      </div>
                      {canManageTeamStructure && count === 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteTeamTarget(team)}
                          className="h-7 px-2 text-[12px] text-[#78716C] hover:text-status-danger rounded-md shrink-0"
                          title="删除空团队"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </DialogBody>

          <DialogFooter>
            <Button
              variant="outline"
              size="s"
              onClick={() => setTeamManagementDialogOpen(false)}
              className="h-7 text-[12px] rounded-md"
            >
              完成
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除空团队确认 */}
      <ConfirmDialog
        open={deleteTeamTarget !== null}
        title="删除团队"
        description={deleteTeamTarget ? `确定删除「${deleteTeamTarget.name}」？此操作不可撤销。` : ""}
        confirmText="确认删除"
        destructive
        loading={isPending}
        onConfirm={() => {
          if (deleteTeamTarget) handleDeleteTeam(deleteTeamTarget);
        }}
        onOpenChange={(o) => {
          if (!o) setDeleteTeamTarget(null);
        }}
      />


    </>
  );
}
