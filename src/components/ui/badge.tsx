import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-2 py-0.5 text-[12px] font-medium tracking-tight whitespace-nowrap transition-[background-color,color,border-color] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] focus-visible:ring-1 focus-visible:ring-stone-950/5 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&>svg]:pointer-events-none [&>svg]:size-3! [&>svg]:stroke-[1.5] tabular-nums",
  {
    variants: {
      variant: {
        default: "bg-stone-100 text-stone-700",
        secondary: "bg-stone-100 text-stone-700",
        destructive: "bg-stone-50 text-[#B24E3E] before:mr-1 before:size-1.5 before:rounded-full before:bg-[#B24E3E] before:inline-block",
        outline: "border-stone-200 text-stone-700",
        ghost: "hover:bg-stone-100 hover:text-stone-700",
        link: "text-[#B4532F] underline-offset-4 hover:underline",
        success: "bg-stone-50 text-[#3F7A4E] before:mr-1 before:size-1.5 before:rounded-full before:bg-[#3F7A4E] before:inline-block",
        danger: "bg-stone-50 text-[#B24E3E] before:mr-1 before:size-1.5 before:rounded-full before:bg-[#B24E3E] before:inline-block",
        neutral: "bg-stone-50 text-stone-500 before:mr-1 before:size-1.5 before:rounded-full before:bg-stone-400 before:inline-block",
        warning: "bg-stone-50 text-[#8F641B] before:mr-1 before:size-1.5 before:rounded-full before:bg-[#8F641B] before:inline-block",
        accent: "bg-stone-50 text-[#4E7194] before:mr-1 before:size-1.5 before:rounded-full before:bg-[#4E7194] before:inline-block",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  })
}

export { Badge, badgeVariants }
