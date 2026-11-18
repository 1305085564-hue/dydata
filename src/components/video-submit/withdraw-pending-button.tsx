"use client";

import { useState } from "react";


/**
 * 「撤回申请」：两步确认（点一次变「确认撤回」，再点才执行），避免误触；
 * 结果由调用方的 onWithdraw 处理（刷新列表、提示），这里只管按钮状态。
 */
export function WithdrawPendingButton({
  onWithdraw,
  label = "撤回申请",
  className,
}: {
  onWithdraw: () => Promise<unknown> | void;
  label?: string;
  className?: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      await onWithdraw();
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => (confirming ? void run() : setConfirming(true))}
      onBlur={() => !busy && setConfirming(false)}
      className={className ?? "cursor-pointer select-none text-[12px] text-[#78716C] underline-offset-2 transition-colors hover:text-[#141413] hover:underline disabled:cursor-not-allowed disabled:opacity-60"}
    >
      {busy ? "撤回中…" : confirming ? "确认撤回" : label}
    </button>
  );
}
