"use client"

import { useMemo, useState } from "react"
import { LayoutGrid, List } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"

export type 学习样本来源 = "标杆样本" | "你的历史最佳"
export type 样本视图 = "list" | "grid"

export type 学习样本项 = {
  id: string
  视频标题: string
  发布时间: string
  账号名: string
  标签: string[]
  播放量: string
  点赞率: string
  完播率: string
  涨粉率: string
  文案: string
  推荐理由: string
  来源: 学习样本来源
  链接?: string
}

export type 学习样本库Props = {
  样本数组: 学习样本项[]
  默认视图?: 样本视图
  className?: string
}

const 来源样式: Record<学习样本来源, string> = {
  标杆样本:
    "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-200",
  你的历史最佳:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200",
}

function 截断文案(text: string, length = 100) {
  if (text.length <= length) return text
  return `${text.slice(0, length).trim()}…`
}

function 指标块({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-muted/55 px-3 py-2">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-semibold tabular-nums text-foreground">{value}</div>
    </div>
  )
}

function 样本卡({
  sample,
  expanded,
  onToggle,
  grid,
}: {
  sample: 学习样本项
  expanded: boolean
  onToggle: () => void
  grid: boolean
}) {
  const 展示文案 = expanded ? sample.文案 : 截断文案(sample.文案)
  const 需要展开 = sample.文案.length > 100

  return (
    <article
      className={cn(
        "relative bg-transparent px-4 py-4 sm:px-5",
        grid
          ? "flex h-full flex-col border-b border-r border-border/70"
          : "border-b border-border/70 last:border-b-0"
      )}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className={cn("rounded-full px-2.5 text-[11px] font-medium", 来源样式[sample.来源])}
              >
                {sample.来源}
              </Badge>
              <span className="text-xs text-muted-foreground">{sample.发布时间}</span>
            </div>

            <div className="space-y-1.5">
              <h3 className="line-clamp-2 text-sm font-semibold leading-6 text-foreground sm:text-[15px]">
                {sample.视频标题}
              </h3>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                <span>{sample.账号名}</span>
                <span className="text-border">•</span>
                <span>{sample.标签.join(" · ")}</span>
              </div>
            </div>
          </div>

          {sample.链接 ? (
            <a
              href={sample.链接}
              className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-foreground transition-opacity hover:opacity-70"
            >
              查看
              <LayoutGrid className="size-3.5" />
            </a>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <指标块 label="播放量" value={sample.播放量} />
          <指标块 label="点赞率" value={sample.点赞率} />
          <指标块 label="完播率" value={sample.完播率} />
          <指标块 label="涨粉率" value={sample.涨粉率} />
        </div>

        <div className="space-y-2 border-t border-border/60 pt-4">
          <div className="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
            文案拆解
          </div>
          <p className="text-sm leading-6 text-muted-foreground">{展示文案}</p>
          {需要展开 ? (
            <button
              type="button"
              onClick={onToggle}
              className="text-sm font-medium text-foreground transition-opacity hover:opacity-70"
            >
              {expanded ? "收起" : "展开全文"}
            </button>
          ) : null}
        </div>

        <div className="rounded-2xl border border-border/70 glass-panel px-3.5 py-3 text-sm leading-6 text-muted-foreground shadow-[0_1px_2px_rgba(15,23,42,0.03)] dark:glass-panel">
          <span className="font-semibold text-foreground">推荐理由：</span>
          {sample.推荐理由}
        </div>
      </div>
    </article>
  )
}

export function SampleLibrary({
  样本数组,
  默认视图 = "list",
  className,
}: 学习样本库Props) {
  const [视图, set视图] = useState<样本视图>(默认视图)
  const [展开项, set展开项] = useState<Record<string, boolean>>({})

  const hasSamples = 样本数组.length > 0
  const 桌面网格 = useMemo(() => 视图 === "grid", [视图])

  return (
    <Card
      className={cn(
        "card-elevated overflow-hidden rounded-[16px] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.9))] shadow-[0_18px_48px_-32px_rgba(15,23,42,0.28)] backdrop-blur dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.82),rgba(15,23,42,0.7))]",
        className
      )}
    >
      <div className="flex flex-col gap-4 border-b border-border/70 px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1.5">
            <h2 className="text-[15px] font-semibold text-foreground sm:text-base">学习样本库</h2>
            <p className="text-sm leading-6 text-muted-foreground">
              把标杆样本和你自己的历史最佳放到同一个观察面板里，先抄最弱指标对应的动作。
            </p>
          </div>

          <div className="hidden items-center gap-1 rounded-full border border-border/70 bg-background/75 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] sm:inline-flex">
            <Button
              variant={视图 === "list" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => set视图("list")}
              aria-pressed={视图 === "list"}
              className="rounded-full"
            >
              <List className="size-4" />
              列表
            </Button>
            <Button
              variant={视图 === "grid" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => set视图("grid")}
              aria-pressed={视图 === "grid"}
              className="rounded-full"
            >
              <LayoutGrid className="size-4" />
              网格
            </Button>
          </div>
        </div>
      </div>

      {!hasSamples ? (
        <div className="px-4 py-10 text-sm text-muted-foreground sm:px-5">暂无可学习样本。</div>
      ) : (
        <div>
          <div className="sm:hidden divide-y divide-border/70">
            {样本数组.map((sample) => (
              <样本卡
                key={sample.id}
                sample={sample}
                expanded={Boolean(展开项[sample.id])}
                onToggle={() =>
                  set展开项((current) => ({
                    ...current,
                    [sample.id]: !current[sample.id],
                  }))
                }
                grid={false}
              />
            ))}
          </div>

          <div
            className={cn(
              "hidden sm:block",
              桌面网格 ? "overflow-hidden" : "divide-y divide-border/70"
            )}
          >
            <div
              className={cn(
                桌面网格
                  ? "grid grid-cols-1 border-t border-l border-border/70 lg:grid-cols-2"
                  : ""
              )}
            >
              {样本数组.map((sample) => (
                <样本卡
                  key={sample.id}
                  sample={sample}
                  expanded={Boolean(展开项[sample.id])}
                  onToggle={() =>
                    set展开项((current) => ({
                      ...current,
                      [sample.id]: !current[sample.id],
                    }))
                  }
                  grid={桌面网格}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </Card>
  )
}
