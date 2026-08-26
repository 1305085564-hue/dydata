"use client";

import { useState, useMemo } from "react";
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
      return <ArrowUpDown className="size-3 text-[#78716C] opacity-60" />;
    }
    return sortOrder === "desc" ? (
      <ArrowDown className="size-3 text-[#D97757]" />
    ) : (
      <ArrowUp className="size-3 text-[#D97757]" />
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
      <div className="py-12 text-center">
        <EmptyState
          variant="collaboration"
          size={88}
          title="本月静待运营协同立卷"
          description="当前周期尚未记录到运营分工手稿。"
        />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[#ECE7DE] bg-white overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-transparent hover:bg-transparent border-b border-[#ECE7DE]/60 text-[11px] font-medium uppercase tracking-wider text-[#78716C]">
            <TableHead className="w-10" />
            <TableHead className="text-left font-medium text-[#292524]">
              运营姓名
            </TableHead>
            <TableHead className="text-right font-medium text-[#292524]">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger className="inline-flex items-center gap-1 cursor-help">
                    带达人数
                    <HelpCircle className="size-3 text-[#78716C]" />
                  </TooltipTrigger>
                  <TooltipContent className="text-[12px]">
                    按本月经手作品反推，非固定配置
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </TableHead>
            <TableHead className="text-right font-medium text-[#292524]">
              <button
                type="button"
                onClick={() => handleSort("reportCount")}
                className={`inline-flex items-center gap-1 transition-colors ml-auto ${
                  sortField === "reportCount"
                    ? "text-[#1C1917] font-semibold"
                    : "hover:text-[#1C1917]"
                }`}
              >
                本月条数
                {renderSortIcon("reportCount")}
              </button>
            </TableHead>
            <TableHead className="text-right font-medium text-[#292524]">
              <button
                type="button"
                onClick={() => handleSort("totalPlay")}
                className={`inline-flex items-center gap-1 transition-colors ml-auto ${
                  sortField === "totalPlay"
                    ? "text-[#1C1917] font-semibold"
                    : "hover:text-[#1C1917]"
                }`}
              >
                总播放
                {renderSortIcon("totalPlay")}
              </button>
            </TableHead>
            <TableHead className="text-right font-medium text-[#292524]">
              <button
                type="button"
                onClick={() => handleSort("avgPlay")}
                className={`inline-flex items-center gap-1 transition-colors ml-auto ${
                  sortField === "avgPlay"
                    ? "text-[#1C1917] font-semibold"
                    : "hover:text-[#1C1917]"
                }`}
              >
                人均播放
                {renderSortIcon("avgPlay")}
              </button>
            </TableHead>
            <TableHead className="text-right font-medium text-[#292524]">
              <button
                type="button"
                onClick={() => handleSort("totalFollowerConvert")}
                className={`inline-flex items-center gap-1 transition-colors ml-auto ${
                  sortField === "totalFollowerConvert"
                    ? "text-[#1C1917] font-semibold"
                    : "hover:text-[#1C1917]"
                }`}
              >
                导粉
                {renderSortIcon("totalFollowerConvert")}
              </button>
            </TableHead>
            <TableHead className="text-right font-medium text-[#292524]">
              爆款数
            </TableHead>
            <TableHead className="text-right font-medium text-[#292524]">
              环比
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className="text-[13px]">
          {sortedOperators.map((op) => {
            const isSelfAccountOnly =
              op.accounts.length === 1 &&
              (op.accounts[0].ownerName === op.name ||
                op.accounts[0].accountId === op.userId);
            const canExpand = !isSelfAccountOnly && op.accounts.length > 0;
            const isExpanded = canExpand && expandedUserIds.has(op.userId);
            const mom = op.momChange;

            return (
              <tr key={op.userId} className="group transition-colors">
                <td colSpan={9} className="p-0">
                  {/* 父行：展开时与子内容融合为一体，移除中间分割线 */}
                  <div
                    className={`flex items-center px-4 py-3 transition-colors ${
                      isExpanded
                        ? "bg-[#FBF9F5]/90 font-medium"
                        : "border-b border-[#ECE7DE] hover:bg-[#FBF9F5]/40"
                    }`}
                  >
                    {canExpand ? (
                      <button
                        type="button"
                        onClick={() => toggleExpand(op.userId)}
                        className={`w-8 flex items-center justify-center transition-colors ${
                          isExpanded
                            ? "text-[#D97757]"
                            : "text-[#78716C] hover:text-[#292524]"
                        }`}
                      >
                        {isExpanded ? (
                          <ChevronDown className="size-4" />
                        ) : (
                          <ChevronRight className="size-4" />
                        )}
                      </button>
                    ) : (
                      <div className="w-8 shrink-0" />
                    )}
                    <div className="flex-1 grid grid-cols-8 items-center gap-2">
                      <div className="text-left font-medium flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onSelectPerson(op.userId)}
                          onMouseEnter={() => onPrefetchPerson?.(op.userId)}
                          onFocus={() => onPrefetchPerson?.(op.userId)}
                          className="font-serif text-[#1C1917] hover:text-[#D97757] transition-colors font-semibold tracking-tight cursor-pointer"
                        >
                          {op.name}
                        </button>
                        {isSelfAccountOnly && (
                          <span className="rounded-md bg-[#FAF8F4] px-1.5 py-0.5 text-[10.5px] font-mono font-medium text-[#78716C] border border-[#ECE7DE]">
                            自运营
                          </span>
                        )}
                      </div>
                      <div className="text-right tabular-nums text-[#292524]">
                        {op.operatedProfileCount} 人
                      </div>
                      <div className="text-right tabular-nums font-semibold text-[#1C1917]">
                        {op.reportCount}
                      </div>
                      <div className="text-right tabular-nums text-[#292524]">
                        {formatBigNumber(op.totalPlay)}
                      </div>
                      <div className="text-right tabular-nums text-[#292524]">
                        {formatBigNumber(op.avgPlay)}
                      </div>
                      <div className="text-right tabular-nums text-[#292524]">
                        {op.totalFollowerConvert.toLocaleString("zh-CN")}
                      </div>
                      <div className="text-right tabular-nums text-[#292524]">
                        {op.hitCount > 0 ? (
                          <span className="font-semibold text-[#292524] bg-[#F5F3EE] px-1.5 py-0.5 rounded text-[12px] border border-[#E5E0D6]/60">
                            {op.hitCount}
                          </span>
                        ) : (
                          "0"
                        )}
                      </div>
                      <div className="text-right tabular-nums font-medium text-[12px]">
                        {mom == null ? (
                          <span className="text-[#78716C]">—</span>
                        ) : mom > 0 ? (
                          <span className="inline-flex items-center justify-end gap-0.5 text-[#DC2626]">
                            <TrendingUp className="size-3" />+
                            {(mom * 100).toFixed(1)}%
                          </span>
                        ) : mom < 0 ? (
                          <span className="inline-flex items-center justify-end gap-0.5 text-[#6FAA7D]">
                            <TrendingDown className="size-3" />
                            {(mom * 100).toFixed(1)}%
                          </span>
                        ) : (
                          <span className="text-[#78716C]">→ 0%</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 展开子区域：与父行亲密融合，底部与下一行拉开留白隔断 */}
                  {isExpanded && (
                    <div className="bg-[#FBF9F5]/90 px-12 pt-1 pb-5 border-b border-[#E5E0D6]/80 transition-all duration-200">
                      <div className="rounded-xl border border-[#E5E0D6] bg-white overflow-hidden shadow-2xs">
                        <table className="w-full text-[12px]">
                          <thead>
                            <tr className="border-b border-[#ECE7DE] bg-[#FBF9F5]/80 text-[#78716C] text-left">
                              <th className="py-2.5 px-3.5 font-medium">
                                达人姓名
                              </th>
                              <th className="py-2.5 px-3.5 font-medium">
                                账号名
                              </th>
                              <th className="py-2.5 px-3.5 font-medium text-right">
                                条数
                              </th>
                              <th className="py-2.5 px-3.5 font-medium text-right">
                                总播放
                              </th>
                              <th className="py-2.5 px-3.5 font-medium text-right pr-4">
                                导粉
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#ECE7DE]">
                            {op.accounts.map((acc) => (
                              <tr
                                key={acc.accountId}
                                className="hover:bg-[#FBF9F5]/50 transition-colors"
                              >
                                <td className="py-2.5 px-3.5 font-medium text-[#292524]">
                                  {acc.ownerName}
                                </td>
                                <td className="py-2.5 px-3.5 text-[#292524]">
                                  {acc.accountName}
                                </td>
                                <td className="py-2.5 px-3.5 text-right tabular-nums text-[#1C1917] font-semibold">
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
                  )}
                </td>
              </tr>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
