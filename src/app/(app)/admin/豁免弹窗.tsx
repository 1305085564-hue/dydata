"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import {
  clearExemption,
  updateExemption,
} from "./actions";
import {
  deriveExemptionFormValues,
  type ExemptionFormValues,
  type ExemptionProfileLike,
} from "@/lib/豁免";

type DialogProfile = ExemptionProfileLike & {
  name: string;
};

interface ExemptionDialogProps {
  open: boolean;
  profile: DialogProfile | null;
  onOpenChange: (open: boolean) => void;
}

const MODE_LABELS: Record<ExemptionFormValues["mode"], string> = {
  none: "正常",
  permanent: "永久豁免",
  yesterday: "昨日豁免",
  range: "多日豁免",
};

const CATEGORY_LABELS: Record<ExemptionFormValues["category"], string> = {
  waive: "免交",
  leave: "请假",
};

export function ExemptionDialog({
  open,
  profile,
  onOpenChange,
}: ExemptionDialogProps) {
  const [isPending, startTransition] = useTransition();
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showPermanentConfirm, setShowPermanentConfirm] = useState(false);
  const [fallbackYesterday] = useState(() =>
    new Date(Date.now() - 86400000).toISOString().slice(0, 10),
  );

  const initialValues = useMemo<ExemptionFormValues>(() => {
    if (!profile) {
      return {
        userId: "",
        mode: "yesterday",
        category: "waive",
        reason: "",
      };
    }

    const derived = deriveExemptionFormValues(profile);
    return {
      ...derived,
      mode: derived.mode === "none" ? "yesterday" : derived.mode,
      reason: derived.reason ?? "",
    };
  }, [profile]);

  const [formValues, setFormValues] =
    useState<ExemptionFormValues>(initialValues);

  useEffect(() => {
    setFormValues(initialValues);
  }, [initialValues]);

  useEffect(() => {
    if (!open) {
      setShowClearConfirm(false);
      setShowPermanentConfirm(false);
    }
  }, [open]);

  function updateField<K extends keyof ExemptionFormValues>(
    key: K,
    value: ExemptionFormValues[K],
  ) {
    setFormValues((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function handleModeChange(value: string | null) {
    if (!value) return;

    const mode = value as ExemptionFormValues["mode"];
    setFormValues((current) => ({
      userId: current.userId,
      mode,
      category: current.category,
      reason: current.reason ?? "",
      date:
        mode === "yesterday"
          ? current.date ?? current.startDate ?? current.endDate ?? ""
          : undefined,
      startDate:
        mode === "range" ? current.startDate ?? current.date ?? "" : undefined,
      endDate:
        mode === "range" ? current.endDate ?? current.date ?? "" : undefined,
    }));
  }

  function closeDialog() {
    if (!isPending) {
      onOpenChange(false);
    }
  }

  function submitExemption() {
    if (!profile) return;

    startTransition(async () => {
      const values = { ...formValues, userId: profile.id };
      const result = await updateExemption(values);

      if (result.error) {
        feedbackToast.error(result.error);
        return;
      }

      feedbackToast.success(
        `${profile.name}已更新为${CATEGORY_LABELS[formValues.category]} ${MODE_LABELS[formValues.mode]}`,
      );
      onOpenChange(false);
    });
  }

  function clearCurrentExemption() {
    if (!profile) return;

    startTransition(async () => {
      const result = await clearExemption(profile.id);

      if (result.error) {
        feedbackToast.error(result.error);
        return;
      }

      feedbackToast.success(`已恢复${profile.name}为正常状态`);
      onOpenChange(false);
    });
  }

  function handleClearClick() {
    setShowClearConfirm(true);
  }

  function handleSaveClick() {
    if (formValues.mode === "permanent") {
      setShowPermanentConfirm(true);
      return;
    }
    submitExemption();
  }

  return (
    <Dialog open={open} onOpenChange={closeDialog}>
      <DialogContent
        className="sm:max-w-md rounded-2xl border border-zinc-200 bg-white shadow-sm"
        showCloseButton={!isPending}
      >
        <DialogHeader>
          <DialogTitle>设置豁免</DialogTitle>
          <DialogDescription>
            {profile
              ? `为 ${profile.name} 设置正常、昨日豁免、多日豁免或永久豁免。`
              : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-[13px] font-medium text-zinc-800">申请语义</label>
            <Select
              value={formValues.category}
              onValueChange={(value) =>
                updateField(
                  "category",
                  value as ExemptionFormValues["category"],
                )
              }
              disabled={isPending}
            >
              <SelectTrigger className="w-full rounded-lg border-transparent bg-zinc-50 focus:bg-white focus:border-zinc-200 focus:shadow-sm focus:ring-1 focus:ring-zinc-950/5 transition-[background-color,border-color,box-shadow] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]">
                <SelectValue>
                  {CATEGORY_LABELS[formValues.category]}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="waive">免交</SelectItem>
                <SelectItem value="leave">请假</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-[13px] font-medium text-zinc-800">日期模式</label>
            <Select
              value={formValues.mode}
              onValueChange={handleModeChange}
              disabled={isPending}
            >
              <SelectTrigger className="w-full rounded-lg border-transparent bg-zinc-50 focus:bg-white focus:border-zinc-200 focus:shadow-sm focus:ring-1 focus:ring-zinc-950/5 transition-[background-color,border-color,box-shadow] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]">
                <SelectValue>{MODE_LABELS[formValues.mode]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">正常</SelectItem>
                <SelectItem value="permanent">永久豁免</SelectItem>
                <SelectItem value="yesterday">昨日豁免</SelectItem>
                <SelectItem value="range">多日豁免</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {formValues.mode === "yesterday" && (
            <div className="space-y-2">
              <label className="text-[13px] font-medium text-zinc-800">豁免日期</label>
              <Input
                type="date"
                value={formValues.date ?? fallbackYesterday}
                onChange={(e) => updateField("date", e.target.value)}
                disabled={isPending}
                className="rounded-lg border-transparent bg-zinc-50 focus:bg-white focus:border-zinc-200 focus:shadow-sm focus:ring-1 focus:ring-zinc-950/5 transition-[background-color,border-color,box-shadow] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]"
              />
            </div>
          )}

          {formValues.mode === "range" && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-[13px] font-medium text-zinc-800">开始日期</label>
                <Input
                  type="date"
                  value={formValues.startDate ?? ""}
                  onChange={(e) => updateField("startDate", e.target.value)}
                  disabled={isPending}
                  className="rounded-lg border-transparent bg-zinc-50 focus:bg-white focus:border-zinc-200 focus:shadow-sm focus:ring-1 focus:ring-zinc-950/5 transition-[background-color,border-color,box-shadow] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[13px] font-medium text-zinc-800">结束日期</label>
                <Input
                  type="date"
                  value={formValues.endDate ?? ""}
                  onChange={(e) => updateField("endDate", e.target.value)}
                  disabled={isPending}
                  className="rounded-lg border-transparent bg-zinc-50 focus:bg-white focus:border-zinc-200 focus:shadow-sm focus:ring-1 focus:ring-zinc-950/5 transition-[background-color,border-color,box-shadow] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]"
                />
              </div>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-[13px] font-medium text-zinc-800">原因</label>
            <textarea
              value={formValues.reason ?? ""}
              onChange={(e) => updateField("reason", e.target.value)}
              disabled={isPending}
              rows={3}
              className="flex min-h-20 w-full rounded-lg border border-transparent bg-zinc-50 px-3 py-2 text-[13px] outline-none transition-[background-color,border-color,box-shadow] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] placeholder:text-zinc-400 focus:bg-white focus:border-zinc-200 focus:shadow-sm focus:ring-1 focus:ring-zinc-950/5 disabled:cursor-not-allowed disabled:bg-zinc-50 disabled:opacity-50"
              placeholder="可选，建议写明原因"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <div>
            {profile && profile.exempt_type && (
              <Button
                variant="outline"
                onClick={handleClearClick}
                disabled={isPending}
                className="rounded-[10px] border-zinc-200 text-zinc-700 hover:bg-zinc-50"
              >
                清除豁免
              </Button>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
              className="rounded-[10px] border-zinc-200 text-zinc-700 hover:bg-zinc-50"
            >
              取消
            </Button>
            <Button
              onClick={handleSaveClick}
              disabled={isPending}
              className="rounded-[10px] bg-[#D97757] text-white hover:bg-[#C96442]"
            >
              保存
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
      <ConfirmDialog
        open={showClearConfirm}
        title="确认清除豁免"
        description={
          profile ? `确定清除 ${profile.name} 的豁免状态并恢复为正常吗？` : ""
        }
        confirmText="确认清除"
        destructive
        loading={isPending}
        onConfirm={clearCurrentExemption}
        onOpenChange={setShowClearConfirm}
      />
      <ConfirmDialog
        open={showPermanentConfirm}
        title="确认设置永久豁免"
        description={
          profile ? `确定将 ${profile.name} 设置为永久豁免吗？` : ""
        }
        confirmText="确认设置"
        loading={isPending}
        onConfirm={submitExemption}
        onOpenChange={setShowPermanentConfirm}
      />
    </Dialog>
  );
}
