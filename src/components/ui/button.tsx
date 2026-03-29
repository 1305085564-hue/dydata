"use client"

import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-[var(--radius-button)] border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-[background-color,border-color,box-shadow,color,transform] duration-[var(--duration-fast)] ease-[var(--ease-out)] outline-none select-none hover:-translate-y-px active:translate-y-0 active:scale-[0.99] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/45 disabled:pointer-events-none disabled:opacity-50 disabled:hover:translate-y-0 disabled:active:scale-100 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-[var(--shadow-light)] hover:bg-primary/92 focus-visible:shadow-[var(--shadow-medium)]",
        outline:
          "border-border/80 bg-background/80 text-foreground shadow-[var(--shadow-light)] hover:border-border hover:bg-muted/80 aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/35 dark:hover:bg-input/55",
        secondary:
          "border border-transparent bg-secondary text-secondary-foreground shadow-[var(--shadow-light)] hover:bg-secondary/88 aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "text-muted-foreground hover:bg-muted/70 hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/55",
        destructive:
          "bg-destructive/12 text-destructive shadow-[var(--shadow-light)] hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/22 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-8 gap-1.5 px-3 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-6 gap-1 rounded-[var(--radius-button)] px-2 text-xs in-data-[slot=button-group]:rounded-[var(--radius-button)] has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-[var(--radius-button)] px-3 text-[0.8rem] in-data-[slot=button-group]:rounded-[var(--radius-button)] has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        icon: "size-8",
        "icon-xs":
          "size-6 rounded-[var(--radius-button)] in-data-[slot=button-group]:rounded-[var(--radius-button)] [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-7 rounded-[var(--radius-button)] in-data-[slot=button-group]:rounded-[var(--radius-button)]",
        "icon-lg": "size-9",
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
