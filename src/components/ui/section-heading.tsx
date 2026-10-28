import * as React from "react"

import { cn } from "@/lib/utils"

type HeadingTag = "h2" | "h3" | "h4" | "h5" | "h6"

interface SectionHeadingProps
  extends React.HTMLAttributes<HTMLHeadingElement> {
  /**
   * 语义标签。视觉不因标签变化——无论 h2/h3/h4，都是同一档「章节定名」。
   */
  as?: HeadingTag
}

/**
 * 章节定名：一个区域、一个抽屉、一个弹窗在讲什么。
 * 20px / 400 / #141413 / Sans（《视觉与数值手册》§1.1）。
 * 注意：全站字重仅 400，中档字重在基线环境不存在（《Claude设计哲学》定律3）。
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
        "text-[20px] leading-[1.30] text-[#141413]",
        className
      )}
      {...props}
    />
  )
}

export { SectionHeading }
