"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { ScreenshotImage } from "@/components/screenshot/screenshot-image";

/**
 * 同屏免遮挡画中画检视器（硬伤 1 落地）：
 * - 无全局遮罩，桌面端停靠视口左上，移动端底部半屏停靠，右侧表单输入框全程可用；
 * - Esc / 关闭按钮 / 点击非交互空白区收起，收起后焦点归还触发元素；
 * - 点击 input/textarea/select/label/button/a 等交互元素不视为"图外"，绝不误关。
 */
export function ScreenshotInspector({
  url,
  label,
  onClose,
  onReturnFocus,
  extraActions,
  testId = "pip-inspector",
}: {
  url: string;
  label: string;
  onClose: () => void;
  onReturnFocus: () => void;
  extraActions?: ReactNode;
  testId?: string;
}) {
  const inspectorRef = useRef<HTMLDivElement>(null);
  const callbacksRef = useRef({ onClose, onReturnFocus });
  useEffect(() => {
    callbacksRef.current = { onClose, onReturnFocus };
  });

  useEffect(() => {
    function closeAndRestore() {
      callbacksRef.current.onClose();
      callbacksRef.current.onReturnFocus();
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        closeAndRestore();
      }
    }

    function handleClickOutside(e: MouseEvent) {
      if (!inspectorRef.current) return;
      if (inspectorRef.current.contains(e.target as Node)) return;
      const target = e.target as HTMLElement | null;
      if (!target) return;
      // 点击交互元素（表单输入、按钮、链接等）不判定为外部点击，检视器保持打开
      if (
        target.closest(
          "input, textarea, select, label, button, a, [role='combobox'], [role='listbox']",
        )
      ) {
        return;
      }
      closeAndRestore();
    }

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const closeAndRestore = () => {
    onClose();
    onReturnFocus();
  };

  return (
    <div
      ref={inspectorRef}
      data-testid={testId}
      role="region"
      aria-label="截图同屏对照视窗"
      className="fixed inset-x-3 bottom-3 top-auto z-40 h-[52vh] max-h-[calc(100dvh-4rem)] md:inset-auto md:top-20 md:left-6 md:w-[410px] md:h-auto md:max-h-[calc(100dvh-6rem)] rounded-2xl md:rounded-xl border border-[#E2E2DF] bg-white shadow-claude-float ring-1 ring-[#141413]/5 overflow-hidden flex flex-col animate-in fade-in slide-in-from-bottom md:slide-in-from-top-2 duration-150"
    >
      {/* 顶栏：标题 + 附加操作 + 关闭按钮 */}
      <div className="flex items-center justify-between border-b border-[#E2E2DF] bg-[#F1F1F0] px-3.5 py-2.5 select-none">
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-[#D97757]" />
          <span className="text-[12px] text-[#141413]">{label}</span>
        </div>

        <div className="flex items-center gap-1.5">
          {extraActions}

          <button
            type="button"
            onClick={closeAndRestore}
            className="flex size-6 items-center justify-center rounded-md text-[#78716C] hover:bg-[#EBEBE9] hover:text-[#141413] transition-colors cursor-pointer"
            title="关闭检视器 (Esc)"
            aria-label="关闭同屏检视器"
          >
            <X className="size-3.5 stroke-[2]" />
          </button>
        </div>
      </div>

      {/* 原图滚动区：高保真同屏展示 */}
      <div className="relative flex-1 overflow-auto bg-[#141413]/[0.02] p-2 sm:p-3 flex items-center justify-center min-h-[200px]">
        <ScreenshotImage
          src={url}
          alt="放大预览"
          variant="stage"
          className="max-h-[calc(100dvh-12rem)] max-w-full w-auto h-auto rounded-lg object-contain shadow-xs select-none"
          placeholderClassName="min-h-[200px] w-[min(100%,420px)]"
        />
      </div>

      {/* 底部微提示：明确指引右侧输入框可用 */}
      <div className="border-t border-[#E2E2DF]/60 bg-[#FCFCFB] px-3 py-1.5 text-[12px] text-[#78716C] font-sans flex items-center justify-between">
        <span>右侧输入框可直接敲字，按 Esc 关闭</span>
        <button
          type="button"
          onClick={closeAndRestore}
          className="text-[12px] text-[#78716C] hover:text-[#141413] underline cursor-pointer"
        >
          完成核对
        </button>
      </div>
    </div>
  );
}
