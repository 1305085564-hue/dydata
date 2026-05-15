"use client"

import { ArrowUpRight, Sparkles, Target, Tags } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

export type 标杆类型 = "同标签最佳" | "单项最佳" | "近期跃迁"

export type 核心指标差距项 = {
  指标名: string
  我的值: number
  标杆值: number
  单位?: string
  精度?: number
}

export type 标杆画像卡Props = {
  标杆类型: 标杆类型
  账号名: string
  账号标识?: string
  标签: string[]
  推荐理由: string
  核心指标差距: [核心指标差距项, 核心指标差距项, ...核心指标差距项[]]
  代表样本入口: {
    标题?: string
    链接: string
  }
  className?: string
}

const 标杆角标配置: Record<
  标杆类型,
  {
    文案: string
    icon: typeof Tags
    className: string
  }
> = {
  同标签最佳: {
    文案: "同标签最佳",
    icon: Tags,
    className: "border-zinc-200 bg-zinc-50 text-[#6FAA7D]",
  },
  单项最佳: {
    文案: "单项最佳",
    icon: Target,
    className: "border-zinc-200 bg-zinc-50 text-zinc-800",
  },
  近期跃迁: {
    文案: "近期跃迁",
    icon: Sparkles,
    className: "border-zinc-200 bg-zinc-50 text-[#D99E55]",
  },
}

function 格式化指标(value: number, 单位 = "%", 精度 = 1) {
  return `${value.toFixed(精度)}${单位}`
}

function 对比条({ item }: { item: 核心指标差距项 }) {
  const 最大值 = Math.max(item.我的值, item.标杆值, 1)
  const 我的占比 = Math.max((item.我的值 / 最大值) * 100, 8)
  const 标杆占比 = Math.max((item.标杆值 / 最大值) * 100, 8)

  return (
    <div className="space-y-2.5 rounded-xl border border-zinc-200 bg-white p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px] font-medium text-zinc-800">{item.指标名}</span>
        <span className="text-[11px] font-mono tabular-nums text-zinc-500">
          {格式化指标(item.我的值, item.单位, item.精度)} / {" "}
          {格式化指标(item.标杆值, item.单位, item.精度)}
        </span>
      </div>

      <div className="space-y-2">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] text-zinc-500">
            <span>我</span>
            <span className="font-mono tabular-nums">
              {格式化指标(item.我的值, item.单位, item.精度)}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-zinc-100">
            <div
              className="h-full rounded-full bg-zinc-300 transition-[width] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]"
              style={{ width: `${我的占比}%` }}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] text-zinc-500">
            <span>标杆</span>
            <span className="font-mono tabular-nums">
              {格式化指标(item.标杆值, item.单位, item.精度)}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-zinc-100">
            <div
              className="h-full rounded-full bg-[#D97757] transition-[width] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]"
              style={{ width: `${标杆占比}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

export function BenchmarkCard({
  标杆类型,
  账号名,
  账号标识,
  标签,
  推荐理由,
  核心指标差距,
  代表样本入口,
  className,
}: 标杆画像卡Props) {
  const 配置 = 标杆角标配置[标杆类型]
  const Icon = 配置.icon

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-zinc-200 bg-white",
        className
      )}
    >
      <div className="gap-3 border-b border-zinc-200 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <Badge
              variant="outline"
              className={cn(
                "h-6 rounded-full border px-2.5 text-[10px] font-medium uppercase tracking-[0.25em]",
                配置.className
              )}
            >
              <Icon className="size-3.5 stroke-[1.5]" />
              {配置.文案}
            </Badge>
            <div className="space-y-1">
              <h3 className="text-[18px] font-medium tracking-tight text-zinc-800">
                {账号名}
              </h3>
              {账号标识 ? (
                <p className="text-[13px] text-zinc-500">
                  {账号标识}
                </p>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-1.5">
            {标签.map((tag) => (
              <Badge
                key={tag}
                variant="outline"
                className="rounded-full border-zinc-200 bg-white px-2.5 text-[11px] font-medium text-zinc-500"
              >
                {tag}
              </Badge>
            ))}
          </div>
        </div>

        <p className="mt-3 max-w-3xl text-[13px] leading-[1.7] text-zinc-500">{推荐理由}</p>
      </div>

      <div className="p-5">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {核心指标差距.slice(0, 3).map((item) => (
            <对比条 key={item.指标名} item={item} />
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between bg-zinc-50 px-5 py-3">
        <span className="text-[13px] text-zinc-500">
          从代表样本里拆你最需要补的动作细节
        </span>
        <a
          href={代表样本入口.链接}
          className="inline-flex items-center gap-1 text-[13px] font-semibold text-zinc-800 transition-[opacity,color] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] hover:opacity-70"
        >
          {代表样本入口.标题 ?? "查看 TA 的作品"}
          <ArrowUpRight className="size-4 stroke-[1.5]" />
        </a>
      </div>
    </div>
  )
}
