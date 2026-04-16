"use client"

import { useMemo } from "react"
import { PlayCircle, TrendingUp, TrendingDown, Minus, Users, CheckCircle2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface Report {
  play_count: number | null
  completion_rate: string | null
  report_date: string
  id: string
}

interface AnalyticsHeroProps {
  reports: Report[]
  rangeFrom: string
  rangeTo: string
}

function calcPeriodStats(rows: Report[]) {
  let totalPlays = 0
  let totalCompletionSum = 0
  let videosWithCompletion = 0
  let hitsCount = 0

  rows.forEach(r => {
    const plays = r.play_count || 0
    totalPlays += plays
    if (plays >= 100000) hitsCount++
    if (r.completion_rate) {
      const rate = parseFloat(r.completion_rate.replace('%', ''))
      if (!isNaN(rate)) {
        totalCompletionSum += rate
        videosWithCompletion++
      }
    }
  })

  return {
    videoCount: rows.length,
    totalPlays,
    hitRate: rows.length > 0 ? (hitsCount / rows.length) * 100 : 0,
    avgCompletion: videosWithCompletion > 0 ? totalCompletionSum / videosWithCompletion : 0,
  }
}

export function AnalyticsHero({ reports, rangeFrom, rangeTo }: AnalyticsHeroProps) {
  const { current, prev } = useMemo(() => {
    const from = new Date(rangeFrom)
    const to = new Date(rangeTo)
    const days = Math.round((to.getTime() - from.getTime()) / 86400000) + 1
    const prevFrom = new Date(from)
    prevFrom.setDate(prevFrom.getDate() - days)
    const prevTo = new Date(from)
    prevTo.setDate(prevTo.getDate() - 1)
    const prevFromStr = prevFrom.toISOString().split("T")[0]
    const prevToStr = prevTo.toISOString().split("T")[0]

    const currentReports = reports.filter(r => r.report_date >= rangeFrom && r.report_date <= rangeTo)
    const prevReports = reports.filter(r => r.report_date >= prevFromStr && r.report_date <= prevToStr)

    return { current: calcPeriodStats(currentReports), prev: calcPeriodStats(prevReports) }
  }, [reports, rangeFrom, rangeTo])

  function formatNumber(num: number) {
    if (num >= 100000000) return `${(num / 100000000).toFixed(2)}亿`
    if (num >= 10000) return `${(num / 10000).toFixed(1)}w`
    return num.toLocaleString()
  }

  const cards: { label: string; value: string; suffix?: string; icon: typeof PlayCircle; color: string; bgColor: string; currentVal: number; prevVal: number }[] = [
    { label: "总视频数", value: String(current.videoCount), suffix: "个", icon: PlayCircle, color: "blue", bgColor: "bg-blue-50", currentVal: current.videoCount, prevVal: prev.videoCount },
    { label: "总播放量", value: formatNumber(current.totalPlays), icon: Users, color: "emerald", bgColor: "bg-emerald-50", currentVal: current.totalPlays, prevVal: prev.totalPlays },
    { label: "大盘爆款率 (>10w)", value: current.hitRate.toFixed(1), suffix: "%", icon: TrendingUp, color: "rose", bgColor: "bg-rose-50", currentVal: current.hitRate, prevVal: prev.hitRate },
    { label: "平均完播率", value: current.avgCompletion.toFixed(1), suffix: "%", icon: CheckCircle2, color: "amber", bgColor: "bg-amber-50", currentVal: current.avgCompletion, prevVal: prev.avgCompletion },
  ]

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      {cards.map((card) => {
        const diff = card.prevVal > 0 ? ((card.currentVal - card.prevVal) / card.prevVal) * 100 : 0
        const hasPrev = card.prevVal > 0
        const isUp = diff > 0
        const isDown = diff < 0
        const Icon = card.icon

        return (
          <div key={card.label} className="rounded-[24px] border border-white/60 bg-[linear-gradient(145deg,rgba(255,255,255,0.9),rgba(248,250,252,0.7))] p-6 shadow-sm backdrop-blur-xl relative overflow-hidden group hover:shadow-md transition-shadow">
            <div className={cn("absolute -right-4 -top-4 size-24 rounded-full opacity-50 blur-xl transition-colors", card.bgColor, `group-hover:opacity-70`)} />
            <div className="relative z-10 flex items-start justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-1">{card.label}</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-black text-slate-800">{card.value}</span>
                  {card.suffix && <span className="text-xl font-bold text-slate-500">{card.suffix === "个" ? <span className="text-sm font-medium text-slate-400">{card.suffix}</span> : card.suffix}</span>}
                </div>
                {hasPrev && (
                  <div className={cn("mt-2 flex items-center gap-1 text-xs font-semibold", isUp ? "text-emerald-600" : isDown ? "text-rose-600" : "text-slate-400")}>
                    {isUp ? <TrendingUp className="size-3.5" /> : isDown ? <TrendingDown className="size-3.5" /> : <Minus className="size-3.5" />}
                    <span>{isUp ? "+" : ""}{diff.toFixed(1)}%</span>
                    <span className="font-normal text-slate-400">环比</span>
                  </div>
                )}
              </div>
              <div className={cn("flex size-10 items-center justify-center rounded-xl", card.bgColor, `text-${card.color}-500`)}>
                <Icon className="size-5" />
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
