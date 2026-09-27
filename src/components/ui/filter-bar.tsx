import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * 筛选器栏：`flex flex-wrap items-center gap-2`，容器裸放，不加底、不加框。
 * 筛选器是过程工具，不是需要托盘的内容。
 */
function FilterBar({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="filter-bar"
      className={cn("flex flex-wrap items-center gap-2", className)}
      {...props}
    />
  )
}

export { FilterBar }
