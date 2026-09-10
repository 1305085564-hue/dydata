"use client";

import { Fragment, useState, useMemo } from "react";
import {
  ChevronDown,
  ChevronRight,
  HelpCircle,
  ArrowUpDown,
  ArrowDown,
  ArrowUp,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { EmptyState } from "@/components/ui/empty-state";
import { DeskStudyIllustration } from "@/components/editorial/editorial-illustrations";
import { formatBigNumber, type OperatorRow } from "./types";

interface OperatorTabProps {
  operators: OperatorRow[];
  onSelectPerson: (userId: string) => void;
  onPrefetchPerson?: (userId: string) => void;
}

type SortField =
  "reportCount" | "totalPlay" | "avgPlay" | "totalFollowerConvert";

export function OperatorTab({
  operators,
  onSelectPerson,
  onPrefetchPerson,
}: OperatorTabProps) {
  const [expandedUserIds, setExpandedUserIds] = useState<Set<string>>(
    new Set(),
  );
  const [sortField, setSortField] = useState<SortField>("reportCount");
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");

  const toggleExpand = (userId: string) => {
    setExpandedUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === "desc" ? "asc" : "desc"));
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="size-3 text-[#78716C]/40" />;
    }
    return sortOrder === "desc" ? (
      <ArrowDown className="size-3 text-[#1C1917]" />
    ) : (
      <ArrowUp className="size-3 text-[#1C1917]" />
    );
  };

  const sortedOperators = useMemo(() => {
    const list = [...operators];
    list.sort((left, right) => {
      const valLeft = left[sortField] ?? 0;
      const valRight = right[sortField] ?? 0;
      const diff = valRight - valLeft;
      return sortOrder === "desc" ? diff : -diff;
    });
    return list;
  }, [operators, sortField, sortOrder]);

  if (operators.length === 0) {
    return (
      <div className="py-16 text-center">
        <EmptyState
          illustration={<DeskStudyIllustration size={96} />}
          title="本月暂无跨账号协同记录"
          description="个人自营账号请在达人专栏查看；此处收录跨账号分工与协同作品。"
        />
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-white shadow-card-ring overflow-hidden">
      <Table className="min-w-[1000px]">
        <TableHeader>
          <TableRow className="bg-transparent hover:bg-transparent border-b border-[#E2E2DF]/60 text-[11px] font-medium uppercase tracking-wider text-[#78716C]">
            <TableHead className="w-10" />
            <TableHead className="text-left font-medium text-[#78716C]">
              运营姓名
            </TableHead>
            <TableHead className="text-right font-medium text-[#78716C]">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger className="inline-flex items-center gap-1 cursor-help">
                    负责账号
                    <HelpCircle className="size-3 text-[#78716C]" />
                  </TooltipTrigger>
                  <TooltipContent className="text-[12px]">
                    只统计该运营为别人孵化、负责的账号
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </TableHead>
            <TableHead className="text-right font-medium text-[#78716C]">
              <button
                type="button"
                onClick={() => handleSort("reportCount")}
                className={`inline-flex items-center gap-1 transition-colors ml-auto cursor-pointer ${
                  sortField === "reportCount"
                    ? "text-[#1C1917] font-medium"
                    : "hover:text-[#1C1917]"
                }`}
              >
                本月作品
                {renderSortIcon("reportCount")}
              </button>
            </TableHead>
            <TableHead className="text-right font-medium text-[#78716C]">
              <button
                type="button"
                onClick={() => handleSort("totalPlay")}
                className={`inline-flex items-center gap-1 transition-colors ml-auto cursor-pointer ${
                  sortField === "totalPlay"
                    ? "text-[#1C1917] font-medium"
                    : "hover:text-[#1C1917]"
                }`}
              >
                总播放
                {renderSortIcon("totalPlay")}
              </button>
            </TableHead>
            <TableHead className="text-right font-medium text-[#78716C]">
              <button
                type="button"
                onClick={() => handleSort("avgPlay")}
                className={`inline-flex items-center gap-1 transition-colors ml-auto cursor-pointer ${
                  sortField === "avgPlay"
                    ? "text-[#1C1917] font-medium"
                    : "hover:text-[#1C1917]"
                }`}
              >
                条均播放
                {renderSortIcon("avgPlay")}
              </button>
            </TableHead>
            <TableHead className="text-right font-medium text-[#78716C]">
              <button
                type="button"
                onClick={() => handleSort("totalFollowerConvert")}
                className={`inline-flex items-center gap-1 transition-colors ml-auto cursor-pointer ${
                  sortField === "totalFollowerConvert"
                    ? "text-[#1C1917] font-medium"
                    : "hover:text-[#1C1917]"
                }`}
              >
                导粉
                {renderSortIcon("totalFollowerConvert")}
              </button>
            </TableHead>
            <TableHead className="text-right font-medium text-[#78716C]" title="播放大于500的作品条数">有效作品</TableHead>
            <TableHead className="text-right font-medium text-[#78716C]" title="播放至少30,000，简单计数">优秀作品</TableHead>
            <TableHead className="text-right font-medium text-[#78716C]">
              爆款数
            </TableHead>
            <TableHead className="text-right font-medium text-[#78716C]">
              环比
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className="text-[13px]">
          {sortedOperators.map((op) => {
            const canExpand = op.accounts.length > 0;
            const isExpanded = canExpand && expandedUserIds.has(op.userId);
            const mom = op.momChange;

            return (
              <Fragment key={op.userId}>
                <TableRow
                  className={`transition-colors ${
                    isExpanded
                      ? "bg-[#FCFCFB]/70 hover:bg-[#F7F7F6]"
                      : "hover:bg-[#F7F7F6] border-b border-[#E2E2DF]/70"
                  }`}
                >
                  <TableCell className="w-10 px-2 py-3 text-center">
                    {canExpand ? (
                      <button
                        type="button"
                        onClick={() => toggleExpand(op.userId)}
                        aria-label={
                          isExpanded
                            ? `收起${op.name}的负责账号`
                            : `展开${op.name}的负责账号`
                        }
                        className={`flex size-8 items-center justify-center rounded-md transition-colors cursor-pointer ${
                          isExpanded
                            ? "text-[#1C1917]"
                            : "text-[#78716C] hover:bg-[#EBEBE9] hover:text-[#292524]"
                        }`}
                      >
                        {isExpanded ? (
                          <ChevronDown className="size-4" />
                        ) : (
                          <ChevronRight className="size-4" />
                        )}
                      </button>
                    ) : (
                      <div className="size-8" />
                    )}
                  </TableCell>
                  <TableCell className="text-left font-medium py-3">
                    <button
                      type="button"
                      onClick={() => onSelectPerson(op.userId)}
                      onMouseEnter={() => onPrefetchPerson?.(op.userId)}
                      onFocus={() => onPrefetchPerson?.(op.userId)}
                      className="text-[#1C1917] hover:text-[#D97757] hover:underline transition-colors font-medium cursor-pointer"
                    >
                      {op.name}
                    </button>
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-[#292524] py-3">
                    {op.accountCount}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-medium text-[#1C1917] py-3">
                    {op.reportCount}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-[#292524] py-3">
                    {formatBigNumber(op.totalPlay)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-[#292524] py-3">
                    {formatBigNumber(op.avgPlay)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-[#292524] py-3">
                    {op.totalFollowerConvert.toLocaleString("zh-CN")}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-[#292524] py-3">
                    {op.effectiveCount}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-[#292524] py-3">
                    {op.excellentCount}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-[#292524] py-3">
                    {op.hitCount > 0 ? (
                      <span className="inline-flex items-center gap-0.5 font-medium text-[#292524] bg-[#F1F1F0] px-1.5 py-0.5 rounded text-[12px] border border-[#E2E2DF]/60">
                        <span>{op.hitCount}</span>
                        <span className="text-[10px] text-[#78716C]">✦</span>
                      </span>
                    ) : (
                      <span className="text-[#A8A29E]">0</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums py-3">
                    {mom == null ? (
                      <span className="text-[#78716C]">—</span>
                    ) : mom > 0 ? (
                      <span className="inline-flex items-center justify-end gap-0.5 text-[#6FAA7D] font-medium text-[12px]">
                        <TrendingUp className="size-3" />+
                        {(mom * 100).toFixed(1)}%
                      </span>
                    ) : mom < 0 ? (
                      <span className="inline-flex items-center justify-end gap-0.5 text-[#C0685C] font-medium text-[12px]">
                        <TrendingDown className="size-3" />
                        {(mom * 100).toFixed(1)}%
                      </span>
                    ) : (
                      <span className="text-[#78716C] tabular-nums text-[12px]">0.0%</span>
                    )}
                  </TableCell>
                </TableRow>

                {/* 展开子区域：精装薄信笺 + 灰蓝学者边注导轨（绝不散架） */}
                {isExpanded && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={11} className="p-0 border-b border-[#E2E2DF]/60">
                      <div className="p-3.5 sm:p-4 bg-[#FCFCFB]/40">
                        {/* 明细卡片：完整 1px 细线盒包裹，绝对不散架 */}
                        <div className="rounded-xl border border-[#E2E2DF] bg-white overflow-hidden shadow-2xs">
                          <table className="w-full text-[12px]">
                            <thead>
                              <tr className="border-b border-[#E2E2DF]/60 bg-transparent text-[#78716C] text-left">
                                <th className="py-2.5 px-3.5 text-[11px] font-medium uppercase tracking-wider text-[#78716C]">
                                  达人姓名
                                </th>
                                <th className="py-2.5 px-3.5 text-[11px] font-medium uppercase tracking-wider text-[#78716C]">
                                  账号名
                                </th>
                                <th className="py-2.5 px-3.5 text-[11px] font-medium uppercase tracking-wider text-[#78716C] text-right">
                                  条数
                                </th>
                                <th className="py-2.5 px-3.5 text-[11px] font-medium uppercase tracking-wider text-[#78716C] text-right">
                                  总播放
                                </th>
                                <th className="py-2.5 px-3.5 text-[11px] font-medium uppercase tracking-wider text-[#78716C] text-right pr-4">
                                  导粉
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[#E2E2DF]/50">
                              {op.accounts.map((acc) => (
                                <tr
                                  key={acc.accountId}
                                  className="hover:bg-[#F7F7F6] transition-colors duration-100"
                                >
                                  <td className="py-2.5 px-3.5 font-medium text-[#292524]">
                                    {acc.ownerName}
                                  </td>
                                  <td className="py-2.5 px-3.5 text-[#292524]">
                                    {acc.accountName}
                                  </td>
                                  <td className="py-2.5 px-3.5 text-right tabular-nums text-[#1C1917] font-medium">
                                    {acc.reportCount}
                                  </td>
                                  <td className="py-2.5 px-3.5 text-right tabular-nums text-[#292524]">
                                    {formatBigNumber(acc.totalPlay)}
                                  </td>
                                  <td className="py-2.5 px-3.5 text-right tabular-nums text-[#292524] pr-4">
                                    {acc.totalFollowerConvert.toLocaleString(
                                      "zh-CN",
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
