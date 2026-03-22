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
  "temporary-single": "临时单天",
  "temporary-range": "临时范围",
};

export function ExemptionDialog({ open, profile, onOpenChange }: ExemptionDialogProps) {
  const [isPending, startTransition] = useTransition();
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showPermanentConfirm, setShowPermanentConfirm] = useState(false);

  const initialValues = useMemo<ExemptionFormValues>(() => {
    if (!profile) {
      return {
        userId: "",
        mode: "temporary-single",
        reason: "",
      };
    }

    const derived = deriveExemptionFormValues(profile);
    return {
      ...derived,
      mode: derived.mode === "none" ? "temporary-single" : derived.mode,
      reason: derived.reason ?? "",
    };
  }, [profile]);

  const [formValues, setFormValues] = useState<ExemptionFormValues>(initialValues);
  const [rangeDays, setRangeDays] = useState<3 | 4 | 5>(3);

  useEffect(() => {
    setFormValues(initialValues);
  }, [initialValues]);

  useEffect(() => {
    if (!open) {
      setShowClearConfirm(false);
      setShowPermanentConfirm(false);
      setRangeDays(3);
    }
  }, [open]);

  function updateField<K extends keyof ExemptionFormValues>(key: K, value: ExemptionFormValues[K]) {
    setFormValues((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function handleModeChange(value: string | null) {
    if (!value) return;

    const mode = value as ExemptionFormValues["mode"];
    setRangeDays(3);
    setFormValues((current) => ({
      userId: current.userId,
      mode,
      reason: current.reason ?? "",
      date: mode === "temporary-single" ? current.date ?? current.startDate ?? current.endDate ?? "" : undefined,
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
      let values = { ...formValues, userId: profile.id };
      if (formValues.mode === "temporary-range") {
        const today = new Date();
        const start = today.toISOString().slice(0, 10);
        const end = new Date(today.getTime() + (rangeDays - 1) * 86400000).toISOString().slice(0, 10);
        values = { ...values, startDate: start, endDate: end };
      }
      const result = await updateExemption(values);

      if (result.error) {
        feedbackToast.error(result.error);
        return;
      }

      feedbackToast.success(`${profile.name}已更新为${MODE_LABELS[formValues.mode]}`);
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
      <DialogContent className="sm:max-w-md" showCloseButton={!isPending}>
        <DialogHeader>
          <DialogTitle>设置豁免</DialogTitle>
          <DialogDescription>
            {profile ? `为 ${profile.name} 设置正常、永久豁免或临时豁免。` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">豁免类型</label>
            <Select value={formValues.mode} onValueChange={handleModeChange} disabled={isPending}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">正常</SelectItem>
                <SelectItem value="permanent">永久豁免</SelectItem>
                <SelectItem value="temporary-single">临时单天</SelectItem>
                <SelectItem value="temporary-range">临时范围</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {formValues.mode === "temporary-single" && (
            <div className="space-y-2">
              <label className="text-sm font-medium">日期</label>
              <Input
                type="date"
                value={formValues.date ?? ""}
                onChange={(e) => updateField("date", e.target.value)}
                disabled={isPending}
              />
            </div>
          )}

          {formValues.mode === "temporary-range" && (
            <div className="space-y-2">
              <label className="text-sm font-medium">豁免天数</label>
              <div className="flex gap-2">
                {([3, 4, 5] as const).map((n) => (
                  <button
                    key={n}
                    type="button"
                    disabled={isPending}
                    onClick={() => setRangeDays(n)}
                    className="flex-1 rounded-lg border py-2 text-sm font-medium transition-colors disabled:opacity-50"
                    style={rangeDays === n ? { background: "#007AFF", borderColor: "#007AFF", color: "#fff" } : {}}
                  >
                    {n}天
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium">原因</label>
            <textarea
              value={formValues.reason ?? ""}
              onChange={(e) => updateField("reason", e.target.value)}
              disabled={isPending}
              rows={3}
              className="flex min-h-20 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50"
              placeholder="可选，建议写明原因"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <div>
            {profile && profile.exempt_type && (
              <Button variant="outline" onClick={handleClearClick} disabled={isPending}>
                清除豁免
              </Button>
            )}
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
              取消
            </Button>
            <Button onClick={handleSaveClick} disabled={isPending}>
              保存
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
      <ConfirmDialog
        open={showClearConfirm}
        title="确认清除豁免"
        description={profile ? `确定清除 ${profile.name} 的豁免状态并恢复为正常吗？` : ""}
        confirmText="确认清除"
        destructive
        loading={isPending}
        onConfirm={clearCurrentExemption}
        onOpenChange={setShowClearConfirm}
      />
      <ConfirmDialog
        open={showPermanentConfirm}
        title="确认设置永久豁免"
        description={profile ? `确定将 ${profile.name} 设置为永久豁免吗？` : ""}
        confirmText="确认设置"
        loading={isPending}
        onConfirm={submitExemption}
        onOpenChange={setShowPermanentConfirm}
      />
    </Dialog>
  );
}
