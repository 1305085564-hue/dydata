"use client"

import { AnimatePresence, motion } from "framer-motion"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { calcRates, parsePercentText, type CalculatedRates } from "@/lib/metrics"
import { cn } from "@/lib/utils"

export type PKBattleMode = "1v1" | "vsTeam" | "multi"

export type PKBattleDimensionKey =
  | "likeRate"
  | "commentRate"
  | "shareRate"
  | "saveRate"
  | "followerRate"
  | "completionRate"
  | "completionRate5s"
  | "bounceRate2s"

export type PKBattleCompetitor = {
  id: string
  name: string
  label?: string
  play_count?: number | null
  likes?: number | null
  comments?: number | null
  shares?: number | null
  favorites?: number | null
  follower_gain?: number | null
  completion_rate?: string | number | null
  completion_rate_5s?: string | number | null
  bounce_rate_2s?: string | number | null
  rates?: Partial<CalculatedRates>
  likeRate?: number | null
  commentRate?: number | null
  shareRate?: number | null
  saveRate?: number | null
  followerRate?: number | null
  completionRate?: number | null
  completionRate5s?: number | null
  bounceRate2s?: number | null
}

export type PKBattleProps = {
  mode: PKBattleMode
  playerA: PKBattleCompetitor
  playerB?: PKBattleCompetitor
  teamAvg?: PKBattleCompetitor
  dimensions: PKBattleDimensionKey[]
  className?: string
}

type DimensionConfig = {
  label: string
  precision: number
  suffix: string
  lowerIsBetter?: boolean
}

type ResolvedBattleValue = {
  key: PKBattleDimensionKey
  label: string
  valueA: number
  valueB: number
  winner: "a" | "b" | "tie"
  lowerIsBetter: boolean
  precision: number
  suffix: string
}

const dimensionConfig: Record<PKBattleDimensionKey, DimensionConfig> = {
  likeRate: { label: "点赞率", precision: 2, suffix: "%" },
  commentRate: { label: "评论率", precision: 2, suffix: "%" },
  shareRate: { label: "分享率", precision: 2, suffix: "%" },
  saveRate: { label: "收藏率", precision: 2, suffix: "%" },
  followerRate: { label: "涨粉率", precision: 2, suffix: "%" },
  completionRate: { label: "完播率", precision: 2, suffix: "%" },
  completionRate5s: { label: "5秒完播率", precision: 2, suffix: "%" },
  bounceRate2s: { label: "2秒跳出率", precision: 2, suffix: "%", lowerIsBetter: true },
}

function safeNumber(value: number | null | undefined) {
  return Number.isFinite(value) ? Number(value) : 0
}

function formatMetricValue(value: number, precision: number, suffix: string) {
  return `${value.toFixed(precision)}${suffix}`
}

function getCompetitorRates(competitor: PKBattleCompetitor) {
  const calculated = calcRates(competitor)

  return {
    likeRate: safeNumber(competitor.likeRate ?? competitor.rates?.likeRate ?? calculated.likeRate),
    commentRate: safeNumber(
      competitor.commentRate ?? competitor.rates?.commentRate ?? calculated.commentRate
    ),
    shareRate: safeNumber(competitor.shareRate ?? competitor.rates?.shareRate ?? calculated.shareRate),
    saveRate: safeNumber(competitor.saveRate ?? competitor.rates?.saveRate ?? calculated.saveRate),
    followerRate: safeNumber(
      competitor.followerRate ?? competitor.rates?.followerRate ?? calculated.followerRate
    ),
    completionRate: safeNumber(
      competitor.completionRate ?? parsePercentText(competitor.completion_rate)
    ),
    completionRate5s: safeNumber(
      competitor.completionRate5s ?? parsePercentText(competitor.completion_rate_5s)
    ),
    bounceRate2s: safeNumber(
      competitor.bounceRate2s ?? parsePercentText(competitor.bounce_rate_2s)
    ),
  }
}

function resolveWinner(valueA: number, valueB: number, lowerIsBetter: boolean) {
  if (valueA === valueB) {
    return "tie" as const
  }

  if (lowerIsBetter) {
    return valueA < valueB ? "a" : "b"
  }

  return valueA > valueB ? "a" : "b"
}

function getSplitWidths(valueA: number, valueB: number) {
  const total = valueA + valueB

  if (total <= 0) {
    return { a: 50, b: 50 }
  }

  return {
    a: (valueA / total) * 100,
    b: (valueB / total) * 100,
  }
}

function getSummaryText(mode: PKBattleMode, winsA: number, winsB: number) {
  if (mode === "vsTeam") {
    return `个人胜出 ${winsA} 项 / 团队均值胜出 ${winsB} 项`
  }

  return `A 胜出 ${winsA} 项 / B 胜出 ${winsB} 项`
}

function PKBattleRow({
  item,
  leftName,
  rightName,
  index,
}: {
  item: ResolvedBattleValue
  leftName: string
  rightName: string
  index: number
}) {
  const widths = getSplitWidths(item.valueA, item.valueB)
  const leftWinner = item.winner === "a"
  const rightWinner = item.winner === "b"
  const isTie = item.winner === "tie"

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, delay: index * 0.04, ease: "easeOut" }}
      className="space-y-3 rounded-2xl border border-white/70 bg-white/75 p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] backdrop-blur dark:border-white/10 dark:bg-white/5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground tabular-nums">{item.label}</span>
          <motion.span
            key={item.winner}
            initial={{ opacity: 0, scale: 0.88 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 280, damping: 22 }}
            className={cn(
              "rounded-full border px-2 py-0.5 text-[11px] font-semibold tabular-nums",
              leftWinner && "border-primary/25 bg-primary/12 text-primary",
              rightWinner && "border-slate-300/80 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-200",
              isTie && "border-border bg-background/80 text-muted-foreground"
            )}
          >
            {isTie ? "平局" : leftWinner ? `${leftName}领先` : `${rightName}领先`}
          </motion.span>
        </div>
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {item.lowerIsBetter ? "低者胜" : "高者胜"}
        </span>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
        <div className="text-right">
          <div className="text-[11px] text-muted-foreground">{leftName}</div>
          <div className="text-sm font-semibold text-foreground tabular-nums">
            {formatMetricValue(item.valueA, item.precision, item.suffix)}
          </div>
        </div>

        <div className="relative flex h-3 w-32 overflow-hidden rounded-full bg-slate-200/75 dark:bg-slate-800/80 sm:w-40">
          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.42, delay: index * 0.05, ease: [0.22, 1, 0.36, 1] }}
            className={cn(
              "absolute right-1/2 top-0 h-full origin-right rounded-l-full",
              leftWinner ? "bg-primary" : "bg-slate-400/70 dark:bg-slate-600"
            )}
            style={{ width: `${widths.a}%` }}
          />
          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.42, delay: index * 0.05 + 0.03, ease: [0.22, 1, 0.36, 1] }}
            className={cn(
              "absolute left-1/2 top-0 h-full origin-left rounded-r-full",
              rightWinner ? "bg-primary" : "bg-slate-300/80 dark:bg-slate-700"
            )}
            style={{ width: `${widths.b}%` }}
          />
          <div className="absolute left-1/2 top-1/2 h-4 w-px -translate-x-1/2 -translate-y-1/2 bg-white/85 dark:bg-slate-100/60" />
        </div>

        <div>
          <div className="text-[11px] text-muted-foreground">{rightName}</div>
          <div className="text-sm font-semibold text-foreground tabular-nums">
            {formatMetricValue(item.valueB, item.precision, item.suffix)}
          </div>
        </div>
      </div>
    </motion.div>
  )
}

export function PKBattle({
  mode,
  playerA,
  playerB,
  teamAvg,
  dimensions,
  className,
}: PKBattleProps) {
  const competitorB = mode === "vsTeam" ? teamAvg : playerB

  if (mode === "multi") {
    return (
      <Card
        className={cn(
          "card-elevated relative overflow-hidden rounded-[16px] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.92))] shadow-[0_20px_50px_-32px_rgba(15,23,42,0.28)] backdrop-blur dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.82),rgba(15,23,42,0.68))]",
          className
        )}
      >
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-br from-primary/12 via-transparent to-transparent blur-2xl" />
        <CardHeader className="relative gap-2 border-b border-border/70 pb-5">
          <CardTitle className="text-[15px] font-semibold tracking-[0.01em] text-foreground sm:text-base">
            PK Battle
          </CardTitle>
          <CardDescription>多方对比模式预留中，后续可继续扩展多选对战逻辑。</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  if (!competitorB) {
    return (
      <Card
        className={cn(
          "card-elevated relative overflow-hidden rounded-[16px] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.92))] shadow-[0_20px_50px_-32px_rgba(15,23,42,0.28)] backdrop-blur dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.82),rgba(15,23,42,0.68))]",
          className
        )}
      >
        <CardHeader className="relative gap-2 border-b border-border/70 pb-5">
          <CardTitle className="text-[15px] font-semibold tracking-[0.01em] text-foreground sm:text-base">
            PK Battle
          </CardTitle>
          <CardDescription>当前模式缺少对手数据，暂时无法生成对战结果。</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  const playerARates = getCompetitorRates(playerA)
  const playerBRates = getCompetitorRates(competitorB)

  const rows = dimensions.map<ResolvedBattleValue>((key) => {
    const config = dimensionConfig[key]
    const valueA = playerARates[key]
    const valueB = playerBRates[key]

    return {
      key,
      label: config.label,
      valueA,
      valueB,
      precision: config.precision,
      suffix: config.suffix,
      lowerIsBetter: Boolean(config.lowerIsBetter),
      winner: resolveWinner(valueA, valueB, Boolean(config.lowerIsBetter)),
    }
  })

  const winsA = rows.filter((item) => item.winner === "a").length
  const winsB = rows.filter((item) => item.winner === "b").length
  const leftName = playerA.label ?? playerA.name
  const rightName = competitorB.label ?? competitorB.name
  const battleKey = `${mode}-${playerA.id}-${competitorB.id}`

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={battleKey}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.24, ease: "easeOut" }}
      >
        <Card
          className={cn(
            "card-elevated relative overflow-hidden rounded-[16px] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.92))] shadow-[0_20px_50px_-32px_rgba(15,23,42,0.28)] backdrop-blur dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.82),rgba(15,23,42,0.68))]",
            className
          )}
        >
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-br from-primary/12 via-transparent to-transparent blur-2xl" />

          <CardHeader className="relative gap-3 border-b border-border/70 pb-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1.5">
                <CardTitle className="text-[15px] font-semibold tracking-[0.01em] text-foreground sm:text-base">
                  {mode === "vsTeam" ? "个人 vs 团队均值" : "个人 vs 个人"}
                </CardTitle>
                <CardDescription className="text-sm text-muted-foreground">
                  围绕核心转化与留存指标，快速看清当前胜负面。
                </CardDescription>
              </div>

              <div className="rounded-full border border-white/70 bg-white/70 px-3 py-1 text-xs font-semibold text-foreground tabular-nums shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:border-white/10 dark:bg-white/10">
                {getSummaryText(mode, winsA, winsB)}
              </div>
            </div>
          </CardHeader>

          <CardContent className="relative space-y-3 pt-5">
            {rows.length > 0 ? (
              rows.map((item, index) => (
                <PKBattleRow
                  key={item.key}
                  item={item}
                  leftName={leftName}
                  rightName={rightName}
                  index={index}
                />
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-border/80 bg-background/70 px-4 py-6 text-sm text-muted-foreground">
                暂无可展示的对比维度。
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </AnimatePresence>
  )
}
