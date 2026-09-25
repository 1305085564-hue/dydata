"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { CompassConstellationIllustration } from "@/components/editorial/editorial-illustrations";
import type { TalentRow } from "./types";
import { formatBigNumber } from "./types";
import { formatRate } from "./work-group-list-tab";

interface TalentTabProps {
  talents: TalentRow[];
  onSelectPerson: (userId: string) => void;
  onPrefetchPerson: (userId: string) => void;
}

type SortField =
  | "totalPlay"
  | "avgPlay"
  | "reportCount"
  | "accountCount"
  | "selfHandledCount"
  | "effectiveCount"
  | "excellentCount"
  | "followerConversionRate"
  | "interactionRate";

/** 排序是各表自己的状态，列头只接收排序能力（组详情与岗位 Tab 各自排序）。 */
export interface TalentColumnSort {
  sortField: string;
  sortOrder: "asc" | "desc";
  onSort: (field: SortField) => void;
  renderSortIcon: (field: SortField) => ReactNode;
}

/** 列头：岗位 Tab 与组详情共用同一份，杜绝两边列名/列序漂移。 */
export function TalentHeaderRow({ sort }: { sort: TalentColumnSort }) {
  return (
    <TableRow className="bg-transparent hover:bg-transparent border-b border-[#E2E2DF]/60 text-[13px] font-medium text-[#78716C]">
      <TableHead className="py-2.5 pl-4 pr-2 text-left font-medium text-[#78716C] w-[140px] sticky left-0 bg-[#FCFCFB] z-20 shadow-[1px_0_0_0_#E2E2DF]">
        达人姓名
      </TableHead>
      <TableHead className="py-2.5 px-2 text-right font-medium text-[#78716C]">
        <button
          type="button"
          onClick={() => sort.onSort("accountCount")}
          className={`inline-flex items-center justify-end cursor-pointer transition-colors ${
            sort.sortField === "accountCount" ? "text-[#141413] font-medium" : "hover:text-[#141413]"
          }`}
        >
          账号数
          {sort.renderSortIcon("accountCount")}
        </button>
      </TableHead>
      <TableHead className="py-2.5 px-2 text-right font-medium text-[#78716C]">
        <button
          type="button"
          onClick={() => sort.onSort("reportCount")}
          className={`inline-flex items-center justify-end cursor-pointer transition-colors ${
            sort.sortField === "reportCount" ? "text-[#141413] font-medium" : "hover:text-[#141413]"
          }`}
        >
          本月作品
          {sort.renderSortIcon("reportCount")}
        </button>
      </TableHead>
      <TableHead className="py-2.5 px-2 text-right font-medium text-[#78716C]">
        <button
          type="button"
          onClick={() => sort.onSort("totalPlay")}
          className={`inline-flex items-center justify-end cursor-pointer transition-colors ${
            sort.sortField === "totalPlay" ? "text-[#141413] font-medium" : "hover:text-[#141413]"
          }`}
        >
          总播放
          {sort.renderSortIcon("totalPlay")}
        </button>
      </TableHead>
      <TableHead className="py-2.5 px-2 text-right font-medium text-[#78716C]">
        <button
          type="button"
          onClick={() => sort.onSort("avgPlay")}
          className={`inline-flex items-center justify-end cursor-pointer transition-colors ${
            sort.sortField === "avgPlay" ? "text-[#141413] font-medium" : "hover:text-[#141413]"
          }`}
        >
          条均播放
          {sort.renderSortIcon("avgPlay")}
        </button>
      </TableHead>
      <TableHead className="py-2.5 px-2 text-right font-medium text-[#78716C]">
        <button
          type="button"
          onClick={() => sort.onSort("effectiveCount")}
          className={`inline-flex items-center justify-end cursor-pointer transition-colors ${
            sort.sortField === "effectiveCount" ? "text-[#141413] font-medium" : "hover:text-[#141413]"
          }`}
          title="播放大于500的作品条数"
        >
          有效作品
          {sort.renderSortIcon("effectiveCount")}
        </button>
      </TableHead>
      <TableHead className="py-2.5 px-2 text-right font-medium text-[#78716C]">
        <button
          type="button"
          onClick={() => sort.onSort("excellentCount")}
          className={`inline-flex items-center justify-end cursor-pointer transition-colors ${
            sort.sortField === "excellentCount" ? "text-[#141413] font-medium" : "hover:text-[#141413]"
          }`}
          title="播放至少30,000，简单计数"
        >
          优秀作品
          {sort.renderSortIcon("excellentCount")}
        </button>
      </TableHead>
      <TableHead className="py-2.5 px-2 text-right font-medium text-[#78716C]">
        <button
          type="button"
          onClick={() => sort.onSort("selfHandledCount")}
          className={`inline-flex items-center justify-end cursor-pointer transition-colors ${
            sort.sortField === "selfHandledCount" ? "text-[#141413] font-medium" : "hover:text-[#141413]"
          }`}
        >
          独立完成
          {sort.renderSortIcon("selfHandledCount")}
        </button>
      </TableHead>
      {(["followerConversionRate", "interactionRate"] as const).map((field) => (
        <TableHead key={field} className="py-2.5 px-2 text-right font-medium text-[#78716C]">
          <button type="button" onClick={() => sort.onSort(field)} className={`inline-flex items-center justify-end cursor-pointer transition-colors ${sort.sortField === field ? "text-[#141413] font-medium" : "hover:text-[#141413]"}`}>
            {field === "followerConversionRate" ? "转粉率" : "互动率"}{sort.renderSortIcon(field)}
          </button>
        </TableHead>
      ))}
      <TableHead className="py-2.5 pl-4 pr-4 text-left font-medium text-[#78716C]">
        名下账号
      </TableHead>
    </TableRow>
  );
}

/** 单人数据行：只出单元格，行容器由调用方决定（岗位 Tab 行不可整行点，组详情行可整行点）。 */
export function TalentRowCells({ row }: { row: TalentRow }) {
  const isZero = row.reportCount === 0;

  return (
    <>
      <TableCell className="py-2.5 pl-4 pr-2 sticky left-0 bg-white group-hover:bg-[#F7F7F6] z-10 shadow-[1px_0_0_0_#E2E2DF]">
        <span className={`font-medium truncate hover:text-[#D97757] transition-colors ${
          isZero ? "text-[#78716C]" : "text-[#141413]"
        }`}>
          {row.name}
        </span>
      </TableCell>
      <TableCell className={`py-2.5 px-2 text-right tabular-nums ${isZero ? "text-[#A8A29E]" : "text-[#1F1E1D]"}`}>
        {row.accountCount}
      </TableCell>
      <TableCell className={`py-2.5 px-2 text-right tabular-nums ${isZero ? "text-[#A8A29E]" : "font-medium text-[#141413]"}`}>
        {row.reportCount}
      </TableCell>
      <TableCell className={`py-2.5 px-2 text-right tabular-nums ${isZero ? "text-[#A8A29E]" : "text-[#1F1E1D]"}`}>
        {formatBigNumber(row.totalPlay)}
      </TableCell>
      <TableCell className={`py-2.5 px-2 text-right tabular-nums ${isZero ? "text-[#A8A29E]" : "text-[#1F1E1D]"}`}>
        {formatBigNumber(row.avgPlay)}
      </TableCell>
      <TableCell className={`py-2.5 px-2 text-right tabular-nums ${isZero ? "text-[#A8A29E]" : "text-[#1F1E1D]"}`}>{row.effectiveCount}</TableCell>
      <TableCell className={`py-2.5 px-2 text-right tabular-nums ${isZero ? "text-[#A8A29E]" : "text-[#1F1E1D]"}`}>{row.excellentCount}</TableCell>
      <TableCell className="py-2.5 px-2 text-right tabular-nums text-[#78716C]">
        {row.selfHandledCount}
      </TableCell>
      <TableCell className={`py-2.5 px-2 text-right tabular-nums ${isZero ? "text-[#A8A29E]" : "text-[#1F1E1D]"}`}>{formatRate(row.followerConversionRate)}</TableCell>
      <TableCell className={`py-2.5 px-2 text-right tabular-nums ${isZero ? "text-[#A8A29E]" : "text-[#1F1E1D]"}`}>{formatRate(row.interactionRate)}</TableCell>
      <TableCell className="py-2.5 pl-4 pr-4">
        <div className="flex flex-wrap gap-1">
          {row.accounts.slice(0, 3).map((account) => (
            <span
              key={account.accountId}
              className="inline-block px-1.5 py-0.5 rounded bg-[#F1F1F0] text-[12px] text-[#1F1E1D] truncate max-w-[120px]"
              title={account.accountName}
            >
              {account.accountName}
            </span>
          ))}
          {row.accounts.length > 3 && (
            <span className="inline-block px-1.5 py-0.5 text-[12px] text-[#78716C]">
              +{row.accounts.length - 3}
            </span>
          )}
        </div>
      </TableCell>
    </>
  );
}

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
      const left = a[sortField] ?? 0;
      const right = b[sortField] ?? 0;
      const diff = sortOrder === "desc" ? right - left : left - right;
      return diff || a.name.localeCompare(b.name, "zh-CN");
    });
    return list;
  }, [talents, sortField, sortOrder]);

  if (talents.length === 0) {
    return (
      <div className="py-16 text-center">
        <EmptyState
          illustration={<CompassConstellationIllustration size={96} />}
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
      return <ArrowUpDown className="size-3 text-[#78716C]/40 ml-1 inline" />;
    }
    return sortOrder === "desc" ? (
      <ArrowDown className="size-3 text-[#141413] ml-1 inline" />
    ) : (
      <ArrowUp className="size-3 text-[#141413] ml-1 inline" />
    );
  };

  return (
    <div className="space-y-2">
      <div className="rounded-xl bg-white shadow-card-ring overflow-hidden">
      <Table>
        <TableHeader>
          <TalentHeaderRow sort={{ sortField, sortOrder, onSort: handleSort, renderSortIcon }} />
        </TableHeader>
        <TableBody className="text-[13px]">
          {sorted.map((row) => (
            <TableRow
              key={row.userId}
              tabIndex={0}
              role="button"
              aria-label={`查看${row.name}的个人档案`}
              className="group border-b border-[#E2E2DF]/70 hover:bg-[#F7F7F6] focus:bg-[#F7F7F6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D97757] focus-visible:ring-offset-1 transition-colors cursor-pointer"
              onClick={() => onSelectPerson(row.userId)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  onSelectPerson(row.userId);
                } else if (e.key === " ") {
                  e.preventDefault();
                  onSelectPerson(row.userId);
                }
              }}
              onMouseEnter={() => onPrefetchPerson(row.userId)}
              onFocus={() => onPrefetchPerson(row.userId)}
            >
              <TalentRowCells row={row} />
            </TableRow>
          ))}
        </TableBody>
      </Table>
      </div>
      <p className="px-1 text-[12px] text-[#78716C]">作品数按日报统计；转粉率、互动率按作品最新 24h 快照加总后计算，未同步视频复盘的作品不参与比率。</p>
    </div>
  );
}
