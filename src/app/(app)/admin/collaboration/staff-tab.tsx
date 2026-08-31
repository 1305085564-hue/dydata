"use client";

import { Fragment, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, ChevronRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
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
import { formatBigNumber, type StaffRow } from "./types";

interface StaffTabProps {
  rows: StaffRow[];
  role: "writer" | "editor";
  isLoading?: boolean;
  onSelectPerson: (userId: string) => void;
  onPrefetchPerson?: (userId: string) => void;
}

type SortField = "reportCount" | "totalPlay" | "avgPlay" | "selfHandledCount";

export function StaffTab({ rows, role, isLoading, onSelectPerson, onPrefetchPerson }: StaffTabProps) {
  const roleLabel = role === "writer" ? "文案" : "剪辑";
  const countLabel = role === "writer" ? "本月篇数" : "本月条数";

  const [sortField, setSortField] = useState<SortField>("reportCount");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [expandedUserIds, setExpandedUserIds] = useState<Set<string>>(new Set());

  const toggleExpand = (userId: string) => {
    setExpandedUserIds((previous) => {
      const next = new Set(previous);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
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
      return <ArrowUpDown className="size-3 text-[#78716C] opacity-60 ml-1" />;
    }
    return sortOrder === "desc" ? (
      <ArrowDown className="size-3 text-[#D97757] ml-1" />
    ) : (
      <ArrowUp className="size-3 text-[#D97757] ml-1" />
    );
  };

  const sortedRows = useMemo(() => {
    const list = [...rows];
    list.sort((left, right) => {
      const valLeft = left[sortField] ?? 0;
      const valRight = right[sortField] ?? 0;
      const diff = valRight - valLeft;
      return sortOrder === "desc" ? diff : -diff;
    });
    return list;
  }, [rows, sortField, sortOrder]);

  if (isLoading) {
    return (
      <div className="rounded-xl border border-[#E5E0D6] bg-white p-4 space-y-3">
        <Skeleton className="h-10 w-full rounded-lg" />
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-12 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="py-16 text-center">
        <EmptyState
          title={`本月暂无跨账号${roleLabel}协同记录`}
          description="个人自营账号请在达人专栏查看；此处收录跨账号分工与协同作品。"
        />
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="rounded-xl border border-[#ECE7DE] bg-white overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-transparent hover:bg-transparent border-b border-[#ECE7DE]/60 text-[11px] font-medium uppercase tracking-wider text-[#78716C]">
              <TableHead className="w-10" />
              <TableHead className="text-left font-medium text-[#78716C] pl-4">姓名</TableHead>
              <TableHead className="text-right font-medium text-[#78716C]">
                <button
                  type="button"
                  onClick={() => handleSort("reportCount")}
                  className={`inline-flex items-center justify-end w-full cursor-pointer transition-colors ${
                    sortField === "reportCount" ? "text-[#1C1917] font-semibold" : "hover:text-[#1C1917]"
                  }`}
                >
                  {countLabel}
                  {renderSortIcon("reportCount")}
                </button>
              </TableHead>
              <TableHead className="text-left font-medium text-[#78716C] pl-4">负责账号</TableHead>
              <TableHead className="text-left font-medium text-[#78716C] pl-4">最近作品</TableHead>
              <TableHead className="text-right font-medium text-[#78716C]">
                <button
                  type="button"
                  onClick={() => handleSort("totalPlay")}
                  className={`inline-flex items-center justify-end w-full cursor-pointer transition-colors ${
                    sortField === "totalPlay" ? "text-[#1C1917] font-semibold" : "hover:text-[#1C1917]"
                  }`}
                >
                  总播放 <span className="text-[11px] font-normal text-[#78716C] ml-0.5">（参考）</span>
                  {renderSortIcon("totalPlay")}
                </button>
              </TableHead>
              <TableHead className="text-right font-medium text-[#78716C]">
                <button
                  type="button"
                  onClick={() => handleSort("avgPlay")}
                  className={`inline-flex items-center justify-end w-full cursor-pointer transition-colors ${
                    sortField === "avgPlay" ? "text-[#1C1917] font-semibold" : "hover:text-[#1C1917]"
                  }`}
                >
                  条均播放 <span className="text-[11px] font-normal text-[#78716C] ml-0.5">（参考）</span>
                  {renderSortIcon("avgPlay")}
                </button>
              </TableHead>
              <TableHead className="text-right font-medium text-[#78716C] pr-4">
                <button
                  type="button"
                  onClick={() => handleSort("selfHandledCount")}
                  className={`inline-flex items-center justify-end w-full cursor-pointer transition-colors ${
                    sortField === "selfHandledCount" ? "text-[#1C1917] font-semibold" : "hover:text-[#1C1917]"
                  }`}
                >
                  独立完成
                  {renderSortIcon("selfHandledCount")}
                </button>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="text-[13px]">
            {sortedRows.map((row) => {
              const displayedAccounts = row.involvedAccounts.slice(0, 2).map((a) => a.accountName).join("、");
              const extraCount = row.involvedAccountTotal - Math.min(row.involvedAccounts.length, 2);
              const recentTitles = row.recentWorks.map((work) => work.title).join("、");
              const isExpanded = expandedUserIds.has(row.userId);

              return (
                <Fragment key={row.userId}>
                <TableRow className={isExpanded ? "bg-[#FBF9F5]/70 hover:bg-[#FBF9F5]/70" : "hover:bg-[#FBF9F5]/50 transition-colors"}>
                  <TableCell className="w-10 px-2 py-3">
                    <button
                      type="button"
                      onClick={() => toggleExpand(row.userId)}
                      aria-label={isExpanded ? `收起${row.name}的全部作品` : `查看${row.name}的全部作品`}
                      className={`flex size-8 items-center justify-center rounded-md transition-colors ${
                        isExpanded ? "text-[#D97757]" : "text-[#78716C] hover:bg-[#F5F3EE] hover:text-[#292524]"
                      }`}
                    >
                      {isExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                    </button>
                  </TableCell>
                  <TableCell className="text-left font-medium pl-4 py-3">
                    <button
                      type="button"
                      onClick={() => onSelectPerson(row.userId)}
                      onMouseEnter={() => onPrefetchPerson?.(row.userId)}
                      onFocus={() => onPrefetchPerson?.(row.userId)}
                      className="text-[#1C1917] hover:text-[#D97757] hover:underline transition-colors font-medium"
                    >
                      {row.name}
                    </button>
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-semibold text-[#1C1917] py-3">
                    {row.reportCount}
                  </TableCell>
                  <TableCell className="text-left py-3 pl-4 text-[#292524]">
                    {extraCount > 0 ? (
                      <Tooltip>
                        <TooltipTrigger className="cursor-help inline-flex items-center text-left">
                          <span>{displayedAccounts || "—"}</span>
                          <span className="ml-1 text-[11px] text-[#78716C] underline decoration-dotted underline-offset-2">
                            等 {row.involvedAccountTotal} 个账号
                          </span>
                        </TooltipTrigger>
                        <TooltipContent className="text-[12px] max-w-xs">
                          <p className="font-medium text-[#FBF9F5] mb-1">经手账号：</p>
                          <p className="text-[#FBF9F5] leading-relaxed">
                            {row.involvedAccounts.map((account) => account.accountName).join("、")}（展开本行可查看逐篇明细）
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      <span>{displayedAccounts || "—"}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-left py-3 pl-4 text-[#292524] max-w-[260px]">
                    <Tooltip>
                      <TooltipTrigger className="block max-w-full cursor-help text-left">
                        <span className="block truncate" title={recentTitles}>
                          {row.recentWorks[0]?.title || "—"}
                        </span>
                        {row.works.length > 1 && (
                          <span className="mt-0.5 block text-[11px] text-[#78716C]">
                            最近 {row.recentWorks.length} 条 · 共 {row.works.length} 条 · 可展开
                          </span>
                        )}
                      </TooltipTrigger>
                      <TooltipContent className="max-w-sm text-[12px]">
                        <p className="font-medium text-[#FBF9F5] mb-1">最近作品：</p>
                        {row.recentWorks.map((work) => (
                          <p key={work.reportId} className="leading-relaxed text-[#FBF9F5]">
                            {work.reportDate} · {work.accountName} · {work.title}
                          </p>
                        ))}
                      </TooltipContent>
                    </Tooltip>
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-[#292524] py-3">
                    {formatBigNumber(row.totalPlay)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-[#292524] py-3">
                    {formatBigNumber(row.avgPlay)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-[#78716C] py-3 pr-4">
                    {row.selfHandledCount}
                  </TableCell>
                </TableRow>
                {isExpanded && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={8} className="border-b border-[#ECE7DE]/60 bg-[#FAF8F4]/50 px-12 pb-4 pt-1">
                      <div className="overflow-hidden rounded-xl border border-[#ECE7DE]/80 bg-white shadow-2xs">
                        <table className="w-full text-[12px]">
                          <thead>
                            <tr className="border-b border-[#ECE7DE]/80 text-left text-[#78716C]">
                              <th className="px-3.5 py-2.5 text-[11px] font-medium uppercase tracking-wider">日期</th>
                              <th className="px-3.5 py-2.5 text-[11px] font-medium uppercase tracking-wider">账号</th>
                              <th className="px-3.5 py-2.5 text-[11px] font-medium uppercase tracking-wider">作品</th>
                              <th className="px-3.5 py-2.5 text-right text-[11px] font-medium uppercase tracking-wider">播放</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#ECE7DE]/60">
                            {row.works.map((work) => (
                              <tr key={work.reportId} className="hover:bg-[#F5F3EE]/40">
                                <td className="whitespace-nowrap px-3.5 py-2.5 tabular-nums text-[#78716C]">{work.reportDate}</td>
                                <td className="px-3.5 py-2.5 text-[#292524]">{work.accountName}</td>
                                <td className="px-3.5 py-2.5 font-medium text-[#1C1917]">{work.title}</td>
                                <td className="px-3.5 py-2.5 text-right tabular-nums text-[#292524]">{formatBigNumber(work.playCount)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
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
    </TooltipProvider>
  );
}
