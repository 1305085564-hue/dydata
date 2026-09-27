import * as React from "react"

import { cn } from "@/lib/utils"

interface ListRowProps extends React.ComponentProps<"div"> {
  /**
   * 是否保留最后一项的分隔线。默认 false——最后一项以 `last:border-b-0`
   * 收掉底线，让列表以干净的留白结束。
   */
  keepLastBorder?: boolean
}

/**
 * 表格外的列表行：两端对齐、`py-2`、发丝分隔线 `#E2E2DF/60`。
 */
function ListRow({
  className,
  keepLastBorder = false,
  ...props
}: ListRowProps) {
  return (
    <div
      data-slot="list-row"
      className={cn(
        "flex items-center justify-between border-b border-[#E2E2DF]/60 py-2",
        !keepLastBorder && "last:border-b-0",
        className
      )}
      {...props}
    />
  )
}

export { ListRow }
