"use client";

import { useState } from "react";

/** 就地写拒绝原因：Enter 确认，Esc 收起；必填时空着不能确认 */
export function RejectReason({
  hint,
  required = false,
  placeholder,
  confirmLabel = "确认拒绝",
  onConfirm,
  onCancel,
}: {
  hint: string;
  required?: boolean;
  placeholder?: string;
  confirmLabel?: string;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState("");
  const trimmed = reason.trim();
  const canConfirm = !required || trimmed.length > 0;
  const inputPlaceholder = placeholder ?? (required ? "拒绝原因（必填，会发给成员）" : "拒绝原因（可不填）");

  return (
    <div className="mt-3 space-y-1" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-2">
        <input
          autoFocus
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && canConfirm) {
              e.preventDefault();
              onConfirm(trimmed);
            } else if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              onCancel();
            }
          }}
          placeholder={inputPlaceholder}
          aria-label="拒绝原因"
          className="h-8 min-w-0 flex-1 rounded-md border border-[#E2E2DF] bg-white px-3 text-[14px] text-[#1F1E1D] shadow-input outline-none placeholder:text-[#A8A29E] focus-visible:border-[#1F1E1D] focus-visible:ring-2 focus-visible:ring-[#1F1E1D]/10"
        />
        <button
          type="button"
          onClick={onCancel}
          className="h-7 shrink-0 cursor-pointer rounded-md px-3 text-[14px] text-[#78716C] transition-colors hover:bg-[#EBEBE9] hover:text-[#141413]"
        >
          取消
        </button>
        <button
          type="button"
          disabled={!canConfirm}
          onClick={() => onConfirm(trimmed)}
          className="h-7 shrink-0 cursor-pointer rounded-md border border-[#E2E2DF] bg-white px-3 text-[14px] text-[#1F1E1D] shadow-input transition-colors hover:bg-[#EBEBE9] disabled:cursor-not-allowed disabled:text-[#A8A29E]"
        >
          {confirmLabel}
        </button>
      </div>
      <p className="text-[12px] text-[#78716C]">{hint}</p>
    </div>
  );
}
