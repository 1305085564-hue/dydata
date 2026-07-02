import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-8 w-full min-w-0 rounded-lg border border-transparent bg-zinc-100/70 px-3 py-1 text-[13px] text-zinc-800 outline-none transition-[background-color,border-color,box-shadow] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-[13px] file:font-medium file:text-zinc-800 placeholder:text-zinc-400 focus-visible:bg-white focus-visible:border-zinc-200 focus-visible:shadow-sm focus-visible:ring-1 focus-visible:ring-zinc-950/5 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-[#C9604D]/40 aria-invalid:ring-1 aria-invalid:ring-[#C9604D]/10 tabular-nums",
        className
      )}
      {...props}
    />
  )
}

export { Input }

