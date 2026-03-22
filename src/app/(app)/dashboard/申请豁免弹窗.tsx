"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { submitExemptionRequest } from "./actions";
import type { GrantMode } from "@/lib/豁免流程";

const MODE_LABELS: Record<GrantMode, string> = {
  single: "单日",
  "3days": "3天",
  "4days": "4天",
  "5days": "5天",
  permanent: "永久",
};

const SELECTABLE_MODES: GrantMode[] = ["single", "3days", "4days", "5days"];

interface Props {
  hasPending: boolean;
}

export function 申请豁免弹窗({ hasPending }: Props) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<GrantMode>("single");
  const [reason, setReason] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleOpen() {
    if (hasPending) return;
    setMode("single");
    setReason("");
    setOpen(true);
  }

  function handleSubmit() {
    if (!reason.trim()) {
      feedbackToast.error("请填写申请原因");
      return;
    }
    startTransition(async () => {
      const result = await submitExemptionRequest({ mode, reason: reason.trim() });
      if (result.error) {
        feedbackToast.error(result.error);
      } else {
        feedbackToast.success("申请已提交，等待管理员审批");
        setOpen(false);
      }
    });
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        disabled={hasPending}
        onClick={handleOpen}
        title={hasPending ? "申请审批中" : undefined}
      >
        {hasPending ? "申请审批中" : "申请豁免"}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>申请豁免填报</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <p className="text-sm font-medium">豁免类型</p>
              <Select value={mode} onValueChange={(v) => setMode(v as GrantMode)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SELECTABLE_MODES.map((m) => (
                    <SelectItem key={m} value={m}>
                      {MODE_LABELS[m]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <p className="text-sm font-medium">
                申请原因 <span className="text-destructive">*</span>
              </p>
              <textarea
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
                rows={3}
                maxLength={100}
                placeholder="请简述原因（最多100字）"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <p className="text-xs text-muted-foreground text-right">{reason.length}/100</p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
              取消
            </Button>
            <Button onClick={handleSubmit} disabled={isPending}>
              提交申请
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
