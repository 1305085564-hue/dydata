import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

export interface InputProps extends Omit<React.ComponentProps<"input">, "size"> {
  size?: "sm" | "default" | "lg"
}

function Input({ className, type, size = "default", ...props }: InputProps) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      data-size={size}
      className={cn(
        "w-full min-w-0 rounded-md border border-[#E5E0D6] bg-[#FAF8F4]/50 text-[#292524] outline-none transition-[background-color,border-color,box-shadow] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-[13px] file:font-normal file:text-[#292524] placeholder:text-[#78716C]/60 hover:border-[#78716C]/40 focus-visible:bg-white focus-visible:border-[#78716C] focus-visible:shadow-2xs focus-visible:ring-1 focus-visible:ring-[#D97757]/25 focus-visible:ring-offset-0 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-[#C9604D]/40 aria-invalid:ring-1 aria-invalid:ring-[#C9604D]/10 tabular-nums",
        size === "sm" && "h-7 px-2.5 py-1 text-[12px]",
        size === "default" && "min-h-[44px] sm:min-h-0 sm:h-8 px-3 py-1 text-[13px]",
        size === "lg" && "h-10 px-3.5 py-2 text-[14px]",
        className
      )}
      {...props}
    />
  )
}

export { Input }

/* [规范对齐] 圆角已调整：输入框 6px（rounded-md） */
