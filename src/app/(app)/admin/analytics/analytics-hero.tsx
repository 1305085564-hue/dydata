"use client"

import { useMemo } from "react"
import { PlayCircle, TrendingUp, Users, CheckCircle2 } from "lucide-react"

interface Report {
  play_count: number | null
  completion_rate: string | null
  id: string
}

interface AnalyticsHeroProps {
  reports: Report[]
}

export function AnalyticsHero({ reports }: AnalyticsHeroProps) {
  const stats = useMemo(() => {
    let totalPlays = 0
    let totalCompletionSum = 0
    let videosWithCompletion = 0
    let hitsCount = 0

    reports.forEach(r => {
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

    const avgCompletion = videosWithCompletion > 0 
      ? (totalCompletionSum / videosWithCompletion).toFixed(1) 
      : "0.0"

    const hitRate = reports.length > 0 
      ? ((hitsCount / reports.length) * 100).toFixed(1) 
      : "0.0"

    return {
      videoCount: reports.length,
      totalPlays,
      hitRate,
      avgCompletion
    }
  }, [reports])

  function formatNumber(num: number) {
    if (num >= 100000000) return `${(num / 100000000).toFixed(2)}亿`
    if (num >= 10000) return `${(num / 10000).toFixed(1)}w`
    return num.toLocaleString()
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      {/* 视频总数 */}
      <div className="rounded-[24px] border border-white/60 bg-[linear-gradient(145deg,rgba(255,255,255,0.9),rgba(248,250,252,0.7))] p-6 shadow-sm backdrop-blur-xl relative overflow-hidden group hover:shadow-md transition-shadow">
        <div className="absolute -right-4 -top-4 size-24 rounded-full bg-blue-50 opacity-50 blur-xl group-hover:bg-blue-100 transition-colors"></div>
        <div className="relative z-10 flex items-start justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-1">总视频数</p>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-slate-800">{stats.videoCount}</span>
              <span className="text-sm font-medium text-slate-400">个</span>
            </div>
          </div>
          <div className="flex size-10 items-center justify-center rounded-xl bg-blue-50 text-blue-500">
            <PlayCircle className="size-5" />
          </div>
        </div>
      </div>

      {/* 总播放量 */}
      <div className="rounded-[24px] border border-white/60 bg-[linear-gradient(145deg,rgba(255,255,255,0.9),rgba(248,250,252,0.7))] p-6 shadow-sm backdrop-blur-xl relative overflow-hidden group hover:shadow-md transition-shadow">
        <div className="absolute -right-4 -top-4 size-24 rounded-full bg-emerald-50 opacity-50 blur-xl group-hover:bg-emerald-100 transition-colors"></div>
        <div className="relative z-10 flex items-start justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-1">总播放量</p>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-slate-800">{formatNumber(stats.totalPlays)}</span>
            </div>
          </div>
          <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-500">
            <Users className="size-5" />
          </div>
        </div>
      </div>

      {/* 爆款率 */}
      <div className="rounded-[24px] border border-white/60 bg-[linear-gradient(145deg,rgba(255,255,255,0.9),rgba(248,250,252,0.7))] p-6 shadow-sm backdrop-blur-xl relative overflow-hidden group hover:shadow-md transition-shadow">
        <div className="absolute -right-4 -top-4 size-24 rounded-full bg-rose-50 opacity-50 blur-xl group-hover:bg-rose-100 transition-colors"></div>
        <div className="relative z-10 flex items-start justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-1">大盘爆款率 (&gt;10w)</p>
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-black text-slate-800">{stats.hitRate}</span>
              <span className="text-xl font-bold text-slate-500">%</span>
            </div>
          </div>
          <div className="flex size-10 items-center justify-center rounded-xl bg-rose-50 text-rose-500">
            <TrendingUp className="size-5" />
          </div>
        </div>
      </div>

      {/* 平均完播率 */}
      <div className="rounded-[24px] border border-white/60 bg-[linear-gradient(145deg,rgba(255,255,255,0.9),rgba(248,250,252,0.7))] p-6 shadow-sm backdrop-blur-xl relative overflow-hidden group hover:shadow-md transition-shadow">
        <div className="absolute -right-4 -top-4 size-24 rounded-full bg-amber-50 opacity-50 blur-xl group-hover:bg-amber-100 transition-colors"></div>
        <div className="relative z-10 flex items-start justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-1">平均完播率</p>
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-black text-slate-800">{stats.avgCompletion}</span>
              <span className="text-xl font-bold text-slate-500">%</span>
            </div>
          </div>
          <div className="flex size-10 items-center justify-center rounded-xl bg-amber-50 text-amber-500">
            <CheckCircle2 className="size-5" />
          </div>
        </div>
      </div>
    </div>
  )
}
