import { Building2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ItemHeading } from "@/components/ui/item-heading";
import { MemberAiDialogs } from "@/app/(app)/admin/modules/member-ai-dialogs";
import type { AiSuggestionItem } from "@/app/(app)/admin/modules/member-ai-dialogs";
import { canManagePermanentExemption } from "@/app/(app)/admin/modules/permanent-exemption-logic";

import type { ModuleDialogsProps } from "./module-dialogs.types";

export function ModuleDialogs({
  isAiDialogOpen,
  setIsAiDialogOpen,
  aiSuggestion,
  executingAiKey,
  isPending,
  toolConfirmationModal,
  localProfiles,
  localArchivedProfiles,
  selectedMemberIds,
  handleFetchAiSuggestion,
  routerPush,
  handleExecuteAiSuggestion,
  setToolConfirmationModal,
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
  archiveTarget,
  setArchiveTarget,
  archiveReason,
  setArchiveReason,
  handleArchiveMember,
  batchArchiveOpen,
  setBatchArchiveOpen,
  batchArchiveReason,
  setBatchArchiveReason,
  handleBatchArchive,
  restoreTarget,
  setRestoreTarget,
  handleRestoreMember,
  roleChangeConfirm,
  setRoleChangeConfirm,
  handleRoleChangeConfirm,
  passwordResetTarget,
  setPasswordResetTarget,
  newPassword,
  setNewPassword,
  handleResetPassword,
  currentCompanyRole,
  setPermanentTarget,
  setSetPermanentTarget,

  permanentReason,
  setPermanentReason,
  permanentReasonError,
  setPermanentReasonError,
  isPermanentSubmitting,
  handleConfirmSetPermanent,
  clearPermanentTarget,
  setClearPermanentTarget,
  handleConfirmClearPermanent,
}: ModuleDialogsProps) {
  return (
    <>
      {/* ── Dialogs ── */}

      <MemberAiDialogs
        open={isAiDialogOpen}
        onOpenChange={setIsAiDialogOpen}
        suggestion={aiSuggestion}
        executingKey={executingAiKey}
        pending={isPending}
        confirmation={toolConfirmationModal}
        profiles={[...localProfiles, ...localArchivedProfiles]}
        onRefresh={() => void handleFetchAiSuggestion()}
        onNavigate={routerPush}
        onExecute={(suggestion, key) => void handleExecuteAiSuggestion(suggestion, key)}
        onCancelConfirmation={() => setToolConfirmationModal(null)}
        onConfirm={() => {
          if (!toolConfirmationModal) return;
          const fakeSuggestion: AiSuggestionItem = {
            label: "确认执行",
            description: "",
            action: {
              type: "execute_tool",
              toolName: toolConfirmationModal.toolName,
              toolArgs: toolConfirmationModal.toolArgs,
            },
          };
          void handleExecuteAiSuggestion(fakeSuggestion, "confirmed", toolConfirmationModal.confirmationToken);
        }}
      />

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

      {/* 单账号归档弹窗 (带原因输入) */}
      <Dialog
        open={archiveTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setArchiveTarget(null);
            setArchiveReason("");
          }
        }}
      >
        <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden max-w-md">
          <DialogHeader>
            <DialogTitle className="font-medium text-[#141413]">确认归档成员账号</DialogTitle>
            <DialogDescription>
              即将归档「{archiveTarget?.name}」的账号。归档将立即封禁登录并移出团队，历史日报不受影响。
            </DialogDescription>
          </DialogHeader>

          <div className="py-3 space-y-1">
            <Label className="block">
              归档原因说明 <span className="text-status-danger">*</span>
            </Label>
            <Input
              placeholder="必填，例如：离职、转岗、实习结束"
              value={archiveReason}
              onChange={(e) => setArchiveReason(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setArchiveTarget(null);
                setArchiveReason("");
              }}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              disabled={isPending || !archiveReason.trim()}
              onClick={handleArchiveMember}
            >
              {isPending ? "处理中..." : "确认归档"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 批量归档弹窗 */}
      <Dialog
        open={batchArchiveOpen}
        onOpenChange={(open) => {
          if (!open) {
            setBatchArchiveOpen(false);
            setBatchArchiveReason("");
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-medium text-[#141413]">批量归档成员账号</DialogTitle>
            <DialogDescription>
              即将批量归档选中的 {selectedMemberIds.length} 位成员账号，归档后将封禁登录并移出各自团队。
            </DialogDescription>
          </DialogHeader>

          <div className="py-3 space-y-1">
            <Label className="block">
              统一归档原因说明 <span className="text-status-danger">*</span>
            </Label>
            <Input
              placeholder="必填，例如：业务调整批量归档、实习期满离职"
              value={batchArchiveReason}
              onChange={(e) => setBatchArchiveReason(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setBatchArchiveOpen(false);
                setBatchArchiveReason("");
              }}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              disabled={isPending || !batchArchiveReason.trim()}
              onClick={handleBatchArchive}
            >
              {isPending ? "批量处理中..." : `确认归档 (${selectedMemberIds.length}人)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 恢复账号确认 */}
      <ConfirmDialog
        open={restoreTarget !== null}
        title="恢复成员账号"
        description={
          restoreTarget ? `确认恢复 ${restoreTarget.name}？恢复后将解除封禁，成为未分配团队的在职组员。` : ""
        }
        confirmText="确认恢复"
        loading={isPending}
        onConfirm={handleRestoreMember}
        onOpenChange={(open) => {
          if (!open) setRestoreTarget(null);
        }}
      />

      {/* 角色切换确认 */}
      <ConfirmDialog
        open={roleChangeConfirm !== null}
        title={roleChangeConfirm?.targetRole === "admin" ? "提升为组长（管理层）" : "调整为组员"}
        description={
          roleChangeConfirm
            ? roleChangeConfirm.targetRole === "admin"
              ? `即将提升「${roleChangeConfirm.memberName}」为组长。提升后该成员将获得管理层职级，可管理本公司全部成员。确认继续？`
              : `即将调整「${roleChangeConfirm.memberName}」为组员。调整后该成员将失去管理权限，且当前的功能权限配置将被清空。确认继续？`
            : ""
        }
        confirmText="确认变更"
        destructive={roleChangeConfirm?.targetRole === "member"}
        loading={isPending}
        onConfirm={handleRoleChangeConfirm}
        onOpenChange={(open) => {
          if (!open) setRoleChangeConfirm(null);
        }}
      />

      {/* 重置密码弹窗 */}
      <Dialog
        open={passwordResetTarget !== null}
        onOpenChange={(o) => {
          if (!o) {
            setPasswordResetTarget(null);
            setNewPassword("");
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-medium text-[#141413]">重置登录密码</DialogTitle>
            <DialogDescription>
              为「{passwordResetTarget?.name}」设置新的临时登录密码（至少 6 位）。
            </DialogDescription>
          </DialogHeader>
          <div className="py-3 space-y-1">
            <Label className="block">新密码</Label>
            <Input
              type="text"
              placeholder="输入至少 6 位的新密码"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setPasswordResetTarget(null);
                setNewPassword("");
              }}
            >
              取消
            </Button>
            <Button
              variant="default"
              disabled={isPending || newPassword.trim().length < 6}
              onClick={handleResetPassword}
            >
              {isPending ? "重置中..." : "确认重置"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── 永久不参与考核弹窗（仅 Owner 可见和操作，判定收口在 permanent-exemption-logic） ── */}
      {canManagePermanentExemption(currentCompanyRole) && (
        <>
          <Dialog
            open={setPermanentTarget !== null}
            onOpenChange={(open) => {
              if (!open && !isPermanentSubmitting) {
                setSetPermanentTarget(null);
                setPermanentReason("");
                setPermanentReasonError(null);
              }
            }}
          >
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle className="font-medium text-[#141413]">
                  设置不参与考核
                </DialogTitle>
                <DialogDescription className="text-[13px] text-[#78716C] leading-relaxed">
                  开启后「{setPermanentTarget?.name ?? "该成员"}」将不再进入履约、日报应发、催交等应交统计。历史日报与作品记录仍可查。
                  {setPermanentTarget?.exempt_type === "temporary" && (
                    <span className="block mt-1 text-[#B98A54]">
                      该成员当前处于临时豁免期，设置后将转为永久生效并优先。
                    </span>
                  )}
                </DialogDescription>
              </DialogHeader>

              <DialogBody className="space-y-4 py-2">
                <div className="space-y-1.5">
                  <Label htmlFor="permanent-exemption-reason">
                    设置原因 <span className="text-[#C0685C]">*</span>
                  </Label>
                  <Textarea
                    id="permanent-exemption-reason"
                    value={permanentReason}
                    onChange={(e) => {
                      setPermanentReason(e.target.value);
                      if (permanentReasonError) setPermanentReasonError(null);
                    }}
                    disabled={isPermanentSubmitting}
                    maxLength={500}
                    rows={3}
                    placeholder="例如：合伙人 / 纯运营管理岗，不参与日常发文考核"
                    className="w-full rounded-md border border-[#E2E2DF] bg-white px-3 py-2 text-[13px] text-[#1F1E1D] placeholder:text-[#A8A29E] focus:outline-none focus:ring-1 focus:ring-[#141413]/10 resize-none shadow-input disabled:opacity-50"
                  />
                  <div className="flex items-center justify-between text-[12px]">
                    {permanentReasonError ? (
                      <span className="text-[#C0685C]">{permanentReasonError}</span>
                    ) : (
                      <span className="text-[#78716C]">请如实填写原因以供审计留痕</span>
                    )}
                    <span className="text-[#78716C] tabular-nums">
                      {permanentReason.trim().length}/500
                    </span>
                  </div>
                </div>
              </DialogBody>

              <DialogFooter className="gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isPermanentSubmitting}
                  onClick={() => {
                    setSetPermanentTarget(null);
                    setPermanentReason("");
                    setPermanentReasonError(null);
                  }}
                  className="rounded-md"
                >
                  取消
                </Button>
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  disabled={isPermanentSubmitting || !permanentReason.trim()}
                  onClick={handleConfirmSetPermanent}
                  className="rounded-md"
                >
                  {isPermanentSubmitting ? "正在设置..." : "确认设置"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <ConfirmDialog
            open={clearPermanentTarget !== null}
            title={`确认撤销「${clearPermanentTarget?.name ?? "该成员"}」的不参与考核？`}
            description="撤销后该成员将重新纳入日常应交与缺交考核统计。历史提交数据与豁免记录不会删除。"
            confirmText={isPermanentSubmitting ? "正在撤销..." : "确认撤销"}
            cancelText="取消"
            destructive={true}
            loading={isPermanentSubmitting}
            onConfirm={handleConfirmClearPermanent}
            onOpenChange={(open) => {
              if (!open && !isPermanentSubmitting) {
                setClearPermanentTarget(null);
              }
            }}
          />
        </>
      )}
    </>
  );
}
