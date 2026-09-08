"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

interface WriterCertificationButtonProps {
  userId: string;
  certified: boolean;
  certifiedByName?: string | null;
  canCertify?: boolean;
}

export function WriterCertificationButton({
  userId,
  certified,
  certifiedByName,
  canCertify = true,
}: WriterCertificationButtonProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [refreshing, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const resetTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    };
  }, []);

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
    setConfirmingCancel(false);
    try {
      const response = await fetch("/api/admin/collaboration/writer-certification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, certified: targetState }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "认证状态保存失败");
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
      if (confirmingCancel) {
        if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
        void handleToggle(false);
      } else {
        setConfirmingCancel(true);
        resetTimerRef.current = setTimeout(() => {
          setConfirmingCancel(false);
        }, 3000);
      }
    } else {
      void handleToggle(true);
    }
  }

  const isBusy = saving || refreshing;
  const certifiedLabel = certifiedByName ? `${certifiedByName}认证` : "已认证";

  return (
    <span className="inline-flex flex-col items-end gap-0.5">
      <button
        type="button"
        disabled={isBusy}
        onClick={handleClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => {
          setIsHovered(false);
          if (confirmingCancel) {
            setConfirmingCancel(false);
            if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
          }
        }}
        title={certified ? "点击取消文案认证" : "点击认证为文案人员"}
        className={`h-6 px-2 text-[12px] font-medium rounded-md transition-all duration-150 cursor-pointer active:scale-[0.99] active:duration-120 flex items-center justify-center gap-1 tabular-nums ${
          certified
            ? confirmingCancel
              ? "bg-[#C0685C]/15 text-[#C0685C] border border-[#C0685C]/30"
              : isHovered
                ? "bg-[#C0685C]/10 text-[#C0685C]"
                : "bg-[#F5F3EE] text-[#57534E] hover:bg-[#ECE7DE]/60"
            : isHovered
              ? "bg-[#F5F3EE] text-[#1C1917] border border-[#ECE7DE]"
              : "bg-white/80 text-[#78716C] border border-[#ECE7DE]/80 hover:text-[#1C1917] hover:bg-[#F5F3EE]"
        }`}
      >
        {isBusy ? (
          <>
            <Loader2 className="size-3 animate-spin text-current opacity-70" />
            <span>保存中</span>
          </>
        ) : certified ? (
          confirmingCancel ? (
            "确认取消？"
          ) : isHovered ? (
            "取消认证"
          ) : (
            certifiedLabel
          )
        ) : isHovered ? (
          "认证文案岗"
        ) : (
          "未认证"
        )}
      </button>
      {error && <span role="alert" className="text-[11px] text-[#C0685C]">{error}</span>}
    </span>
  );
}
