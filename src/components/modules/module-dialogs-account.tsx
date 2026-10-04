import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { canManagePermanentExemption } from "@/app/(app)/admin/modules/permanent-exemption-logic";

import type { ModuleDialogsProps } from "./module-dialogs.types";

type ModuleDialogsAccountProps = Pick<
  ModuleDialogsProps,
  | "passwordResetTarget"
  | "setPasswordResetTarget"
  | "newPassword"
  | "setNewPassword"
  | "handleResetPassword"
  | "currentCompanyRole"
  | "setPermanentTarget"
  | "setSetPermanentTarget"
  | "permanentReason"
  | "setPermanentReason"
  | "permanentReasonError"
  | "setPermanentReasonError"
  | "isPermanentSubmitting"
  | "handleConfirmSetPermanent"
  | "clearPermanentTarget"
  | "setClearPermanentTarget"
  | "handleConfirmClearPermanent"
  | "isPending"
>;

export function ModuleDialogsAccount({
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
  isPending,
}: ModuleDialogsAccountProps) {
  return (
    <>
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
