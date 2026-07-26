import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex min-h-20 w-full rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-[13px] leading-[1.7] text-zinc-700 outline-none transition-[background-color,border-color,box-shadow] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] placeholder:text-zinc-500 focus-visible:bg-white focus-visible:border-zinc-500 focus-visible:shadow-sm focus-visible:ring-1 focus-visible:ring-zinc-900/10 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-[#C9604D]/40 aria-invalid:ring-1 aria-invalid:ring-[#C9604D]/10",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }

/* [规范对齐] 圆角已调整：输入框 6px（rounded-md） */
