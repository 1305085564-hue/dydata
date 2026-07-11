"use client";

import { motion } from "framer-motion";
import { CheckCircle2 } from "lucide-react";

interface SubmissionSuccessCardProps {
  bizDate: string;
}

export function 提交成功卡({ bizDate }: SubmissionSuccessCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.92 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/12 px-4"
    >
      <div className="w-full max-w-md rounded-xl border border-stone-200 bg-white p-6 text-center">
        <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-[color:rgba(52,199,89,0.14)] text-[var(--color-success)]">
          <CheckCircle2 className="size-8" />
        </div>
        <h3 className="text-[24px] font-medium tracking-[-0.02em] text-[var(--color-text-primary)]">
          数据提交成功
        </h3>
        <p className="mt-2 text-[13px] text-[var(--color-text-secondary)]">归属日期：{bizDate}</p>
      </div>
    </motion.div>
  );
}
