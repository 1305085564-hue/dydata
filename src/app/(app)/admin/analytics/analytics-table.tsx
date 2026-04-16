"use client"

import { useState } from "react"
import { ChevronDown, ChevronUp, ArrowUpDown, TrendingUp } from "lucide-react"
import { cn } from "@/lib/utils"

interface AnalyticsTableProps {
  videos: any[]
}

type SortField = 'play_count' | 'completion_rate' | 'engagement' | 'published_at'
type SortOrder = 'asc' | 'desc'

export function AnalyticsTable({ videos }: AnalyticsTableProps) {
  const [sortField, setSortField] = useState<SortField>('published_at')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')

  // Calculate engagement and handle sorting
  const sortedVideos = [...videos].map(v => {
    return {
      ...v,
      engagement: (v.likes || 0) + (v.comments || 0) + (v.shares || 0) + (v.favorites || 0)
    }
  }).sort((a, b) => {
    let valA, valB
    
    if (sortField === 'play_count') {
      valA = a.play_count || 0
      valB = b.play_count || 0
    } else if (sortField === 'completion_rate') {
      valA = parseFloat(a.completion_rate?.replace('%', '') || '0')
      valB = parseFloat(b.completion_rate?.replace('%', '') || '0')
    } else if (sortField === 'engagement') {
      valA = a.engagement
      valB = b.engagement
    } else {
      valA = new Date(a.published_at || 0).getTime()
      valB = new Date(b.published_at || 0).getTime()
    }
    
    if (valA < valB) return sortOrder === 'asc' ? -1 : 1
    if (valA > valB) return sortOrder === 'asc' ? 1 : -1
    return 0
  })

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortOrder('desc')
    }
  }

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="ml-1.5 h-3.5 w-3.5 opacity-40 group-hover:opacity-100 transition-opacity" />
    return sortOrder === 'asc' 
      ? <ChevronUp className="ml-1.5 h-3.5 w-3.5 text-blue-600" />
      : <ChevronDown className="ml-1.5 h-3.5 w-3.5 text-blue-600" />
  }

  return (
    <div className="rounded-[32px] border border-white/60 bg-[linear-gradient(145deg,rgba(255,255,255,0.9),rgba(248,250,252,0.7))] shadow-[0_8px_30px_rgba(0,0,0,0.04)] backdrop-blur-xl overflow-hidden mt-8">
      <div className="px-8 py-6 border-b border-slate-100/50 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex size-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-500 font-black">
            6
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-[var(--color-text-primary)]">
            视频表现明细
          </h2>
        </div>
      </div>
      
      <div className="max-h-[500px] overflow-y-auto px-4 pb-4 custom-scrollbar">
        <table className="w-full text-left text-sm border-separate border-spacing-y-2">
          <thead className="sticky top-0 bg-[rgba(248,250,252,0.95)] backdrop-blur-md z-10">
            <tr>
              <th className="py-4 px-4 font-semibold text-slate-500 rounded-l-xl">标题</th>
              <th className="py-4 px-4 font-semibold text-slate-500">发布人</th>
              <th 
                className="py-4 px-4 font-semibold text-slate-500 cursor-pointer group whitespace-nowrap"
                onClick={() => toggleSort('published_at')}
              >
                <div className="flex items-center">发布时间 <SortIcon field="published_at" /></div>
              </th>
              <th 
                className="py-4 px-4 font-semibold text-slate-500 cursor-pointer group whitespace-nowrap"
                onClick={() => toggleSort('play_count')}
              >
                <div className="flex items-center">播放量 <SortIcon field="play_count" /></div>
              </th>
              <th 
                className="py-4 px-4 font-semibold text-slate-500 cursor-pointer group whitespace-nowrap"
                onClick={() => toggleSort('completion_rate')}
              >
                <div className="flex items-center">完播率 <SortIcon field="completion_rate" /></div>
              </th>
              <th 
                className="py-4 px-4 font-semibold text-slate-500 cursor-pointer group rounded-r-xl whitespace-nowrap"
                onClick={() => toggleSort('engagement')}
              >
                <div className="flex items-center">总互动 <SortIcon field="engagement" /></div>
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedVideos.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-12 text-center text-slate-500">
                  暂无视频数据
                </td>
              </tr>
            ) : (
              sortedVideos.map((video) => {
                const isHit = (video.play_count || 0) >= 100000;
                
                return (
                  <tr 
                    key={video.id} 
                    className={cn(
                      "group transition-all hover:-translate-y-[1px] hover:shadow-sm",
                      isHit 
                        ? "bg-rose-50/60 hover:bg-rose-50 border border-rose-100" 
                        : "bg-white hover:bg-slate-50 border border-transparent"
                    )}
                  >
                    <td className="py-4 px-4 rounded-l-xl border-y border-l border-transparent group-hover:border-slate-100 transition-colors">
                      <div className="flex items-start gap-3">
                        {video.cover_url && (
                          <div className="h-12 w-9 rounded overflow-hidden bg-slate-100 shrink-0">
                            <img src={video.cover_url} alt="" className="h-full w-full object-cover" />
                          </div>
                        )}
                        <div>
                          <p className="font-medium text-slate-800 line-clamp-2 leading-tight">
                            {video.title || "无标题视频"}
                          </p>
                          {isHit && (
                            <span className="inline-flex items-center mt-1.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-600">
                              <TrendingUp className="w-3 h-3 mr-1" />
                              爆款
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-4 border-y border-transparent group-hover:border-slate-100 transition-colors">
                      <span className="inline-flex items-center px-2 py-1 rounded-md bg-slate-100 text-slate-600 text-xs font-medium">
                        {video.profiles?.name || "未知"}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-slate-500 whitespace-nowrap border-y border-transparent group-hover:border-slate-100 transition-colors">
                      {video.published_at ? new Date(video.published_at).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : "-"}
                    </td>
                    <td className="py-4 px-4 border-y border-transparent group-hover:border-slate-100 transition-colors">
                      <div className={cn(
                        "font-bold font-mono",
                        isHit ? "text-rose-600" : "text-slate-700"
                      )}>
                        {video.play_count ? video.play_count.toLocaleString() : "-"}
                      </div>
                    </td>
                    <td className="py-4 px-4 border-y border-transparent group-hover:border-slate-100 transition-colors">
                      <div className={cn(
                        "font-medium",
                        parseFloat(video.completion_rate?.replace('%', '') || '0') >= 30 ? "text-emerald-600" : "text-slate-600"
                      )}>
                        {video.completion_rate || "-"}
                      </div>
                    </td>
                    <td className="py-4 px-4 rounded-r-xl border-y border-r border-transparent group-hover:border-slate-100 transition-colors">
                      <div className="font-medium text-slate-700">
                        {video.engagement.toLocaleString()}
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background-color: rgba(148, 163, 184, 0.3);
          border-radius: 20px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background-color: rgba(148, 163, 184, 0.5);
        }
      `}</style>
    </div>
  )
}
