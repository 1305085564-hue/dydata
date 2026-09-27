import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-md border border-transparent px-2 py-0.5 text-[12px] font-normal tracking-tight whitespace-nowrap transition-[background-color,color,border-color] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] focus-visible:ring-1 focus-visible:ring-[#141413]/5 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&>svg]:pointer-events-none [&>svg]:size-3! [&>svg]:stroke-[1.5] tabular-nums",
  {
    variants: {
      variant: {
        default: "border-[#E2E2DF] bg-transparent text-[#78716C]",
        secondary: "border-[#E2E2DF] bg-transparent text-[#78716C]",
        destructive: "bg-[#C9604D]/[0.08] text-[#C9604D] before:mr-1 before:size-1.5 before:rounded-full before:bg-[#C9604D] before:inline-block",
        outline: "border-[#E2E2DF] text-[#1F1E1D]",
        ghost: "hover:bg-[#EBEBE9] hover:text-[#1F1E1D]",
        link: "text-[#D97757] underline-offset-4 hover:underline",
        success: "bg-[#6FAA7D]/[0.08] text-[#6FAA7D] before:mr-1 before:size-1.5 before:rounded-full before:bg-[#6FAA7D] before:inline-block",
        danger: "bg-[#C9604D]/[0.08] text-[#C9604D] before:mr-1 before:size-1.5 before:rounded-full before:bg-[#C9604D] before:inline-block",
        neutral: "bg-[#78716C]/[0.08] text-[#78716C] before:mr-1 before:size-1.5 before:rounded-full before:bg-[#78716C] before:inline-block",
        warning: "bg-[#B98A54]/[0.08] text-[#B98A54] before:mr-1 before:size-1.5 before:rounded-full before:bg-[#B98A54] before:inline-block",
        accent: "bg-[#43718E]/[0.08] text-[#43718E] before:mr-1 before:size-1.5 before:rounded-full before:bg-[#43718E] before:inline-block",
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
