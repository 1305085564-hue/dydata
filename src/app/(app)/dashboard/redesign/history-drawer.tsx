"use client";

import { useState } from "react";
import { X, Filter, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TodayReport } from "./types";

interface HistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  history: TodayReport[];
  accountDisplayNameMap: Record<string, string>;
  onEditReport: (report: TodayReport) => void;
}

/**
 * 历史记录抽屉 - 侧滑展示历史数据
 * 支持筛选、分页、编辑
 */
export function HistoryDrawer({
  isOpen,
  onClose,
  history,
  accountDisplayNameMap,
  onEditReport,
}: HistoryDrawerProps) {
  const [selectedAccountId, setSelectedAccountId] = useState<string>("all");
  const [selectedMonth, setSelectedMonth] = useState<string>("all");
  const [expanded, setExpanded] = useState(false);

  // 账号选项
  const accountOptions = Array.from(
    new Set(history.map((h) => h.account_id).filter(Boolean))
  ).map((id) => ({
    id,
    name: accountDisplayNameMap[id] || id,
  }));

  // 月份选项
  const monthOptions = Array.from(
    new Set(
      history
        .map((h) => (h.report_date ? h.report_date.slice(0, 7) : null))
        .filter((m): m is string => Boolean(m))
    )
  ).sort()
    .reverse();

  // 筛选后的数据
  const filteredHistory = history.filter((report) => {
    if (
      selectedAccountId !== "all" &&
      report.account_id !== selectedAccountId
    ) {
      return false;
    }
    if (
      selectedMonth !== "all" &&
      (!report.report_date || !report.report_date.startsWith(selectedMonth))
    ) {
      return false;
    }
    return true;
  });

  const visible = expanded ? filteredHistory : filteredHistory.slice(0, 10);
  const hasMore = filteredHistory.length > 10;

  if (!isOpen) return null;

  return (
    <>
      {/* 遮罩 */}
      <div
        className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* 抽屉 */}
      <div className="fixed right-0 top-0 z-50 h-full w-full max-w-2xl bg-white shadow-claude-dialog animate-in slide-in-from-right duration-300">
        <div className="flex h-full flex-col">
          {/* 头部 */}
          <div className="flex items-center justify-between border-b border-[#ECE7DE]/80 px-6 py-4">
            <h2 className="text-lg font-semibold text-[#1C1917]">历史记录</h2>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-[#78716C] transition-colors hover:bg-[#F5F3EE] hover:text-[#1C1917]"
            >
              <X size={20} />
            </button>
          </div>

          {/* 筛选栏 */}
          <div className="border-b border-[#ECE7DE]/80 px-6 py-4">
            <div className="flex items-center gap-3">
              <Filter size={14} className="text-[#78716C]" />
              <select
                value={selectedAccountId}
                onChange={(e) => {
                  setSelectedAccountId(e.target.value);
                  setExpanded(false);
                }}
                className="rounded-lg border border-[#E5E0D6] bg-white px-3 py-1.5 text-sm text-[#292524] transition-all focus-visible:border-[#78716C] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#D97757]/25"
              >
                <option value="all">全部账号</option>
                {accountOptions.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name}
                  </option>
                ))}
              </select>

              <select
                value={selectedMonth}
                onChange={(e) => {
                  setSelectedMonth(e.target.value);
                  setExpanded(false);
                }}
                className="rounded-lg border border-[#E5E0D6] bg-white px-3 py-1.5 text-sm text-[#292524] transition-all focus-visible:border-[#78716C] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#D97757]/25"
              >
                <option value="all">全部月份</option>
                {monthOptions.map((month) => (
                  <option key={month} value={month}>
                    {month}
                  </option>
                ))}
              </select>

              {(selectedAccountId !== "all" || selectedMonth !== "all") && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedAccountId("all");
                    setSelectedMonth("all");
                    setExpanded(false);
                  }}
                  className="text-sm text-[#D97757] hover:underline"
                >
                  清除筛选
                </button>
              )}
            </div>
          </div>

          {/* 列表 */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            <div className="space-y-3">
              {visible.map((report) => (
                <div
                  key={report.id}
                  className="rounded-lg border border-[#E5E0D6] bg-white p-4 transition-all hover:border-[#78716C] hover:shadow-sm"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-[#1C1917]">
                          {accountDisplayNameMap[report.account_id] ||
                            report.account_id}
                        </span>
                        <span className="text-sm text-[#78716C]">·</span>
                        <span className="text-sm tabular-nums text-[#78716C]">
                          {report.report_date}
                        </span>
                      </div>

                      {report.video_url && (
                        <p className="text-sm text-[#78716C] truncate">
                          {report.video_url}
                        </p>
                      )}

                      <div className="flex items-center gap-4 text-sm tabular-nums text-[#78716C]">
                        {report.play_count && (
                          <span>
                            播放 {report.play_count.toLocaleString()}
                          </span>
                        )}
                        {report.likes && (
                          <span>点赞 {report.likes.toLocaleString()}</span>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => onEditReport(report)}
                      className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm text-[#78716C] transition-colors hover:bg-[#F5F3EE] hover:text-[#1C1917]"
                    >
                      <Pencil size={14} />
                      编辑
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* 展开/收起 */}
            {hasMore && (
              <div className="mt-4 text-center">
                <button
                  type="button"
                  onClick={() => setExpanded(!expanded)}
                  className="text-sm text-[#D97757] hover:underline"
                >
                  {expanded
                    ? "收起"
                    : `展开更多 (${filteredHistory.length - 10} 条)`}
                </button>
              </div>
            )}

            {visible.length === 0 && (
              <div className="py-16 text-center">
                <p className="text-sm text-[#78716C]">暂无历史记录</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
