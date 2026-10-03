"use client";

import type { RefObject } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { SubmissionSlotRole } from "@/components/submission/提交状态机";
import type { SlotViewState } from "../video-submit-form-model";
import { createEditableSlots } from "../video-submit-form-model";
import type { OcrTaskRegistry } from "@/lib/video-submit-workflow/ocr-task";
import type { FormMetaState } from "../video-submit-form-model";

export interface FormV2DialogsProps {
  deleteTargetRole: SubmissionSlotRole | null;
  setDeleteTargetRole: (role: SubmissionSlotRole | null) => void;
  ocrTasksRef: RefObject<OcrTaskRegistry | null>;
  slots: Record<SubmissionSlotRole, SlotViewState>;
  blobUrlsRef: RefObject<Set<string>>;
  updateSlotsState: (
    updater:
      | Record<SubmissionSlotRole, SlotViewState>
      | ((current: Record<SubmissionSlotRole, SlotViewState>) => Record<SubmissionSlotRole, SlotViewState>),
  ) => void;
  isAppealDialogOpen: boolean;
  setIsAppealDialogOpen: (
    next: boolean | ((current: boolean) => boolean),
  ) => void;
  isAppealSubmitting: boolean;
  meta: FormMetaState;
  appealReason: string;
  setAppealReason: (next: string | ((current: string) => string)) => void;
  handleConfirmAppeal: () => void;
}

export function FormV2Dialogs({
  deleteTargetRole,
  setDeleteTargetRole,
  ocrTasksRef,
  slots,
  blobUrlsRef,
  updateSlotsState,
  isAppealDialogOpen,
  setIsAppealDialogOpen,
  isAppealSubmitting,
  meta,
  appealReason,
  setAppealReason,
  handleConfirmAppeal,
}: FormV2DialogsProps) {
  return (
    <>
      {/* 删除确认弹窗 */}
      <Dialog
        open={deleteTargetRole !== null}
        onOpenChange={(open) => !open && setDeleteTargetRole(null)}
      >
        <DialogContent className="max-w-md rounded-2xl border border-[#E2E2DF] bg-white p-0 shadow-claude-dialog">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle>确认删除此截图</DialogTitle>
            <DialogDescription>
              删除后需要重新上传并识别该槽位截图。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="px-6 pb-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteTargetRole(null)}
            >
              取消
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                if (!deleteTargetRole) return;
                ocrTasksRef.current?.cancel(deleteTargetRole);
                const targetSlot = slots[deleteTargetRole];
                if (
                  targetSlot.previewUrl &&
                  targetSlot.previewUrl.startsWith("blob:")
                ) {
                  URL.revokeObjectURL(targetSlot.previewUrl);
                  blobUrlsRef.current.delete(targetSlot.previewUrl);
                }
                updateSlotsState((current) => ({
                  ...current,
                  [deleteTargetRole]: {
                    ...createEditableSlots()[deleteTargetRole],
                  },
                }));
                setDeleteTargetRole(null);
              }}
            >
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 补交申请弹窗 */}
      <Dialog
        open={isAppealDialogOpen}
        onOpenChange={(open) => {
          if (!isAppealSubmitting) setIsAppealDialogOpen(open);
        }}
      >
        <DialogContent className="max-w-md rounded-2xl border border-[#E2E2DF] bg-white p-6 shadow-claude-dialog">
          <DialogHeader>
            <DialogTitle>申请补交历史数据</DialogTitle>
            <DialogDescription className="text-[12px] text-[#78716C] leading-relaxed pt-1">
              当前作品记录日期（{meta.bizDate}）已超过 72 小时。提交申请时会一并保存当前填报内容，审批通过后点击通知里的“去上传数据”即可自动完成提交。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5 py-3">
            <Label htmlFor="appeal-reason" className="text-[12px] text-[#78716C]">补交原因</Label>
            <textarea
              id="appeal-reason"
              value={appealReason}
              onChange={(e) => setAppealReason(e.target.value)}
              maxLength={1000}
              rows={3}
              className="w-full resize-none rounded-md border border-[#E2E2DF] bg-white p-2.5 text-[13px] text-[#1F1E1D] shadow-input placeholder:text-[#A8A29E] outline-none focus-visible:border-[#78716C] focus-visible:ring-1 focus-visible:ring-[#141413]/10"
              placeholder="请输入补交原因（最多 1000 字）"
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsAppealDialogOpen(false)}
              disabled={isAppealSubmitting}
            >
              取消
            </Button>
            <Button
              type="button"
              variant="default"
              onClick={handleConfirmAppeal}
              disabled={isAppealSubmitting || !appealReason.trim()}
            >
              {isAppealSubmitting ? "正在提交..." : "确认提交申请"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
