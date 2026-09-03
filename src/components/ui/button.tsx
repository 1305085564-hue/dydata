"use client"

import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center border border-transparent font-medium tracking-tight whitespace-nowrap outline-none select-none transition-[transform,background-color,border-color,box-shadow,color] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] active:scale-[0.99] active:duration-120 focus-visible:ring-1 focus-visible:ring-[#D97757]/25 focus-visible:ring-offset-0 disabled:pointer-events-none disabled:opacity-50 disabled:hover:translate-y-0 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:stroke-[1.5]",
  {
    variants: {
      variant: {
        default:
          "bg-[#D97757] text-white hover:bg-[#C46A4D] shadow-sm",
        outline:
          "border-[#ECE7DE] bg-[#F5F3EE] text-[#292524] hover:bg-[#ECE7DE] hover:text-[#1C1917]",
        secondary:
          "bg-[#F5F3EE] text-[#292524] hover:bg-[#ECE7DE]",
        ghost:
          "text-[#292524] hover:bg-[#F5F3EE] hover:text-[#1C1917]",
        destructive:
          "bg-[#C0685C] text-white hover:bg-[#B0584D] shadow-sm",
        link: "text-[#D97757] underline-offset-4 hover:underline hover:translate-y-0",
      },
      size: {
        // M 标准级 (28px, h-7 px-2.5 text-[13px]) - 工具栏、筛选器、次要操作
        default:
          "h-7 gap-1.5 rounded-md px-2.5 text-[13px] has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3.5",
        m: "h-7 gap-1.5 rounded-md px-2.5 text-[13px] has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3.5",
        sm: "h-7 gap-1.5 rounded-md px-2.5 text-[13px] has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3.5",
        // S 紧凑级 (24px, h-6 px-2 text-[12px]) - 表格行内小操作、标签按钮
        s: "h-6 gap-1 rounded-md px-2 text-[12px] has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        xs: "h-6 gap-1 rounded-md px-2 text-[12px] has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        // L 主控级 (40px, h-10 px-4 text-[14px]) - 页面主搜索栏、核心大提交按钮
        l: "h-10 gap-2 rounded-md px-4 text-[14px] has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3 [&_svg:not([class*='size-'])]:size-4",
        lg: "h-10 gap-2 rounded-md px-4 text-[14px] has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3 [&_svg:not([class*='size-'])]:size-4",
        // 图标按钮
        icon: "size-7 rounded-md [&_svg:not([class*='size-'])]:size-3.5",
        "icon-m": "size-7 rounded-md [&_svg:not([class*='size-'])]:size-3.5",
        "icon-sm": "size-7 rounded-md [&_svg:not([class*='size-'])]:size-3.5",
        "icon-s": "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
        "icon-xs": "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
        "icon-l": "size-10 rounded-md [&_svg:not([class*='size-'])]:size-4",
        "icon-lg": "size-10 rounded-md [&_svg:not([class*='size-'])]:size-4",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends ButtonPrimitive.Props,
    VariantProps<typeof buttonVariants> {
  loading?: boolean
}

function Button({
  className,
  variant = "default",
  size = "default",
  loading = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  const spinnerColor =
    variant === "default" || variant === "destructive"
      ? "text-white"
      : variant === "link"
        ? "text-[#D97757]"
        : "text-[#292524]"

  const spinnerSize =
    size === "s" || size === "xs" || size === "icon-s" || size === "icon-xs"
      ? "size-3"
      : size === "l" || size === "lg" || size === "icon-l" || size === "icon-lg"
        ? "size-4"
        : "size-3.5"

  return (
    <ButtonPrimitive
      data-slot="button"
      data-loading={loading ? "" : undefined}
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      className={cn(
        buttonVariants({ variant, size, className }),
        loading && "relative select-none text-transparent! [&>*]:invisible"
      )}
      {...props}
    >
      {loading && (
        <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <Loader2 className={cn(spinnerSize, "animate-spin", spinnerColor)} />
        </span>
      )}
      {children}
    </ButtonPrimitive>
  )
}

export { Button, buttonVariants }

/* [Claude 设计规范] S(24px) / M(28px) / L(40px) 三档高度体系，双星行动（陶土橙主 + 浅砂副），微压感 active:scale-[0.99]，原生防跳宽 loading 支持 */

