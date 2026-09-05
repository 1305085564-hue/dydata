import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex min-h-20 w-full rounded-xl border border-[#E5E0D6] bg-white/50 px-3.5 py-2.5 text-[13px] leading-[1.7] text-[#292524] shadow-2xs outline-none transition-[background-color,border-color,box-shadow] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] placeholder:text-[#78716C]/60 hover:border-[#78716C]/40 focus-visible:bg-white focus-visible:border-[#78716C] focus-visible:shadow-2xs focus-visible:ring-1 focus-visible:ring-[#D97757]/25 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-[#C9604D]/40 aria-invalid:ring-1 aria-invalid:ring-[#C9604D]/10",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }

/* [规范对齐] 圆角已调整：输入框 6px（rounded-md） */
