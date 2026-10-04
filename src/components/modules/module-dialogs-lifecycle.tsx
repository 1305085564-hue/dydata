import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import type { ModuleDialogsProps } from "./module-dialogs.types";

type ModuleDialogsLifecycleProps = Pick<
  ModuleDialogsProps,
  | "isPending"
  | "archiveTarget"
  | "setArchiveTarget"
  | "archiveReason"
  | "setArchiveReason"
  | "handleArchiveMember"
  | "batchArchiveOpen"
  | "setBatchArchiveOpen"
  | "batchArchiveReason"
  | "setBatchArchiveReason"
  | "handleBatchArchive"
  | "selectedMemberIds"
  | "restoreTarget"
  | "setRestoreTarget"
  | "handleRestoreMember"
  | "roleChangeConfirm"
  | "setRoleChangeConfirm"
  | "handleRoleChangeConfirm"
>;

export function ModuleDialogsLifecycle({
  isPending,
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
  selectedMemberIds,
  restoreTarget,
  setRestoreTarget,
  handleRestoreMember,
  roleChangeConfirm,
  setRoleChangeConfirm,
  handleRoleChangeConfirm,
}: ModuleDialogsLifecycleProps) {
  return (
    <>
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


    </>
  );
}
