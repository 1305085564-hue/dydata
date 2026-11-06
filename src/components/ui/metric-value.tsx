"use client"

import * as React from "react"

/**
 * 指标数值的"更新落定"：值真的变了，数字轻轻上浮淡入 200ms；首屏渲染不动。
 * 只对字符串/数字值生效（用其文本判断是否变化），复杂节点原样输出。
 */
function MetricValue({ value }: { value: React.ReactNode }) {
  const text = typeof value === "string" || typeof value === "number" ? String(value) : null
  const [prev, setPrev] = React.useState(text)
  const [version, setVersion] = React.useState(0)

  if (text !== prev) {
    setPrev(text)
    setVersion((v) => v + 1)
  }

  if (text === null || version === 0) return <>{value}</>
  return (
    <span key={version} className="value-settle">
      {value}
    </span>
  )
}

export { MetricValue }
