import * as React from "react"

import { cn } from "@/lib/utils"

type HeadingTag = "h2" | "h3" | "h4"

interface ItemHeadingProps extends React.HTMLAttributes<HTMLHeadingElement> {
  /**
   * 语义标签。视觉不因标签变化——无论 h2/h3/h4，都是同一档「条目定名」。
   */
  as?: HeadingTag
}

/**
 * 条目定名：列表行名、卡片名、表单段落标题。它统领的只有自己。
 * 14px / 500 / #1F1E1D / Sans（设计规范 §1.1）。
 */
function ItemHeading({
  as: Tag = "h4",
  className,
  ...props
}: ItemHeadingProps) {
  return (
    <Tag
      data-slot="item-heading"
      className={cn(
        "text-[14px] leading-[1.40] font-medium text-[#1F1E1D]",
        className
      )}
      {...props}
    />
  )
}

export { ItemHeading }
