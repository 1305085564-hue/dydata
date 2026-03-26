"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  yesterday: "昨日豁免",
  range: "多日豁免",
  permanent: "永久豁免",
};

const SELECTABLE_MODES: GrantMode[] = ["yesterday", "range"];

interface Props {
  hasPending: boolean;
}

export function 申请豁免弹窗({ hasPending }: Props) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<GrantMode>("yesterday");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleOpen() {
    if (hasPending) return;
    setMode("yesterday");
    setStartDate("");
    setEndDate("");
    setReason("");
    setOpen(true);
  }

  function handleSubmit() {
    if (!reason.trim()) {
      feedbackToast.error("请填写申请原因");
      return;
    }

    if (mode === "range") {
      if (!startDate || !endDate) {
        feedbackToast.error("请填写开始和结束日期");
        return;
      }
      if (startDate > endDate) {
        feedbackToast.error("开始日期不能晚于结束日期");
        return;
      }
      const days = Math.floor((new Date(`${endDate}T00:00:00.000Z`).getTime() - new Date(`${startDate}T00:00:00.000Z`).getTime()) / 86400000) + 1;
      if (days < 2) {
        feedbackToast.error("多日豁免至少选择2天");
        return;
      }
    }

    startTransition(async () => {
      const result = await submitExemptionRequest({ mode, reason: reason.trim(), startDate, endDate });
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

            {mode === "range" && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <p className="text-sm font-medium">开始日期</p>
                  <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <p className="text-sm font-medium">结束日期</p>
                  <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                </div>
              </div>
            )}

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
