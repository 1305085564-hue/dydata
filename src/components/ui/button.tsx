"use client"

import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center border border-transparent text-[13px] font-semibold tracking-tight whitespace-nowrap outline-none select-none transition-[transform,background-color,border-color,box-shadow,color] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] hover:-translate-y-[1px] active:scale-[0.98] focus-visible:ring-1 focus-visible:ring-stone-950/5 disabled:pointer-events-none disabled:opacity-50 disabled:hover:translate-y-0 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg]:stroke-[1.5]",
  {
    variants: {
      variant: {
        default:
          "bg-[#D97757] text-white hover:bg-[#C96442] hover:shadow-[0_2px_8px_rgba(217,119,87,0.03)]",
        outline:
          "border-stone-200 bg-white text-stone-700 hover:bg-stone-100",
        secondary:
          "bg-stone-100 text-stone-700 hover:bg-stone-50",
        ghost:
          "text-stone-500 hover:bg-stone-100 hover:text-stone-700",
        destructive:
          "bg-[#C9604D] text-white hover:bg-[#C9604D]/90",
        link: "text-[#D97757] underline-offset-4 hover:underline hover:translate-y-0",
      },
      size: {
        default:
          "h-8 gap-1.5 rounded-lg px-3 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-6 gap-1 rounded-md px-2 text-[12px] has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-md px-3 text-[13px] has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 gap-1.5 rounded-lg px-4 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        icon: "size-8 rounded-lg",
        "icon-xs": "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-7 rounded-md",
        "icon-lg": "size-9 rounded-lg",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
