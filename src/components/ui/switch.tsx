"use client"

import { Switch as SwitchPrimitive } from "@base-ui/react/switch"

import { cn } from "@/lib/utils"

function Switch({ className, ...props }: SwitchPrimitive.Root.Props) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border border-transparent bg-stone-200 p-0.5 outline-none transition-[background-color] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] focus-visible:ring-2 focus-visible:ring-stone-900/20 disabled:cursor-not-allowed disabled:opacity-50 data-checked:bg-[#D97757]",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="block size-5 rounded-full bg-white transition-transform duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] data-checked:translate-x-5"
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
