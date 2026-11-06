"use client"

import * as React from "react"

/**
 * 每个指标位置最近一次展示过的值，跨挂载保留。
 * 用于区分「首次出现」和「数据刷新后再次出现」：
 * - 首次出现不播动画（首屏不动）；
 * - 已有历史值且本次不同，才播落定动画（即使指标块刚整体重新挂载）。
 * 只在浏览器端读写，避免服务端渲染复用到别的请求状态。
 */
const lastValues = new Map<string, string>()

function isBrowser() {
  return typeof window !== "undefined"
}

function MetricValue({
  value,
  settleKey,
}: {
  value: React.ReactNode
  settleKey?: string
}) {
  const text = typeof value === "string" || typeof value === "number" ? String(value) : null
  const cached = isBrowser() && settleKey && text !== null ? lastValues.get(settleKey) : undefined
  const [prev, setPrev] = React.useState(text)
  const [version, setVersion] = React.useState(0)
  const [settledOnMount] = React.useState(cached !== undefined && cached !== text)

  if (text !== prev) {
    setPrev(text)
    setVersion((v) => v + 1)
  }

  React.useEffect(() => {
    if (isBrowser() && settleKey && text !== null) lastValues.set(settleKey, text)
  }, [settleKey, text])

  if (text === null || (version === 0 && !settledOnMount)) return <>{value}</>
  return (
    <span key={version} className="value-settle">
      {value}
    </span>
  )
}

export { MetricValue }
