import * as React from "react"

import { cn } from "@/lib/utils"

interface MetricProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 指标数值本体 */
  value: React.ReactNode
  /** 数值标签 */
  label?: React.ReactNode
  /** 注脚说明 */
  footnote?: React.ReactNode
  /**
   * 涨跌着色只上文字，不上底色。A 股惯例：涨红 `#C0685C`、跌绿 `#6FAA7D`。
   */
  trend?: "up" | "down" | "neutral"
}

/**
 * 指标数字块：数值 20px / 500 / #141413 / tabular-nums；
 * 标签与注脚 12px / 400 / #78716C（设计规范 §1.1、§3.4）。
 */
function Metric({
  value,
  label,
  footnote,
  trend = "neutral",
  className,
  ...props
}: MetricProps) {
  return (
    <div
      data-slot="metric"
      className={cn("flex flex-col gap-1", className)}
      {...props}
    >
      <div
        data-slot="metric-value"
        className={cn(
          "text-[20px] leading-[1.20] font-medium text-[#141413] tabular-nums",
          trend === "up" && "text-[#C0685C]",
          trend === "down" && "text-[#6FAA7D]"
        )}
      >
        {value}
      </div>
      {label != null && (
        <div
          data-slot="metric-label"
          className="text-[12px] leading-[1.50] text-[#78716C]"
        >
          {label}
        </div>
      )}
      {footnote != null && (
        <div
          data-slot="metric-footnote"
          className="text-[12px] leading-[1.50] text-[#78716C]"
        >
          {footnote}
        </div>
      )}
    </div>
  )
}

export { Metric }
