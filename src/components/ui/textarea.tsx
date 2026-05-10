import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex min-h-20 w-full rounded-lg border border-transparent bg-zinc-100/70 px-3 py-2 text-[13px] leading-[1.7] text-zinc-800 outline-none transition-[background-color,border-color,box-shadow] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] placeholder:text-zinc-400 focus-visible:bg-white focus-visible:border-zinc-200 focus-visible:shadow-sm focus-visible:ring-1 focus-visible:ring-zinc-950/5 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-[#C9604D]/40 aria-invalid:ring-1 aria-invalid:ring-[#C9604D]/10",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
