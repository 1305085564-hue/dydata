import * as React from "react"

import { cn } from "@/lib/utils"

type HeadingTag = "h2" | "h3" | "h4"

interface SectionHeadingProps
  extends React.HTMLAttributes<HTMLHeadingElement> {
  /**
   * 语义标签。视觉不因标签变化——无论 h2/h3/h4，都是同一档「章节定名」。
   */
  as?: HeadingTag
}

/**
 * 章节定名：一个区域、一个抽屉、一个弹窗在讲什么。
 * 18px / 500 / #141413 / Sans（设计规范 §1.1）。
 */
function SectionHeading({
  as: Tag = "h3",
  className,
  ...props
}: SectionHeadingProps) {
  return (
    <Tag
      data-slot="section-heading"
      className={cn(
        "text-[18px] leading-[1.30] font-medium text-[#141413]",
        className
      )}
      {...props}
    />
  )
}

export { SectionHeading }
