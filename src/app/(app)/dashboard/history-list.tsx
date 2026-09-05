"use client";

import { useMemo, useState } from "react";
import { Filter, Pencil } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type HistoryReport = {
  id: string;
  account_id: string;
  report_date: string | null;
  title: string | null;
  play_count: number | null;
  completion_rate: string | null;
  avg_play_duration: string | null;
  bounce_rate_2s: string | null;
  completion_rate_5s: string | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  favorites: number | null;
  follower_gain: number | null;
  follower_convert: number | null;
  content: string | null;
  published_at: string | null;
  uploaded_at: string | null;
};

interface HistoryListProps {
  history: HistoryReport[];
  accountDisplayNameMap: Record<string, string>;
  onReportOpen?: (report: HistoryReport) => void;
}

const DEFAULT_VISIBLE = 10;

export function HistoryList({ history, accountDisplayNameMap, onReportOpen }: HistoryListProps) {
  const [selectedAccountId, setSelectedAccountId] = useState<string>("all");
  const [selectedMonth, setSelectedMonth] = useState<string>("all");
  const [expanded, setExpanded] = useState(false);

  // 提取可用账号选项
  const accountOptions = useMemo(() => {
    const accIds = Array.from(new Set(history.map((h) => h.account_id).filter(Boolean)));
    return accIds.map((id) => ({
      id,
      name: accountDisplayNameMap[id] || id,
    }));
  }, [history, accountDisplayNameMap]);

  // 提取可用月份选项（降序）
  const monthOptions = useMemo(() => {
    const months = Array.from(
      new Set(
        history
          .map((h) => (h.report_date ? h.report_date.slice(0, 7) : null))
          .filter((m): m is string => Boolean(m)),
      ),
    ).sort().reverse();
    return months;
  }, [history]);

  const handleAccountChange = (accId: string) => {
    setSelectedAccountId(accId);
    setExpanded(false);
  };

  const handleMonthChange = (month: string) => {
    setSelectedMonth(month);
    setExpanded(false);
  };

  const clearFilter = () => {
    setSelectedAccountId("all");
    setSelectedMonth("all");
    setExpanded(false);
  };

  const filteredHistory = useMemo(() => {
    return history.filter((report) => {
      if (selectedAccountId !== "all" && report.account_id !== selectedAccountId) {
        return false;
      }
      if (selectedMonth !== "all" && (!report.report_date || !report.report_date.startsWith(selectedMonth))) {
        return false;
      }
      return true;
    });
  }, [history, selectedAccountId, selectedMonth]);

  const visible = expanded ? filteredHistory : filteredHistory.slice(0, DEFAULT_VISIBLE);
  const hasMore = filteredHistory.length > DEFAULT_VISIBLE;
  const isFiltered = selectedAccountId !== "all" || selectedMonth !== "all";

  return (
    <div className="space-y-3">
      {/* 历史记录公共筛选头部 */}
      {(accountOptions.length > 1 || monthOptions.length > 1) && (
        <div className="flex flex-wrap items-center justify-between gap-2 pb-1 border-b border-[#ECE7DE] text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 text-[#78716C] font-normal">
              <Filter className="size-3.5 text-[#78716C]" />
              <span>筛选</span>
            </span>

            {/* 账号筛选 */}
            {accountOptions.length > 1 && (
              <Select
                value={selectedAccountId}
                onValueChange={(val) => handleAccountChange(val || "all")}
              >
                <SelectTrigger
                  aria-label="按账号过滤历史记录"
                  className="h-7 rounded-lg border border-[#E5E0D6] px-2.5 text-xs text-[#292524] font-normal shadow-2xs hover:border-[#78716C]/40 focus-visible:ring-1 focus-visible:ring-[#D97757]/25"
                >
                  <SelectValue>
                    {selectedAccountId === "all"
                      ? `全部账号 (${history.length})`
                      : accountOptions.find((a) => a.id === selectedAccountId)?.name || "全部账号"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="rounded-xl border border-[#E5E0D6] shadow-claude-float min-w-36">
                  <SelectItem value="all">全部账号 ({history.length})</SelectItem>
                  {accountOptions.map((acc) => (
                    <SelectItem key={acc.id} value={acc.id}>
                      {acc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {/* 月份筛选 */}
            {monthOptions.length > 1 && (
              <Select
                value={selectedMonth}
                onValueChange={(val) => handleMonthChange(val || "all")}
              >
                <SelectTrigger
                  aria-label="按月份过滤历史记录"
                  className="h-7 rounded-lg border border-[#E5E0D6] px-2.5 text-xs text-[#292524] font-normal shadow-2xs hover:border-[#78716C]/40 focus-visible:ring-1 focus-visible:ring-[#D97757]/25"
                >
                  <SelectValue>
                    {selectedMonth === "all" ? "全部月份" : selectedMonth}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="rounded-xl border border-[#E5E0D6] shadow-claude-float min-w-28">
                  <SelectItem value="all">全部月份</SelectItem>
                  {monthOptions.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {isFiltered && (
              <button
                type="button"
                onClick={clearFilter}
                className="text-xs text-[#D97757] hover:text-[#C46A4D] underline underline-offset-2 font-normal"
              >
                清空筛选
              </button>
            )}
          </div>

          <span className="text-[#78716C] text-xs tabular-nums font-normal">
            共 {filteredHistory.length} 条
          </span>
        </div>
      )}

      {/* 过滤后空状态 */}
      {filteredHistory.length === 0 ? (
        <div className="py-12 text-center rounded-xl border border-dashed border-[#E5E0D6] bg-[#FBF9F5]/50 p-6">
          <p className="text-xs font-medium text-[#292524]">此筛选下暂无作品记录</p>
          <p className="text-xs text-[#78716C] mt-1 font-normal">可以尝试切换或清空上方筛选条件</p>
          {isFiltered && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={clearFilter}
              className="mt-3 text-xs"
            >
              清空筛选
            </Button>
          )}
        </div>
      ) : (
        <>
          {/* 桌面端 Table */}
          <div className="hidden overflow-x-auto md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>日期</TableHead>
                  <TableHead>账号</TableHead>
                  <TableHead>视频标题</TableHead>
                  <TableHead className="text-right">播放量</TableHead>
                  <TableHead className="text-right">完播率</TableHead>
                  <TableHead className="text-right">均播时长</TableHead>
                  <TableHead className="hidden text-right lg:table-cell">2s跳出</TableHead>
                  <TableHead className="hidden text-right lg:table-cell">5s完播</TableHead>
                  <TableHead className="text-right">点赞</TableHead>
                  <TableHead className="text-right">评论</TableHead>
                  <TableHead className="text-right">分享</TableHead>
                  <TableHead className="hidden text-right lg:table-cell">收藏</TableHead>
                  <TableHead className="w-[60px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((report) => (
                  <TableRow
                    key={report.id}
                    className={"group " + (onReportOpen ? "cursor-pointer" : "")}
                    onClick={onReportOpen ? (event) => {
                      // 阻止冒泡：否则同一个 click 会继续冒泡到新挂载的编辑弹窗底层，被 Base UI 判定为"点外部"瞬间关窗
                      event.stopPropagation();
                      onReportOpen(report);
                    } : undefined}
                  >
                    <TableCell className="whitespace-nowrap text-[#78716C] tabular-nums">
                      {report.report_date?.slice(5)}
                    </TableCell>
                    <TableCell className="max-w-[120px] truncate text-[#78716C]">
                      {accountDisplayNameMap[report.account_id] ?? "—"}
                    </TableCell>
                    <TableCell className="max-w-[160px] truncate text-[#292524]">
                      {onReportOpen ? (
                        <button
                          type="button"
                          className="max-w-full truncate rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D97757]/40"
                          onClick={(event) => {
                            event.stopPropagation();
                            onReportOpen(report);
                          }}
                        >
                          {report.title}
                        </button>
                      ) : report.title}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums text-[#292524]">
                      {report.play_count != null ? report.play_count.toLocaleString("zh-CN") : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-[#292524]">{report.completion_rate ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums text-[#292524]">{report.avg_play_duration ?? "—"}</TableCell>
                    <TableCell className="hidden text-right tabular-nums text-[#292524] lg:table-cell">{report.bounce_rate_2s ?? "—"}</TableCell>
                    <TableCell className="hidden text-right tabular-nums text-[#292524] lg:table-cell">{report.completion_rate_5s ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums text-[#292524]">{report.likes ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums text-[#292524]">{report.comments ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums text-[#292524]">{report.shares ?? "—"}</TableCell>
                    <TableCell className="hidden text-right tabular-nums text-[#292524] lg:table-cell">{report.favorites ?? "—"}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="编辑该日报"
                        className="size-7 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-150 pointer-events-none group-hover:pointer-events-auto focus-within:pointer-events-auto"
                        onClick={(event) => {
                          event.stopPropagation();
                          onReportOpen?.(report);
                        }}
                      >
                        <Pencil className="size-3.5 stroke-[1.5]" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* 移动端 Card 列表 */}
          <div className="space-y-3 md:hidden">
            {visible.map((report) => (
              <div
                key={report.id}
                className={
                  onReportOpen
                    ? "cursor-pointer space-y-2 rounded-xl border border-[#E5E0D6] bg-white p-4"
                    : "space-y-2 rounded-xl border border-[#E5E0D6] bg-white p-4"
                }
                onClick={onReportOpen ? (event) => {
                  // 同上：阻止冒泡，避免新弹窗被同一次点击误判为"点外部"而关闭
                  event.stopPropagation();
                  onReportOpen(report);
                } : undefined}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[12px] text-[#78716C] tabular-nums">{report.report_date?.slice(5)}</p>
                    <p className="mt-1 text-[12px] text-[#78716C]">
                      {accountDisplayNameMap[report.account_id] ?? "—"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="text-[13px] font-medium tabular-nums text-[#292524]">
                      {report.play_count != null ? report.play_count.toLocaleString("zh-CN") : "—"}
                    </p>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="编辑该日报"
                      className="size-7"
                      onClick={(event) => {
                        event.stopPropagation();
                        onReportOpen?.(report);
                      }}
                    >
                      <Pencil className="size-3.5 stroke-[1.5]" />
                    </Button>
                  </div>
                </div>
                {onReportOpen ? (
                  <button
                    type="button"
                    className="max-w-full truncate rounded text-left text-[13px] text-[#292524] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D97757]/40"
                    onClick={(event) => {
                      event.stopPropagation();
                      onReportOpen(report);
                    }}
                  >
                    {report.title}
                  </button>
                ) : (
                  <p className="truncate text-[13px] text-[#292524]">{report.title}</p>
                )}
                <div className="grid grid-cols-4 gap-2 text-[12px]">
                  <div>
                    <p className="text-[#78716C]">完播率</p>
                    <p className="tabular-nums text-[#292524]">{report.completion_rate ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-[#78716C]">点赞</p>
                    <p className="tabular-nums text-[#292524]">{report.likes ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-[#78716C]">评论</p>
                    <p className="tabular-nums text-[#292524]">{report.comments ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-[#78716C]">分享</p>
                    <p className="tabular-nums text-[#292524]">{report.shares ?? "—"}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {hasMore && (
            <div className="mt-3 flex justify-center">
              <Button variant="ghost" size="sm" onClick={() => setExpanded((v) => !v)}>
                {expanded ? "收起" : `展开全部（${filteredHistory.length} 条）`}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
