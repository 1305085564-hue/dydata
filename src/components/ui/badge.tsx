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
        destructive: "bg-status-danger/[0.08] text-status-danger before:mr-1 before:size-1.5 before:rounded-full before:bg-current before:inline-block",
        outline: "border-[#E2E2DF] text-[#1F1E1D]",
        ghost: "hover:bg-[#EBEBE9] hover:text-[#1F1E1D]",
        link: "text-[#D97757] underline-offset-4 hover:underline",
        success: "bg-status-success/[0.08] text-status-success before:mr-1 before:size-1.5 before:rounded-full before:bg-current before:inline-block",
        danger: "bg-status-danger/[0.08] text-status-danger before:mr-1 before:size-1.5 before:rounded-full before:bg-current before:inline-block",
        neutral: "bg-[#78716C]/[0.08] text-[#78716C] before:mr-1 before:size-1.5 before:rounded-full before:bg-current before:inline-block",
        warning: "bg-status-warning/[0.08] text-status-warning before:mr-1 before:size-1.5 before:rounded-full before:bg-current before:inline-block",
        accent: "bg-status-info/[0.08] text-status-info before:mr-1 before:size-1.5 before:rounded-full before:bg-current before:inline-block",
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
