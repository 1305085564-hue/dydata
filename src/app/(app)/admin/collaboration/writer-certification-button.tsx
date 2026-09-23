"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Loader2 } from "lucide-react";
import { clearPersonDataCache } from "./person-data";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface WriterCertificationButtonProps {
  userId: string;
  certified: boolean;
  certifiedByName?: string | null;
  canCertify?: boolean;
  hasWork?: boolean;
}

export function WriterCertificationButton({
  userId,
  certified,
  certifiedByName,
  canCertify = true,
  hasWork = false,
}: WriterCertificationButtonProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [refreshing, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  if (!canCertify) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 text-[12px] text-[#78716C]">
        {certified ? (certifiedByName ? `${certifiedByName}认证` : "已认证") : "未认证"}
      </span>
    );
  }

  async function handleToggle(targetState: boolean) {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/collaboration/writer-certification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, certified: targetState }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "认证状态保存失败");
      clearPersonDataCache(userId);
      setDialogOpen(false);
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "认证状态保存失败");
    } finally {
      setSaving(false);
    }
  }

  function handleClick() {
    if (saving || refreshing) return;
    if (certified) {
      setDialogOpen(true);
    } else {
      void handleToggle(true);
    }
  }

  const isBusy = saving || refreshing;
  const certifiedLabel = certifiedByName ? `${certifiedByName}认证` : "已认证";

  return (
    <>
      <span className="inline-flex flex-col items-end gap-0.5">
        <button
          type="button"
          disabled={isBusy}
          onClick={handleClick}
          title={certified ? "点击取消文案认证" : "点击认证为文案人员"}
          className={`h-6 px-2 text-[12px] font-medium rounded-md transition-all duration-150 cursor-pointer active:scale-[0.99] active:duration-120 flex items-center justify-center gap-1 tabular-nums ${
            certified
              ? "bg-[#F1F1F0] text-[#57534E] hover:bg-[#EBEBE9] hover:text-[#1C1917]"
              : hasWork
                ? "bg-[#FAF4E8] text-[#8A6A2F] border border-[#B98A54]/30 hover:bg-[#FAF4E8]/80 hover:text-[#1C1917]"
                : "bg-white/80 text-[#78716C] border border-[#E2E2DF]/80 hover:text-[#1C1917] hover:bg-[#EBEBE9]"
          }`}
        >
          {isBusy ? (
            <>
              <Loader2 className="size-3 animate-spin text-current opacity-70" />
              <span>保存中</span>
            </>
          ) : certified ? (
            certifiedLabel
          ) : hasWork ? (
            "待认证"
          ) : (
            "未认证"
          )}
        </button>
        {error && <span role="alert" className="text-[11px] text-[#C0685C]">{error}</span>}
      </span>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[400px] p-5 space-y-4" showCloseButton={!isBusy}>
          <DialogHeader className="gap-1.5">
            <DialogTitle className="text-base font-medium text-[#1C1917]">
              取消文案认证
            </DialogTitle>
            <DialogDescription className="text-[13px] text-[#57534E]">
              确认取消该成员的文案岗位认证？
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-lg bg-[#B98A54]/10 border border-[#B98A54]/20 p-3 flex items-start gap-2.5 text-[12px] text-[#8A6A2F]">
            <AlertCircle className="size-4 shrink-0 mt-0.5 text-[#B98A54]" />
            <div className="space-y-1 leading-relaxed">
              <p className="font-medium text-[#1C1917]">取消后将影响当月绩效结算</p>
              <p className="text-[#78716C]">该成员的绩效条数将不再计入结算，已生效的月度绩效将被重置为未认证状态。</p>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="secondary"
              size="default"
              disabled={isBusy}
              onClick={() => setDialogOpen(false)}
            >
              保持认证
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="default"
              disabled={isBusy}
              onClick={() => void handleToggle(false)}
            >
              {isBusy ? "正在取消…" : "确认取消"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
