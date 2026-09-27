import * as React from "react"

import { cn } from "@/lib/utils"

/** 指标数值的语义着色：只上文字，不上底色（规范 §3.4） */
type MetricTone = "default" | "success" | "danger" | "warning" | "accent"

interface MetricProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 指标数值本体 */
  value: React.ReactNode
  /** 数值标签 */
  label?: React.ReactNode
  /** 注脚说明 */
  footnote?: React.ReactNode
  /**
   * 数值语义着色（组件契约，非业务逃生口）。需要强调时用 tone，
   * 不要在业务侧覆盖字号或直接给 Metric 追 `valueClassName`。
   */
  tone?: MetricTone
}

const toneClass: Record<MetricTone, string> = {
  default: "text-[#141413]",
  success: "text-status-success",
  danger: "text-status-danger",
  warning: "text-status-warning",
  accent: "text-[#D97757]",
}

/**
 * 指标数字块：数值 20px / 500 / #141413 / tabular-nums（规范 §1.2 仪表盘指标大数豁免）；
 * 标签与注脚 12px / 400 / #78716C（设计规范 §1.1、§3.4）。
 */
function Metric({
  value,
  label,
  footnote,
  tone = "default",
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
          "text-[20px] leading-[1.20] font-medium tabular-nums",
          toneClass[tone]
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
