"use client";

import { useState, useMemo } from "react";
import { ChevronDown, ChevronRight, HelpCircle, ArrowUpDown, TrendingUp, TrendingDown } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { EmptyState } from "@/components/ui/empty-state";
import { formatBigNumber, type OperatorRow } from "./types";

interface OperatorTabProps {
  operators: OperatorRow[];
  onSelectPerson: (userId: string) => void;
  onPrefetchPerson?: (userId: string) => void;
}

type SortField = "reportCount" | "totalPlay" | "avgPlay" | "totalFollowerConvert";

export function OperatorTab({ operators, onSelectPerson, onPrefetchPerson }: OperatorTabProps) {
  const [expandedUserIds, setExpandedUserIds] = useState<Set<string>>(new Set());
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
      <div className="py-12 bg-white rounded-xl border border-zinc-200">
        <EmptyState
          title="本月暂无运营归属记录"
          description="2026-07-27 起开始统计团队运营分工"
        />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden shadow-2xs">
      <Table>
        <TableHeader>
          <TableRow className="bg-zinc-50/70 hover:bg-zinc-50/70 text-[12px]">
            <TableHead className="w-10" />
            <TableHead className="text-left font-medium text-zinc-600">运营姓名</TableHead>
            <TableHead className="text-right font-medium text-zinc-600">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger className="inline-flex items-center gap-1 cursor-help">
                    带达人数
                    <HelpCircle className="size-3 text-zinc-400" />
                  </TooltipTrigger>
                  <TooltipContent className="text-[12px]">
                    按本月经手作品反推，非固定配置
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </TableHead>
            <TableHead className="text-right font-medium text-zinc-600">
              <button
                type="button"
                onClick={() => handleSort("reportCount")}
                className="inline-flex items-center gap-1 hover:text-zinc-900 transition-colors ml-auto"
              >
                本月条数
                <ArrowUpDown className="size-3" />
              </button>
            </TableHead>
            <TableHead className="text-right font-medium text-zinc-600">
              <button
                type="button"
                onClick={() => handleSort("totalPlay")}
                className="inline-flex items-center gap-1 hover:text-zinc-900 transition-colors ml-auto"
              >
                总播放
                <ArrowUpDown className="size-3" />
              </button>
            </TableHead>
            <TableHead className="text-right font-medium text-zinc-600">
              <button
                type="button"
                onClick={() => handleSort("avgPlay")}
                className="inline-flex items-center gap-1 hover:text-zinc-900 transition-colors ml-auto"
              >
                人均播放
                <ArrowUpDown className="size-3" />
              </button>
            </TableHead>
            <TableHead className="text-right font-medium text-zinc-600">
              <button
                type="button"
                onClick={() => handleSort("totalFollowerConvert")}
                className="inline-flex items-center gap-1 hover:text-zinc-900 transition-colors ml-auto"
              >
                导粉
                <ArrowUpDown className="size-3" />
              </button>
            </TableHead>
            <TableHead className="text-right font-medium text-zinc-600">爆款数</TableHead>
            <TableHead className="text-right font-medium text-zinc-600">环比</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className="text-[13px]">
          {sortedOperators.map((op) => {
            const isSelfAccountOnly =
              op.accounts.length === 1 &&
              (op.accounts[0].ownerName === op.name || op.accounts[0].accountId === op.userId);
            const canExpand = !isSelfAccountOnly && op.accounts.length > 0;
            const isExpanded = canExpand && expandedUserIds.has(op.userId);
            const mom = op.momChange;

            return (
              <tr key={op.userId} className="group border-b border-zinc-100 hover:bg-zinc-50/50 transition-colors">
                <td colSpan={9} className="p-0">
                  <div className="flex items-center px-4 py-3 border-b border-zinc-100 hover:bg-zinc-50/40">
                    {canExpand ? (
                      <button
                        type="button"
                        onClick={() => toggleExpand(op.userId)}
                        className="w-8 flex items-center justify-center text-zinc-400 hover:text-zinc-700"
                      >
                        {isExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                      </button>
                    ) : (
                      <div className="w-8 shrink-0" />
                    )}
                    <div className="flex-1 grid grid-cols-8 items-center gap-2">
                      <div className="text-left font-medium flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => onSelectPerson(op.userId)}
                          onMouseEnter={() => onPrefetchPerson?.(op.userId)}
                          onFocus={() => onPrefetchPerson?.(op.userId)}
                          className="text-zinc-900 hover:text-[#D97757] hover:underline transition-colors font-medium"
                        >
                          {op.name}
                        </button>
                        {isSelfAccountOnly && (
                          <span className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-[11px] font-normal text-zinc-500 border border-zinc-200/60">
                            自运营
                          </span>
                        )}
                      </div>
                      <div className="text-right tabular-nums text-zinc-700">
                        {op.operatedProfileCount} 人
                      </div>
                      <div className="text-right tabular-nums font-semibold text-zinc-900">
                        {op.reportCount}
                      </div>
                      <div className="text-right tabular-nums text-zinc-700">
                        {formatBigNumber(op.totalPlay)}
                      </div>
                      <div className="text-right tabular-nums text-zinc-700">
                        {formatBigNumber(op.avgPlay)}
                      </div>
                      <div className="text-right tabular-nums text-zinc-700">
                        {op.totalFollowerConvert.toLocaleString("zh-CN")}
                      </div>
                      <div className="text-right tabular-nums text-zinc-700">
                        {op.hitCount > 0 ? (
                          <span className="font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded text-[12px] border border-amber-200/60">
                            {op.hitCount}
                          </span>
                        ) : (
                          "0"
                        )}
                      </div>
                      <div className="text-right tabular-nums font-medium text-[12px]">
                        {mom == null ? (
                          <span className="text-zinc-400">—</span>
                        ) : mom > 0 ? (
                          <span className="inline-flex items-center justify-end gap-0.5 text-[#DC2626]">
                            <TrendingUp className="size-3" />
                            +{(mom * 100).toFixed(1)}%
                          </span>
                        ) : mom < 0 ? (
                          <span className="inline-flex items-center justify-end gap-0.5 text-[#16A34A]">
                            <TrendingDown className="size-3" />
                            {(mom * 100).toFixed(1)}%
                          </span>
                        ) : (
                          <span className="text-zinc-500">→ 0%</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Subrow (accounts list) */}
                  {isExpanded && (
                    <div className="bg-zinc-50/60 px-12 py-3 border-b border-zinc-200/80">
                      <div className="text-[12px] font-medium text-zinc-500 mb-2">名下达人作品统计：</div>
                      <div className="rounded-lg border border-zinc-200 bg-white overflow-hidden">
                        <table className="w-full text-[12px]">
                          <thead>
                            <tr className="border-b border-zinc-100 bg-zinc-50/80 text-zinc-500 text-left">
                              <th className="py-2 px-3 font-medium">达人姓名</th>
                              <th className="py-2 px-3 font-medium">账号名</th>
                              <th className="py-2 px-3 font-medium text-right">条数</th>
                              <th className="py-2 px-3 font-medium text-right">总播放</th>
                              <th className="py-2 px-3 font-medium text-right">导粉</th>
                            </tr>
                          </thead>
                          <tbody>
                            {op.accounts.map((acc) => (
                              <tr key={acc.accountId} className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50/30">
                                <td className="py-2 px-3 font-medium text-zinc-800">{acc.ownerName}</td>
                                <td className="py-2 px-3 text-zinc-600">{acc.accountName}</td>
                                <td className="py-2 px-3 text-right tabular-nums text-zinc-900 font-medium">{acc.reportCount}</td>
                                <td className="py-2 px-3 text-right tabular-nums text-zinc-700">{formatBigNumber(acc.totalPlay)}</td>
                                <td className="py-2 px-3 text-right tabular-nums text-zinc-700">{acc.totalFollowerConvert.toLocaleString("zh-CN")}</td>
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
