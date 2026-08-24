import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-8 w-full min-w-0 rounded-md border border-[#E5E0D6] bg-white px-3 py-1 text-[13px] text-[#292524] outline-none transition-[background-color,border-color,box-shadow] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-[13px] file:font-normal file:text-[#292524] placeholder:text-[#78716C]/60 hover:border-[#78716C]/40 focus-visible:bg-white focus-visible:border-[#78716C] focus-visible:shadow-2xs focus-visible:ring-1 focus-visible:ring-[#D97757]/25 focus-visible:ring-offset-0 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-[#C9604D]/40 aria-invalid:ring-1 aria-invalid:ring-[#C9604D]/10 tabular-nums",
        className
      )}
      {...props}
    />
  )
}

export { Input }

/* [规范对齐] 圆角已调整：输入框 6px（rounded-md） */
