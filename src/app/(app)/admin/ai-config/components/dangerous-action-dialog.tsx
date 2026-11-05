"use client";

import { useState } from "react";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import { AI_CONFIG_MESSAGES } from "@/lib/ai-config/presentation";
import type { SharedAddressImpact } from "@/lib/ai-config/channel-address";

export type ImpactConfirmationState = {
  type: "impact";
  affectedBusinesses: Array<{ key: string; label: string }>;
  onConfirm: () => Promise<void> | void;
} | {
  type: "shared_address";
  impact: SharedAddressImpact;
  onConfirm: () => Promise<void> | void;
} | null;

export type DangerousActionDialogProps = {
  state: ImpactConfirmationState;
  onClose: () => void;
};

export function DangerousActionDialog({ state, onClose }: DangerousActionDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);

  if (!state) return null;

  const handleConfirm = async () => {
    setIsSubmitting(true);
    try {
      await state.onConfirm();
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  if (state.type === "shared_address") {
    const keyLabels = state.impact.affectedKeys.map((k) => k.label).filter(Boolean);
    const keyNames = keyLabels.length > 0 ? keyLabels.join("、") : `共 ${state.impact.affectedKeyCount} 条渠道`;
    const message = AI_CONFIG_MESSAGES["operation.shared_address"].replace(
      "{count}",
      String(state.impact.affectedKeyCount)
    );

    return (
      <Dialog open={true} onOpenChange={(open) => !open && !isSubmitting && onClose()}>
        <DialogContent className="max-w-md rounded-2xl border border-[#E2E2DF] bg-white p-6 shadow-claude-dialog">
          <DialogHeader className="gap-2 border-b border-[#E2E2DF]/60 pb-3">
            <div className="flex items-center gap-2">
              <div className="flex size-7 items-center justify-center rounded-xl bg-status-danger/[0.10] text-status-danger">
                <AlertTriangle className="size-4" />
              </div>
              <DialogTitle className="text-[20px] text-[#141413]">修改共享 API 地址确认</DialogTitle>
            </div>
            <p className="text-[12px] text-[#78716C] leading-relaxed">
              检测到多个渠道共用该接入点地址，修改将同步影响所有关联渠道。
            </p>
          </DialogHeader>

          <DialogBody className="space-y-3 py-3">
            <div className="rounded-xl border border-status-danger/30 bg-status-danger/[0.10] p-3 space-y-2 text-[12px]">
              <div className="flex items-center gap-2 text-status-danger-text text-[14px]">
                <span>{message}</span>
              </div>
              <div className="text-[12px] text-[#1F1E1D] pt-1">
                受影响渠道：<span className="font-mono text-[#141413]">{keyNames}</span>
              </div>
            </div>
          </DialogBody>

          <DialogFooter className="border-t border-[#E2E2DF]/60 pt-3">
            <Button
              variant="outline"
              size="s"
              disabled={isSubmitting}
              onClick={onClose}
              className="h-8 text-[12px] border-[#E2E2DF] text-[#1F1E1D]"
            >
              取消
            </Button>
            <Button
              size="s"
              disabled={isSubmitting}
              onClick={handleConfirm}
              className="h-8 text-[12px] bg-status-danger hover:bg-status-danger/90 text-white font-normal"
            >
              {isSubmitting ? "正在确认..." : "确认一起修改"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // 业务停摆确认
  return (
    <Dialog open={true} onOpenChange={(open) => !open && !isSubmitting && onClose()}>
      <DialogContent className="max-w-md rounded-2xl border border-[#E2E2DF] bg-white p-6 shadow-claude-dialog">
        <DialogHeader className="gap-2 border-b border-[#E2E2DF]/60 pb-3">
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-xl bg-status-danger/[0.10] text-status-danger">
              <AlertTriangle className="size-4" />
            </div>
            <DialogTitle className="text-[20px] text-[#141413]">
              {AI_CONFIG_MESSAGES["operation.confirm_impact"]}
            </DialogTitle>
          </div>
        </DialogHeader>

        <DialogBody className="space-y-3 py-3">
          <div className="rounded-xl border border-status-danger/30 bg-status-danger/[0.10] p-3 space-y-2 text-[12px]">
            <div className="text-[14px] text-status-danger-text">
              受影响的业务：
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              {state.affectedBusinesses.map((b) => (
                <span
                  key={b.key}
                  className="inline-flex items-center rounded-md bg-white/90 border border-status-danger/30 px-2 py-1 text-[12px] text-status-danger-text"
                >
                  {b.label}
                </span>
              ))}
            </div>
          </div>

          <div className="rounded-xl bg-[#F7F7F6] border border-[#E2E2DF] p-3 text-[12px] text-[#78716C] leading-relaxed">
            更稳的做法：先给这些业务换个模型，或者先接一条新渠道。
          </div>

          {/* 技术详情默认折叠 */}
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
              className="flex items-center gap-1 text-[12px] text-[#78716C] hover:text-[#141413] transition-colors"
            >
              {showTechnicalDetails ? (
                <ChevronDown className="size-3.5" />
              ) : (
                <ChevronRight className="size-3.5" />
              )}
              <span>技术信息与受影响键名</span>
            </button>
            {showTechnicalDetails && (
              <div className="mt-2 rounded-xl bg-[#F1F1F0] p-3 font-mono text-[12px] text-[#78716C] space-y-1 overflow-x-auto">
                <div>业务键名：</div>
                {state.affectedBusinesses.map((b) => (
                  <div key={b.key} className="pl-2 text-[#1F1E1D]">
                    • {b.key} ({b.label})
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogBody>

        <DialogFooter className="border-t border-[#E2E2DF]/60 pt-3">
          <Button
            variant="outline"
            size="s"
            disabled={isSubmitting}
            onClick={onClose}
            className="h-8 text-[12px] border-[#E2E2DF] text-[#1F1E1D]"
          >
            取消
          </Button>
          <Button
            size="s"
            disabled={isSubmitting}
            onClick={handleConfirm}
            className="h-8 text-[12px] bg-status-danger hover:bg-status-danger/90 text-white font-normal"
          >
            {isSubmitting ? "正在执行..." : "确认停用 / 移除"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
