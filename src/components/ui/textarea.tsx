import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex min-h-20 w-full rounded-md border border-[#E2E2DF] bg-white px-3.5 py-2.5 text-[13px] leading-[1.60] text-[#1F1E1D] shadow-input outline-none transition-[background-color,border-color,box-shadow] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] placeholder:text-[#78716C]/60 hover:border-[#78716C]/40 focus-visible:bg-white focus-visible:border-[#78716C] focus-visible:ring-1 focus-visible:ring-[#141413]/10 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-status-danger/40 aria-invalid:ring-1 aria-invalid:ring-status-danger/10",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }

/* [规范对齐] 圆角已调整：输入框 6px（rounded-md） */
