"use client";

import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface ScriptCaptureSectionProps {
  visible: boolean;
  value: string;
  onChange: (value: string) => void;
  hasAttemptedSubmit?: boolean;
  /** Slot for future extensions (tags, AI precheck, screenshot upload) */
  children?: React.ReactNode;
}

export function ScriptCaptureSection({
  visible,
  value,
  onChange,
  hasAttemptedSubmit,
  children,
}: ScriptCaptureSectionProps) {
  const isEmpty = !value.trim();
  const showError = hasAttemptedSubmit && visible && isEmpty;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
          className="overflow-hidden"
        >
          <div className="relative mt-6 pl-5">
            <div className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-full bg-[#D97757]" />

            <div className="mb-4 flex items-center gap-2">
              <h3 className="text-[13px] font-semibold text-zinc-800">导粉话术</h3>
              <span className="text-[10px] uppercase tracking-[0.25em] font-medium text-zinc-400">
                required
              </span>
            </div>

            <div
              className={cn(
                "rounded-xl border transition-[background-color,border-color,box-shadow] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]",
                showError
                  ? "border-[#C9604D]/40 bg-zinc-50"
                  : "border-zinc-200 bg-white",
              )}
            >
              <textarea
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder="粘贴本条视频中使用的导粉话术文案"
                rows={4}
                className={cn(
                  "w-full resize-none rounded-xl border-0 bg-transparent px-4 py-3",
                  "text-[13px] leading-[1.7] tracking-[0.005em] text-zinc-800 placeholder:text-zinc-400",
                  "outline-none focus-visible:ring-1 focus-visible:ring-zinc-950/5",
                )}
              />

              {/* Action bar slot for future extensions */}
              {children && (
                <div className="border-t border-dashed border-zinc-200 px-4 py-2">
                  {children}
                </div>
              )}
            </div>

            {showError && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-2 flex items-center gap-2 text-[12px] font-medium text-[#C9604D]"
              >
                <span className="inline-block h-2 w-2 rounded-full bg-[#C9604D] ring-1 ring-white" />
                导粉数 &gt; 0 时，话术文案为必填
              </motion.p>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export { ScriptCaptureSection as 导粉话术采集区 };
