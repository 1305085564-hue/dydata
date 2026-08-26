"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
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
      <div className="py-12 text-center">
        <EmptyState
          variant="collaboration"
          size={88}
          title={`本月静待${roleLabel}协同立卷`}
          description="当前周期尚未记录到该角色的作品分工手稿。"
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
              <TableHead className="text-left font-medium text-[#292524] pl-4">姓名</TableHead>
              <TableHead className="text-right font-medium text-[#292524]">
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
              <TableHead className="text-left font-medium text-[#292524] pl-4">给谁做的</TableHead>
              <TableHead className="text-right font-medium text-[#292524]">
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
              <TableHead className="text-right font-medium text-[#292524]">
                <button
                  type="button"
                  onClick={() => handleSort("avgPlay")}
                  className={`inline-flex items-center justify-end w-full cursor-pointer transition-colors ${
                    sortField === "avgPlay" ? "text-[#1C1917] font-semibold" : "hover:text-[#1C1917]"
                  }`}
                >
                  人均播放 <span className="text-[11px] font-normal text-[#78716C] ml-0.5">（参考）</span>
                  {renderSortIcon("avgPlay")}
                </button>
              </TableHead>
              <TableHead className="text-right font-medium text-[#292524] pr-4">
                <button
                  type="button"
                  onClick={() => handleSort("selfHandledCount")}
                  className={`inline-flex items-center justify-end w-full cursor-pointer transition-colors ${
                    sortField === "selfHandledCount" ? "text-[#1C1917] font-semibold" : "hover:text-[#1C1917]"
                  }`}
                >
                  自运营条数
                  {renderSortIcon("selfHandledCount")}
                </button>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="text-[13px]">
            {sortedRows.map((row) => {
              const displayedAccounts = row.involvedAccounts.map((a) => a.accountName).join("、");
              const extraCount = row.involvedAccountTotal - row.involvedAccounts.length;

              return (
                <TableRow key={row.userId} className="hover:bg-[#FBF9F5]/50 transition-colors">
                  <TableCell className="text-left font-medium pl-4 py-3">
                    <button
                      type="button"
                      onClick={() => onSelectPerson(row.userId)}
                      onMouseEnter={() => onPrefetchPerson?.(row.userId)}
                      onFocus={() => onPrefetchPerson?.(row.userId)}
                      className="font-serif text-[#1C1917] hover:text-[#D97757] transition-colors font-semibold tracking-tight cursor-pointer"
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
                          <p className="font-medium text-[#ECE7DE] mb-1">经手账号：</p>
                          <p className="text-[#E5E0D6] leading-relaxed">
                            {displayedAccounts} 等共 {row.involvedAccountTotal} 个账号（点击成员姓名查看个人档案明细）
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      <span>{displayedAccounts || "—"}</span>
                    )}
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
              );
            })}
          </TableBody>
        </Table>
      </div>
    </TooltipProvider>
  );
}
