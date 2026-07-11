"use client";

import { useEffect, useState } from "react";
import { Activity } from "lucide-react";

interface AuditLog {
  id: string;
  action: string;
  profile_name?: string;
  target?: string;
  created_at: string;
  [key: string]: unknown;
}

interface SystemLogTickerProps {
  logs: AuditLog[];
}

export function SystemLogTicker({ logs }: SystemLogTickerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (!logs || logs.length === 0) return;
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % Math.min(logs.length, 10)); // 循环最近10条
    }, 4000); // 4秒一换
    return () => clearInterval(interval);
  }, [logs]);

  if (!logs || logs.length === 0) return null;

  const currentLog = logs[currentIndex];
  
  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-stone-200 px-4 py-2 text-[12px] flex justify-center overflow-hidden h-9">
      <div className="max-w-[80rem] w-full flex items-center justify-between">
        <div className="flex items-center gap-2 text-stone-500">
          <Activity className="size-3.5 text-[#D97757] stroke-[1.5]" />
          <span className="font-medium">全局动态流</span>
        </div>

        <div
          key={currentIndex}
          className="flex-1 ml-4 text-right animate-in slide-in-from-bottom-2 fade-in duration-500 ease-out flex justify-end items-center gap-2"
        >
          <span className="font-medium text-stone-900">{currentLog.profile_name || "系统"}</span>
          <span className="text-stone-500">{currentLog.action}</span>
          {currentLog.target && <span className="text-stone-500 truncate max-w-[200px]">({currentLog.target})</span>}
          <span className="text-[12px] text-stone-500 ml-2 bg-stone-100 px-1.5 py-0.5 rounded-full tabular-nums">
            {new Date(currentLog.created_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      </div>
    </div>
  );
}
