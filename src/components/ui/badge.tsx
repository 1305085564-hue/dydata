import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-2 py-0.5 text-[12px] font-medium tracking-tight whitespace-nowrap transition-[background-color,color,border-color] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] focus-visible:ring-1 focus-visible:ring-zinc-950/5 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&>svg]:pointer-events-none [&>svg]:size-3! [&>svg]:stroke-[1.5] tabular-nums",
  {
    variants: {
      variant: {
        default: "bg-zinc-100 text-zinc-800",
        secondary: "bg-zinc-100 text-zinc-800",
        destructive: "bg-zinc-50 text-[#C9604D] before:mr-1 before:size-1.5 before:rounded-full before:bg-[#C9604D] before:inline-block",
        outline: "border-zinc-200 text-zinc-800",
        ghost: "hover:bg-zinc-100 hover:text-zinc-800",
        link: "text-[#D97757] underline-offset-4 hover:underline",
        success: "bg-zinc-50 text-[#6FAA7D] before:mr-1 before:size-1.5 before:rounded-full before:bg-[#6FAA7D] before:inline-block",
        danger: "bg-zinc-50 text-[#C9604D] before:mr-1 before:size-1.5 before:rounded-full before:bg-[#C9604D] before:inline-block",
        neutral: "bg-zinc-50 text-zinc-500 before:mr-1 before:size-1.5 before:rounded-full before:bg-zinc-400 before:inline-block",
        warning: "bg-zinc-50 text-[#D99E55] before:mr-1 before:size-1.5 before:rounded-full before:bg-[#D99E55] before:inline-block",
        accent: "bg-zinc-50 text-[#8AA8C7] before:mr-1 before:size-1.5 before:rounded-full before:bg-[#8AA8C7] before:inline-block",
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
