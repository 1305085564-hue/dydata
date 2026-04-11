import { ArrowUpRight, Sparkles, Target, Tags } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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
    accentClassName: string
  }
> = {
  同标签最佳: {
    文案: "🏷️同标签最佳",
    icon: Tags,
    className:
      "border-emerald-200/80 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200",
    accentClassName: "from-emerald-500/14 via-transparent to-transparent",
  },
  单项最佳: {
    文案: "🎯单项最佳",
    icon: Target,
    className:
      "border-sky-200/80 bg-sky-50 text-sky-700 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-200",
    accentClassName: "from-sky-500/14 via-transparent to-transparent",
  },
  近期跃迁: {
    文案: "🚀近期跃迁",
    icon: Sparkles,
    className:
      "border-violet-200/80 bg-violet-50 text-violet-700 dark:border-violet-400/20 dark:bg-violet-400/10 dark:text-violet-200",
    accentClassName: "from-violet-500/14 via-transparent to-transparent",
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
    <div className="space-y-2.5 rounded-2xl border border-white/70 glass-panel p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)] backdrop-blur dark:border-white/10 dark:glass-panel">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-foreground">{item.指标名}</span>
        <span className="text-xs text-muted-foreground">
          {格式化指标(item.我的值, item.单位, item.精度)} / {" "}
          {格式化指标(item.标杆值, item.单位, item.精度)}
        </span>
      </div>

      <div className="space-y-2">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>我</span>
            <span className="tabular-nums">
              {格式化指标(item.我的值, item.单位, item.精度)}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-200/70 dark:bg-slate-800/80">
            <div
              className="h-full rounded-full bg-slate-400/85 transition-[width] dark:bg-slate-500"
              style={{ width: `${我的占比}%` }}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>标杆</span>
            <span className="tabular-nums">
              {格式化指标(item.标杆值, item.单位, item.精度)}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-200/70 dark:bg-slate-800/80">
            <div
              className="h-full rounded-full bg-primary transition-[width]"
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
    <Card
      className={cn(
        "card-elevated relative overflow-hidden rounded-[16px] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.92))] shadow-[0_20px_50px_-32px_rgba(15,23,42,0.28)] backdrop-blur dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.82),rgba(15,23,42,0.68))]",
        className
      )}
    >
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-br blur-2xl",
          配置.accentClassName
        )}
      />

      <CardHeader className="relative gap-3 border-b border-border/70 pb-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <Badge
              variant="outline"
              className={cn(
                "h-6 rounded-full border px-2.5 text-[11px] font-semibold tracking-[0.01em]",
                配置.className
              )}
            >
              <Icon className="size-3.5" />
              {配置.文案}
            </Badge>
            <div className="space-y-1">
              <CardTitle className="text-[15px] font-semibold tracking-[0.01em] text-foreground sm:text-base">
                {账号名}
              </CardTitle>
              {账号标识 ? (
                <CardDescription className="text-sm text-muted-foreground">
                  {账号标识}
                </CardDescription>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-1.5">
            {标签.map((tag) => (
              <Badge
                key={tag}
                variant="outline"
                className="rounded-full border-border/80 bg-background/70 px-2.5 text-[11px] font-medium text-muted-foreground"
              >
                {tag}
              </Badge>
            ))}
          </div>
        </div>

        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">{推荐理由}</p>
      </CardHeader>

      <CardContent className="relative pt-5">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {核心指标差距.slice(0, 3).map((item) => (
            <对比条 key={item.指标名} item={item} />
          ))}
        </div>
      </CardContent>

      <CardFooter className="relative justify-between border-t border-white/60 glass-panel px-4 py-3 dark:border-white/10 dark:glass-panel">
        <span className="text-sm text-muted-foreground">
          从代表样本里拆你最需要补的动作细节
        </span>
        <a
          href={代表样本入口.链接}
          className="inline-flex items-center gap-1 text-sm font-semibold text-foreground transition-opacity hover:opacity-70"
        >
          {代表样本入口.标题 ?? "查看 TA 的作品"}
          <ArrowUpRight className="size-4" />
        </a>
      </CardFooter>
    </Card>
  )
}
