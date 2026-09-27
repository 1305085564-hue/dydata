import * as React from "react"

import { cn } from "@/lib/utils"

type HeadingTag = "h2" | "h3" | "h4" | "h5" | "h6" | "span"

interface ItemHeadingProps extends React.HTMLAttributes<HTMLElement> {
  /**
   * 语义标签。视觉不因标签变化——无论 h2/h3/h4，都是同一档「条目定名」。
   * `span` 用于列表行内、按钮旁等必须保持行内/短语内容的场合。
   */
  as?: HeadingTag
  /**
   * 墨度降级：零产出、已失效等条目改用辅助墨（#78716C）。
   * 字号/字重不变——降级只降墨度，不降身份（设计规范 §2.2）。
   */
  muted?: boolean
}

/**
 * 条目定名：列表行名、卡片名、表单段落标题。它统领的只有自己。
 * 14px / 500 / #1F1E1D / Sans（设计规范 §1.1）。
 */
function ItemHeading({
  as: Tag = "h4",
  muted = false,
  className,
  ...props
}: ItemHeadingProps) {
  return (
    <Tag
      data-slot="item-heading"
      className={cn(
        "text-[14px] leading-[1.40] font-medium",
        muted ? "text-[#78716C]" : "text-[#1F1E1D]",
        className
      )}
      {...props}
    />
  )
}

export { ItemHeading }
