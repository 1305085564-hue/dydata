"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Star } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import type { TalentRow } from "./types";
import { formatBigNumber } from "./types";

interface TalentTabProps {
  talents: TalentRow[];
  onSelectPerson: (userId: string) => void;
  onPrefetchPerson: (userId: string) => void;
}

type SortField = "totalPlay" | "avgPlay" | "reportCount" | "hitCount" | "accountCount" | "selfHandledCount";

export function TalentTab({
  talents,
  onSelectPerson,
  onPrefetchPerson,
}: TalentTabProps) {
  const [sortField, setSortField] = useState<SortField>("totalPlay");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const sorted = useMemo(() => {
    const list = [...talents];
    list.sort((a, b) => {
      const diff =
        sortOrder === "desc"
          ? b[sortField] - a[sortField]
          : a[sortField] - b[sortField];
      return diff || a.name.localeCompare(b.name, "zh-CN");
    });
    return list;
  }, [talents, sortField, sortOrder]);

  if (talents.length === 0) {
    return (
      <div className="py-16 text-center">
        <EmptyState
          title="本月还没有达人数据"
          description="名下拥有自营或出镜账号的成员将在此展示作品产量与数据表现。"
        />
      </div>
    );
  }

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
      return <ArrowUpDown className="size-3 text-[#78716C] opacity-60 ml-1 inline" />;
    }
    return sortOrder === "desc" ? (
      <ArrowDown className="size-3 text-[#D97757] ml-1 inline" />
    ) : (
      <ArrowUp className="size-3 text-[#D97757] ml-1 inline" />
    );
  };

  return (
    <div className="rounded-xl bg-white shadow-card-ring overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-transparent hover:bg-transparent border-b border-[#ECE7DE]/60 text-[11px] font-medium uppercase tracking-wider text-[#78716C]">
            <TableHead className="py-2.5 pl-4 pr-2 text-left font-medium text-[#78716C] w-[140px]">
              达人姓名
            </TableHead>
            <TableHead className="py-2.5 px-2 text-right font-medium text-[#78716C]">
              <button
                type="button"
                onClick={() => handleSort("accountCount")}
                className={`inline-flex items-center justify-end cursor-pointer transition-colors ${
                  sortField === "accountCount" ? "text-[#1C1917] font-semibold" : "hover:text-[#1C1917]"
                }`}
              >
                账号数
                {renderSortIcon("accountCount")}
              </button>
            </TableHead>
            <TableHead className="py-2.5 px-2 text-right font-medium text-[#78716C]">
              <button
                type="button"
                onClick={() => handleSort("reportCount")}
                className={`inline-flex items-center justify-end cursor-pointer transition-colors ${
                  sortField === "reportCount" ? "text-[#1C1917] font-semibold" : "hover:text-[#1C1917]"
                }`}
              >
                本月作品
                {renderSortIcon("reportCount")}
              </button>
            </TableHead>
            <TableHead className="py-2.5 px-2 text-right font-medium text-[#78716C]">
              <button
                type="button"
                onClick={() => handleSort("totalPlay")}
                className={`inline-flex items-center justify-end cursor-pointer transition-colors ${
                  sortField === "totalPlay" ? "text-[#1C1917] font-semibold" : "hover:text-[#1C1917]"
                }`}
              >
                总播放
                {renderSortIcon("totalPlay")}
              </button>
            </TableHead>
            <TableHead className="py-2.5 px-2 text-right font-medium text-[#78716C]">
              <button
                type="button"
                onClick={() => handleSort("avgPlay")}
                className={`inline-flex items-center justify-end cursor-pointer transition-colors ${
                  sortField === "avgPlay" ? "text-[#1C1917] font-semibold" : "hover:text-[#1C1917]"
                }`}
              >
                条均播放
                {renderSortIcon("avgPlay")}
              </button>
            </TableHead>
            <TableHead className="text-right font-medium" title="播放大于500的作品条数">有效作品</TableHead>
            <TableHead className="text-right font-medium" title="播放至少30,000，简单计数">优秀作品</TableHead>
            <TableHead className="py-2.5 px-2 text-right font-medium text-[#78716C]">
              <button
                type="button"
                onClick={() => handleSort("hitCount")}
                className={`inline-flex items-center justify-end cursor-pointer transition-colors ${
                  sortField === "hitCount" ? "text-[#1C1917] font-semibold" : "hover:text-[#1C1917]"
                }`}
              >
                爆款作品
                {renderSortIcon("hitCount")}
              </button>
            </TableHead>
            <TableHead className="py-2.5 px-2 text-right font-medium text-[#78716C]">
              <button
                type="button"
                onClick={() => handleSort("selfHandledCount")}
                className={`inline-flex items-center justify-end cursor-pointer transition-colors ${
                  sortField === "selfHandledCount" ? "text-[#1C1917] font-semibold" : "hover:text-[#1C1917]"
                }`}
              >
                独立完成
                {renderSortIcon("selfHandledCount")}
              </button>
            </TableHead>
            <TableHead className="py-2.5 pl-4 pr-4 text-left font-medium text-[#78716C]">
              名下账号
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className="text-[13px]">
          {sorted.map((row) => (
            <TableRow
              key={row.userId}
              className="border-b border-[#ECE7DE]/70 hover:bg-[#FBF9F5]/60 transition-colors cursor-pointer"
              onClick={() => onSelectPerson(row.userId)}
              onMouseEnter={() => onPrefetchPerson(row.userId)}
            >
              <TableCell className="py-2.5 pl-4 pr-2">
                <div className="flex items-center gap-1.5">
                  <Star className="size-3.5 text-[#B98A54] fill-[#B98A54] shrink-0" />
                  <span className="font-medium text-[#1C1917] truncate hover:text-[#D97757] transition-colors">
                    {row.name}
                  </span>
                </div>
              </TableCell>
              <TableCell className="py-2.5 px-2 text-right tabular-nums text-[#292524]">
                {row.accountCount}
              </TableCell>
              <TableCell className="py-2.5 px-2 text-right tabular-nums font-medium text-[#1C1917]">
                {row.reportCount}
              </TableCell>
              <TableCell className="py-2.5 px-2 text-right tabular-nums text-[#292524]">
                {formatBigNumber(row.totalPlay)}
              </TableCell>
              <TableCell className="py-2.5 px-2 text-right tabular-nums text-[#292524]">
                {formatBigNumber(row.avgPlay)}
              </TableCell>
              <TableCell className="text-right tabular-nums">{row.effectiveCount}</TableCell>
              <TableCell className="text-right tabular-nums">{row.excellentCount}</TableCell>
              <TableCell className="py-2.5 px-2 text-right tabular-nums">
                {row.hitCount > 0 ? (
                  <span className="text-[#D97757] font-semibold bg-[#D97757]/10 px-2 py-0.5 rounded text-[12px]">
                    {row.hitCount}
                  </span>
                ) : (
                  <span className="text-[#A8A29E]">0</span>
                )}
              </TableCell>
              <TableCell className="py-2.5 px-2 text-right tabular-nums text-[#78716C]">
                {row.selfHandledCount}
              </TableCell>
              <TableCell className="py-2.5 pl-4 pr-4">
                <div className="flex flex-wrap gap-1">
                  {row.accounts.slice(0, 3).map((account) => (
                    <span
                      key={account.accountId}
                      className="inline-block px-1.5 py-0.5 rounded bg-[#F5F3EE] text-[11px] text-[#292524] truncate max-w-[120px]"
                      title={account.accountName}
                    >
                      {account.accountName}
                    </span>
                  ))}
                  {row.accounts.length > 3 && (
                    <span className="inline-block px-1.5 py-0.5 text-[11px] text-[#78716C]">
                      +{row.accounts.length - 3}
                    </span>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
