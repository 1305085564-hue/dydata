"use client"

import type { ReactElement, ReactNode } from "react"
import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip"

import { cn } from "@/lib/utils"

function TooltipProvider({
  delay = 100,
  timeout = 400,
  ...props
}: TooltipPrimitive.Provider.Props) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delay={delay}
      timeout={timeout}
      {...props}
    />
  )
}

function Tooltip({ ...props }: TooltipPrimitive.Root.Props) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />
}

function TooltipTrigger({ ...props }: TooltipPrimitive.Trigger.Props) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />
}

function TooltipContent({
  className,
  side = "top",
  sideOffset = 4,
  align = "center",
  alignOffset = 0,
  children,
  ...props
}: TooltipPrimitive.Popup.Props &
  Pick<
    TooltipPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset"
  >) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        className="isolate z-[110]"
      >
        <TooltipPrimitive.Popup
          data-slot="tooltip-content"
          className={cn(
            "z-[110] inline-flex w-fit max-w-xs origin-(--transform-origin) items-center gap-1 rounded-md border border-[#E2E2DF] bg-white px-3 py-1.5 text-[12px] text-[#1F1E1D] shadow-claude-float duration-100 has-data-[slot=kbd]:pr-1.5 **:data-[slot=kbd]:relative **:data-[slot=kbd]:isolate **:data-[slot=kbd]:z-[110] **:data-[slot=kbd]:rounded-md data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 data-instant:animate-none data-instant:duration-0",
            className
          )}
          {...props}
        >
          {children}
          <TooltipPrimitive.Arrow className="z-[90] size-2.5 translate-y-[calc(-50%-2px)] rotate-45 rounded-md border-[#E2E2DF] bg-white fill-white data-[side=bottom]:top-1 data-[side=bottom]:border-l data-[side=bottom]:border-t data-[side=inline-end]:top-1/2! data-[side=inline-end]:-left-1 data-[side=inline-end]:-translate-y-1/2 data-[side=inline-end]:border-b data-[side=inline-end]:border-l data-[side=inline-start]:top-1/2! data-[side=inline-start]:-right-1 data-[side=inline-start]:-translate-y-1/2 data-[side=inline-start]:border-r data-[side=inline-start]:border-t data-[side=left]:top-1/2! data-[side=left]:-right-1 data-[side=left]:-translate-y-1/2 data-[side=left]:border-r data-[side=left]:border-t data-[side=right]:top-1/2! data-[side=right]:-left-1 data-[side=right]:-translate-y-1/2 data-[side=right]:border-b data-[side=right]:border-l data-[side=top]:-bottom-2.5 data-[side=top]:border-b data-[side=top]:border-r" />
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  )
}

function SimpleTooltip({
  tip,
  side = "top",
  align = "center",
  sideOffset = 4,
  contentClassName,
  children,
}: {
  tip: ReactNode
  side?: TooltipPrimitive.Positioner.Props["side"]
  align?: TooltipPrimitive.Positioner.Props["align"]
  sideOffset?: number
  contentClassName?: string
  children: ReactElement
}) {
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent side={side} align={align} sideOffset={sideOffset} className={contentClassName}>
        {tip}
      </TooltipContent>
    </Tooltip>
  )
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider, SimpleTooltip }
