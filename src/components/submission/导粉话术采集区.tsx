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
            <div className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-[#D97757]" />

            <div className="mb-4 flex items-center gap-2">
              <h3 className="text-sm font-medium text-zinc-900">导粉话术</h3>
              <span className="text-[10px] uppercase tracking-[0.25em] text-zinc-400">
                required
              </span>
            </div>

            <div
              className={cn(
                "rounded-xl border transition-colors",
                showError
                  ? "border-[#FECDCA] bg-[#FEF3F2]/60"
                  : "border-zinc-200 bg-white"
              )}
            >
              <textarea
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder="粘贴本条视频中使用的导粉话术文案"
                rows={4}
                className={cn(
                  "w-full resize-none rounded-xl border-0 bg-transparent px-4 py-3",
                  "text-sm leading-7 tracking-wide text-zinc-950 placeholder:text-zinc-400",
                  "outline-none focus:ring-1 focus:ring-zinc-950/10"
                )}
              />

              {/* Action bar slot for future extensions */}
              {children && (
                <div className="border-t border-dashed border-zinc-100 px-4 py-2">
                  {children}
                </div>
              )}
            </div>

            {showError && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-2 text-xs font-medium text-[#B42318]"
              >
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
