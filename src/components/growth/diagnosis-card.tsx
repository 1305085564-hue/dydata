import { ArrowUpRight } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

export type 诊断维度项 = {
  维度名: string
  分位值: number
  分位标签?: string
}

export type 诊断弱项 = {
  名称: string
  跳转链接?: string
}

export type 个人诊断卡Props = {
  五维评分数据: [诊断维度项, 诊断维度项, 诊断维度项, 诊断维度项, 诊断维度项]
  强项: [string, string, string]
  弱项: [诊断弱项, 诊断弱项]
  className?: string
}

function clamp(value: number) {
  return Math.min(100, Math.max(0, value))
}

function 获取分位标签(item: 诊断维度项) {
  if (item.分位标签) return item.分位标签
  if (item.分位值 >= 80) return "前 20%"
  if (item.分位值 <= 20) return "后 20%"
  return "中段"
}

function 获取颜色(分位值: number) {
  if (分位值 >= 80) {
    return {
      bar: "bg-emerald-500",
      chip: "bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-200",
    }
  }

  if (分位值 <= 20) {
    return {
      bar: "bg-orange-500",
      chip: "bg-orange-50 text-orange-700 dark:bg-orange-400/10 dark:text-orange-200",
    }
  }

  return {
    bar: "bg-slate-400",
    chip: "bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-200",
  }
}

export function DiagnosisCard({
  五维评分数据,
  强项,
  弱项,
  className,
}: 个人诊断卡Props) {
  return (
    <Card
      className={cn(
        "card-elevated rounded-[16px] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(249,250,251,0.9))] shadow-[0_18px_48px_-32px_rgba(15,23,42,0.3)] backdrop-blur dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.82),rgba(15,23,42,0.7))]",
        className
      )}
    >
      <CardHeader className="gap-2 border-b border-border/70 pb-5">
        <CardTitle className="text-[15px] font-semibold text-foreground sm:text-base">
          个人诊断
        </CardTitle>
        <p className="text-sm leading-6 text-muted-foreground">
          先看你在哪些维度已经领先，再把弱项直接映射到可学习的标杆样本。
        </p>
      </CardHeader>

      <CardContent className="space-y-6 pt-5">
        <div className="space-y-4">
          {五维评分数据.map((item) => {
            const 分位值 = clamp(item.分位值)
            const 颜色 = 获取颜色(分位值)

            return (
              <div key={item.维度名} className="grid grid-cols-[72px_minmax(0,1fr)_64px] items-center gap-3 sm:grid-cols-[88px_minmax(0,1fr)_72px]">
                <div className="text-sm font-medium text-foreground">{item.维度名}</div>

                <div className="h-2.5 overflow-hidden rounded-full bg-slate-200/75 dark:bg-slate-800/80">
                  <div
                    className={cn("h-full rounded-full transition-[width]", 颜色.bar)}
                    style={{ width: `${分位值}%` }}
                  />
                </div>

                <div
                  className={cn(
                    "rounded-full px-2 py-1 text-center text-[11px] font-semibold tabular-nums",
                    颜色.chip
                  )}
                >
                  {获取分位标签(item)}
                </div>
              </div>
            )
          })}
        </div>

        <div className="grid gap-4 border-t border-border/70 pt-5 sm:grid-cols-2">
          <section className="space-y-3">
            <div className="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
              强项
            </div>
            <div className="flex flex-wrap gap-2">
              {强项.map((item) => (
                <Badge
                  key={item}
                  variant="outline"
                  className="rounded-full border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200"
                >
                  {item}
                </Badge>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <div className="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
              弱项
            </div>
            <div className="flex flex-wrap gap-2">
              {弱项.map((item) => {
                const content = (
                  <>
                    <span>{item.名称}</span>
                    {item.跳转链接 ? <ArrowUpRight className="size-3.5" /> : null}
                  </>
                )

                if (item.跳转链接) {
                  return (
                    <a
                      key={item.名称}
                      href={item.跳转链接}
                      className="inline-flex items-center gap-1 rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-[11px] font-medium text-orange-700 transition-opacity hover:opacity-75 dark:border-orange-400/20 dark:bg-orange-400/10 dark:text-orange-200"
                    >
                      {content}
                    </a>
                  )
                }

                return (
                  <Badge
                    key={item.名称}
                    variant="outline"
                    className="rounded-full border-orange-200 bg-orange-50 px-2.5 py-1 text-[11px] font-medium text-orange-700 dark:border-orange-400/20 dark:bg-orange-400/10 dark:text-orange-200"
                  >
                    {item.名称}
                  </Badge>
                )
              })}
            </div>
          </section>
        </div>
      </CardContent>
    </Card>
  )
}
