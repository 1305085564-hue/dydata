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
          <div className="relative mt-8 pl-4">
            <div className="absolute left-0 top-0 bottom-0 w-[2px] rounded-full bg-[#D97757]" />

            <div className="mb-3 flex items-center gap-2">
              <h3 className="text-[13.5px] font-semibold text-[#1C1917]">
                导粉话术 · 灵感手记
              </h3>
              <span className="text-[11px] px-1.5 py-0.5 rounded bg-[#F5F3EE] border border-[#ECE7DE]/60 font-normal text-[#78716C]">
                必填
              </span>
            </div>

            <div
              className={cn(
                "rounded-2xl border transition-[background-color,border-color,box-shadow] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]",
                showError
                  ? "border-[#C9604D]/40 bg-[#FBF9F5]"
                  : "border-[#E5E0D6] bg-white/50 focus-within:bg-white focus-within:border-[#78716C]",
              )}
            >
              <textarea
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder="在此记录本期视频中打动人心、促成关注转化的核心话术或互动文案..."
                rows={4}
                aria-invalid={showError ? "true" : "false"}
                aria-describedby={showError ? "script_capture_error" : undefined}
                className={cn(
                  "w-full resize-none rounded-2xl border-0 bg-transparent px-4 py-3",
                  "text-[13px] leading-[1.7] tracking-[0.005em] text-[#1C1917] placeholder:text-[#78716C]/70",
                  "outline-none focus-visible:ring-1 focus-visible:ring-[#D97757]/20",
                )}
              />

              {/* Action bar slot for future extensions */}
              {children && (
                <div className="border-t border-dashed border-[#E5E0D6] px-4 py-2">
                  {children}
                </div>
              )}
            </div>

            {showError && (
              <motion.p
                id="script_capture_error"
                role="alert"
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
