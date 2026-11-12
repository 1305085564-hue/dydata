"use client";

import * as React from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetBody } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { RotateCw, X, Zap, Clock, CheckCircle2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export type OcrSpeedLogItem = {
  id: string;
  created_at: string;
  duration_ms: number;
  ocr_ms: number | null;
  download_ms: number | null;
  channel_name: string | null;
  model_id: string | null;
  screenshot_type: "data" | "retention" | null;
  is_success: boolean;
  error_code: string | null;
};

export type OcrSpeedSummary = {
  total_count_90d: number;
  recent_sample_size: number;
  recent_1000_avg_ms: number | null;
  recent_1000_fastest_ms: number | null;
  recent_1000_slowest_ms: number | null;
  recent_1000_success_rate: number | null;
};

interface OcrSpeedDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function formatShanghaiDateTime(isoString: string): { time: string; date: string } {
  try {
    const d = new Date(isoString);
    const timeFormatter = new Intl.DateTimeFormat("zh-CN", {
      timeZone: "Asia/Shanghai",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    return {
      time: timeFormatter.format(d),
      date: dateFormatter.format(d),
    };
  } catch {
    return { time: "—", date: "—" };
  }
}

function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function renderSpeedBadge(durationMs: number, isSuccess: boolean) {
  if (!isSuccess) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] font-normal bg-[#F7EAEA] text-[#1F1E1D]">
        <span className="size-1.5 rounded-full bg-[#C0685C]" />
        失败
      </span>
    );
  }

  if (durationMs < 5000) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] font-normal bg-[#F0F6F2] text-[#4B6B4E]">
        <span className="size-1.5 rounded-full bg-[#6FAA7D]" />
        极速 ({formatDuration(durationMs)})
      </span>
    );
  }

  if (durationMs <= 10000) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] font-normal bg-[#EEF2F5] text-[#43718E]">
        <span className="size-1.5 rounded-full bg-[#43718E]" />
        正常 ({formatDuration(durationMs)})
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] font-normal bg-[#F7F3ED] text-[#8A6A2F]">
      <span className="size-1.5 rounded-full bg-[#B98A54]" />
      缓慢 ({formatDuration(durationMs)})
    </span>
  );
}

export function OcrSpeedDrawer({ open, onOpenChange }: OcrSpeedDrawerProps) {
  const [loading, setLoading] = React.useState(false);
  const [summary, setSummary] = React.useState<OcrSpeedSummary | null>(null);
  const [logs, setLogs] = React.useState<OcrSpeedLogItem[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  const fetchLogs = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/ai-config/ocr-logs", {
        headers: { "cache-control": "no-store" },
      });
      if (!res.ok) {
        throw new Error("加载测速数据失败");
      }
      const data = await res.json();
      setSummary(data.summary ?? null);
      setLogs(data.logs ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "获取数据失败");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (open) {
      fetchLogs();
    }
  }, [open, fetchLogs]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="w-full max-w-2xl gap-0 border-l border-[#E2E2DF] bg-white transition-transform duration-150 p-0 flex flex-col shadow-claude-dialog"
      >
        {/* 抽屉头部 */}
        <SheetHeader className="border-b border-[#E2E2DF] px-6 py-4 flex items-center justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <SheetTitle className="font-normal text-[20px] text-[#141413]">
                截图识别测速台账
              </SheetTitle>
              <span className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[12px] font-normal bg-[#EEF2F5] text-[#43718E]">
                保留最近90天
              </span>
            </div>
            <SheetDescription className="mt-0.5 text-[12px] text-[#78716C]">
              统计口径统一为最近 1000 次识别样本，明细展示最近 100 笔真实调用流水（上海时区）
            </SheetDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon-s"
              onClick={fetchLogs}
              disabled={loading}
              className="size-7 rounded-md text-[#78716C] hover:text-[#141413] hover:bg-[#EBEBE9]"
              title="刷新最新数据"
            >
              <RotateCw className={cn("size-3.5", loading && "animate-spin")} />
            </Button>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label="关闭"
              className="size-7 shrink-0 rounded-md flex items-center justify-center text-[#78716C] hover:text-[#141413] hover:bg-[#EBEBE9] transition-colors cursor-pointer"
            >
              <X className="size-4" />
            </button>
          </div>
        </SheetHeader>

        {/* 抽屉内容区 */}
        <SheetBody className="p-6 space-y-5 bg-[#FCFCFB]">
          {/* 1. 摘要三卡片（最近 1000 次样本） */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-[#E2E2DF] bg-white p-3.5 shadow-card-ring">
              <div className="flex items-center gap-1 text-[12px] text-[#78716C]">
                <Clock className="size-3.5 text-[#43718E]" />
                <span>最近 1000 次平均</span>
              </div>
              <div className="mt-1 font-normal text-[20px] text-[#141413]">
                {summary?.recent_1000_avg_ms != null
                  ? formatDuration(summary.recent_1000_avg_ms)
                  : "—"}
              </div>
              <div className="mt-1 text-[12px] text-[#78716C]">
                样本数：{summary?.recent_sample_size ?? 0} 条
              </div>
            </div>

            <div className="rounded-xl border border-[#E2E2DF] bg-white p-3.5 shadow-card-ring">
              <div className="flex items-center gap-1 text-[12px] text-[#78716C]">
                <Zap className="size-3.5 text-[#B98A54]" />
                <span>极值区间 (最快 / 最慢)</span>
              </div>
              <div className="mt-1 font-normal text-[20px] text-[#141413]">
                {summary?.recent_1000_fastest_ms != null && summary?.recent_1000_slowest_ms != null
                  ? `${formatDuration(summary.recent_1000_fastest_ms)} / ${formatDuration(summary.recent_1000_slowest_ms)}`
                  : "—"}
              </div>
              <div className="mt-1 text-[12px] text-[#78716C]">
                最近 1000 次范围内
              </div>
            </div>

            <div className="rounded-xl border border-[#E2E2DF] bg-white p-3.5 shadow-card-ring">
              <div className="flex items-center gap-1 text-[12px] text-[#78716C]">
                <CheckCircle2 className="size-3.5 text-[#6FAA7D]" />
                <span>成功率 (最近 1000 次)</span>
              </div>
              <div className="mt-1 font-normal text-[20px] text-[#141413]">
                {summary?.recent_1000_success_rate != null
                  ? `${(summary.recent_1000_success_rate * 100).toFixed(1)}%`
                  : "—"}
              </div>
              <div className="mt-1 text-[12px] text-[#78716C]">
                90天总量：{summary?.total_count_90d ?? 0} 次
              </div>
            </div>
          </div>

          {/* 2. 明细流水（高密度 13px） */}
          <div className="rounded-xl border border-[#E2E2DF] bg-white shadow-card-ring overflow-hidden">
            <div className="px-4 py-3 border-b border-[#E2E2DF] flex items-center justify-between">
              <span className="font-normal text-[14px] text-[#141413]">
                最近 100 笔识别流水
              </span>
              <span className="text-[12px] text-[#78716C]">
                按时间倒序排列（Asia/Shanghai）
              </span>
            </div>

            {error ? (
              <div className="p-8 text-center text-[13px] text-[#1F1E1D]">
                <AlertCircle className="size-4 mx-auto mb-2 text-[#C0685C]" />
                <span>{error}</span>
              </div>
            ) : logs.length === 0 ? (
              <div className="p-8 text-center text-[12px] text-[#A8A29E]">
                {loading ? "正在加载测速台账..." : "暂无识别记录"}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[13px]">
                  <thead>
                    <tr className="border-b border-[#E2E2DF] bg-[#FCFCFB] text-[12px] text-[#78716C]">
                      <th className="py-2.5 pl-4 pr-2 font-medium">时间</th>
                      <th className="py-2.5 px-2 font-medium">耗时</th>
                      <th className="py-2.5 px-2 font-medium">渠道与模型</th>
                      <th className="py-2.5 px-2 font-medium">类型</th>
                      <th className="py-2.5 pr-4 pl-2 font-medium text-right">状态</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E2DF]/60">
                    {logs.map((item) => {
                      const { time, date } = formatShanghaiDateTime(item.created_at);
                      // 按独立单词 max 命中（如 "api9 claude (max)"），避免误标 MiniMax 等含 max 子串的渠道
                      const isMax = /\bmax\b/i.test(item.channel_name ?? "");
                      return (
                        <tr key={item.id} className="hover:bg-[#F7F7F6]/60 transition-colors">
                          <td className="py-2.5 pl-4 pr-2 whitespace-nowrap">
                            <div className="text-[13px] text-[#141413]">{time}</div>
                            <div className="text-[12px] text-[#78716C]">{date}</div>
                          </td>
                          <td className="py-2.5 px-2 whitespace-nowrap">
                            {renderSpeedBadge(item.duration_ms, item.is_success)}
                            {item.ocr_ms != null && (
                              <div className="text-[12px] text-[#78716C] mt-0.5">
                                纯识别: {formatDuration(item.ocr_ms)}
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 px-2">
                            <div className="flex items-center gap-1 flex-wrap">
                              <span className="text-[13px] text-[#141413]">
                                {item.channel_name || "—"}
                              </span>
                              {isMax && (
                                <span className="inline-flex items-center rounded-xs px-1 text-[12px] font-normal bg-[#EEF2F5] text-[#43718E]">
                                  MAX
                                </span>
                              )}
                            </div>
                            <div className="text-[12px] text-[#78716C] mt-0.5">
                              {item.model_id || "未指定模型"}
                            </div>
                          </td>
                          <td className="py-2.5 px-2 whitespace-nowrap text-[12px] text-[#78716C]">
                            {item.screenshot_type === "retention"
                              ? "完播留存图"
                              : item.screenshot_type === "data"
                              ? "互动数据图"
                              : "未标记"}
                          </td>
                          <td className="py-2.5 pr-4 pl-2 whitespace-nowrap text-right">
                            {item.is_success ? (
                              <span className="text-[12px] text-[#4B6B4E]">成功</span>
                            ) : (
                              <span className="text-[12px] text-[#1F1E1D]" title={item.error_code ?? "识别失败"}>
                                {item.error_code || "失败"}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
