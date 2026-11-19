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
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SimpleTooltip } from "@/components/ui/tooltip";
import {
  COLLABORATION_METRIC_HEADER_TIPS,
  CollaborationQualityCells,
} from "./collaboration-quality-hints";
import { CompassConstellationIllustration } from "@/components/editorial/editorial-illustrations";
import { pinCurrentUserFirst } from "@/lib/collaboration/domain/workbench-state";
import { MemberZeroOutputBanner, SelfMemberBadge } from "./member-self-hint";
import type { TalentRow } from "./types";
import { formatBigNumber } from "./types";
import { formatRate } from "./work-group-list-tab";

interface TalentTabProps {
  talents: TalentRow[];
  currentUserId?: string | null;
  isMemberViewer?: boolean;
  onSelectPerson: (userId: string) => void;
  onPrefetchPerson: (userId: string) => void;
}

type SortField =
  | "totalPlay"
  | "avgPlay"
  | "reportCount"
  | "accountCount"
  | "selfHandledCount"
  | "followerConversionRate"
  | "interactionRate";

export const TALENT_TABLE_MIN_WIDTH = "min-w-[1030px]";

export function TalentTableColGroup() {
  return (
    <colgroup>
      <col className="min-w-[90px] w-auto" />
      <col className="w-[72px]" />
      <col className="w-[80px]" />
      <col className="w-[80px]" />
      <col className="w-[80px]" />
      <col className="w-[80px]" />
      <col className="w-[76px]" />
      <col className="w-[76px]" />
      <col className="w-[82px]" />
      <col className="w-[82px]" />
      <col className="w-[88px]" />
      <col className="min-w-[140px] w-auto" />
    </colgroup>
  );
}

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
    <TableRow className="bg-transparent hover:bg-transparent border-b border-[#E2E2DF]/60 text-[12px] font-normal text-[#78716C]">
      <TableHead className="py-2 pl-4 pr-2 text-left font-normal text-[#78716C] min-w-[90px] sticky left-0 bg-[#FCFCFB] z-20 shadow-[1px_0_0_0_#E2E2DF]">
        达人姓名
      </TableHead>
      <TableHead className="py-2 px-2 text-right font-normal text-[#78716C]">
        <button
          type="button"
          onClick={() => sort.onSort("accountCount")}
          className={`inline-flex items-center justify-end w-full cursor-pointer transition-colors ${
            sort.sortField === "accountCount" ? "text-[#141413] font-normal" : "hover:text-[#141413]"
          }`}
        >
          账号数
          {sort.renderSortIcon("accountCount")}
        </button>
      </TableHead>
      <TableHead className="py-2 px-2 text-right font-normal text-[#78716C]">
        <button
          type="button"
          onClick={() => sort.onSort("reportCount")}
          className={`inline-flex items-center justify-end w-full cursor-pointer transition-colors ${
            sort.sortField === "reportCount" ? "text-[#141413] font-normal" : "hover:text-[#141413]"
          }`}
        >
          本月作品
          {sort.renderSortIcon("reportCount")}
        </button>
      </TableHead>
      <TableHead className="py-2 px-2 text-right font-normal text-[#78716C]">
        <button
          type="button"
          onClick={() => sort.onSort("totalPlay")}
          className={`inline-flex items-center justify-end w-full cursor-pointer transition-colors ${
            sort.sortField === "totalPlay" ? "text-[#141413] font-normal" : "hover:text-[#141413]"
          }`}
        >
          总播放
          {sort.renderSortIcon("totalPlay")}
        </button>
      </TableHead>
      <TableHead className="py-2 px-2 text-right font-normal text-[#78716C]">
        <button
          type="button"
          onClick={() => sort.onSort("avgPlay")}
          className={`inline-flex items-center justify-end w-full cursor-pointer transition-colors ${
            sort.sortField === "avgPlay" ? "text-[#141413] font-normal" : "hover:text-[#141413]"
          }`}
        >
          条均播放
          {sort.renderSortIcon("avgPlay")}
        </button>
      </TableHead>
      <TableHead className="py-2 px-2 text-right font-normal text-[#78716C]">
        <button
          type="button"
          onClick={() => sort.onSort("selfHandledCount")}
          className={`inline-flex items-center justify-end w-full cursor-pointer transition-colors ${
            sort.sortField === "selfHandledCount" ? "text-[#141413] font-normal" : "hover:text-[#141413]"
          }`}
        >
          独立完成
          {sort.renderSortIcon("selfHandledCount")}
        </button>
      </TableHead>
      {(["followerConversionRate", "interactionRate"] as const).map((field) => (
        <TableHead key={field} className="py-2 px-2 text-right font-normal text-[#78716C]">
          <SimpleTooltip
            align="end"
            contentClassName="text-[12px] max-w-xs text-left"
            tip={COLLABORATION_METRIC_HEADER_TIPS[field]}
          >
            <button type="button" onClick={() => sort.onSort(field)} className={`inline-flex items-center justify-end w-full cursor-pointer transition-colors ${sort.sortField === field ? "text-[#141413] font-normal" : "hover:text-[#141413]"}`}>
              <span className="inline-flex flex-col items-end leading-tight">
                <span>{field === "followerConversionRate" ? "转粉率" : "互动率"}</span>
                <span className="text-[10px] text-[#A8A29E]">（参考）</span>
              </span>{sort.renderSortIcon(field)}
            </button>
          </SimpleTooltip>
        </TableHead>
      ))}
      <TableHead className="py-2 px-2 text-right font-normal text-[#78716C]">
        <SimpleTooltip
          align="end"
          contentClassName="text-[12px] max-w-xs text-left"
          tip={COLLABORATION_METRIC_HEADER_TIPS.avgInteractionAchievement}
        >
          <span className="inline-flex items-center justify-end w-full cursor-help hover:text-[#141413] transition-colors">
            互动数据
          </span>
        </SimpleTooltip>
      </TableHead>
      <TableHead className="py-2 px-2 text-right font-normal text-[#78716C]">
        <SimpleTooltip
          align="end"
          contentClassName="text-[12px] max-w-xs text-left"
          tip={COLLABORATION_METRIC_HEADER_TIPS.avgContentAchievement}
        >
          <span className="inline-flex items-center justify-end w-full cursor-help hover:text-[#141413] transition-colors">
            留存数据
          </span>
        </SimpleTooltip>
      </TableHead>
      <TableHead className="py-2 px-2 text-right font-normal text-[#78716C]">
        <SimpleTooltip
          align="end"
          contentClassName="text-[12px] max-w-xs text-left"
          tip={COLLABORATION_METRIC_HEADER_TIPS.goodExcellentRate}
        >
          <span className="inline-flex items-center justify-end w-full cursor-help hover:text-[#141413] transition-colors">
            良优率
          </span>
        </SimpleTooltip>
      </TableHead>
      <TableHead className="py-2 pl-4 pr-4 text-left font-normal text-[#78716C]">
        名下账号
      </TableHead>
    </TableRow>
  );
}

/** 单人数据行：只出单元格，行容器由调用方决定（岗位 Tab 行不可整行点，组详情行可整行点）。 */
export function TalentRowCells({ row, isSelf = false }: { row: TalentRow; isSelf?: boolean }) {
  const isZero = row.reportCount === 0;
  const displayedAccounts = row.accounts.slice(0, 3).map((a) => a.accountName).join("、");
  const extraCount = row.accounts.length - Math.min(row.accounts.length, 3);

  return (
    <>
      <TableCell className={`py-2 pl-4 pr-2 sticky left-0 ${isSelf ? "bg-[#F7F7F6]" : "bg-white"} group-hover:bg-[#F7F7F6] z-10 shadow-[1px_0_0_0_#E2E2DF]`}>
        <span className="inline-flex items-center max-w-full">
          <span className={`text-[14px] font-normal truncate hover:text-[#D97757] transition-colors ${
            isZero ? "text-[#78716C]" : "text-[#141413]"
          }`}>
            {row.name}
          </span>
          {isSelf && <SelfMemberBadge />}
        </span>
      </TableCell>
      <TableCell className={`py-2 px-2 text-right tabular-nums ${isZero ? "text-[#A8A29E]" : "text-[#1F1E1D]"}`}>
        {row.accountCount}
      </TableCell>
      <TableCell className={`py-2 px-2 text-right tabular-nums ${isZero ? "text-[#A8A29E]" : "font-normal text-[#141413]"}`}>
        {row.reportCount}
      </TableCell>
      <TableCell className={`py-2 px-2 text-right tabular-nums ${isZero ? "text-[#A8A29E]" : "text-[#1F1E1D]"}`}>
        {formatBigNumber(row.totalPlay)}
      </TableCell>
      <TableCell className={`py-2 px-2 text-right tabular-nums ${isZero ? "text-[#A8A29E]" : "text-[#1F1E1D]"}`}>
        {formatBigNumber(row.avgPlay)}
      </TableCell>
      <TableCell className="py-2 px-2 text-right tabular-nums text-[#78716C]">
        {row.selfHandledCount}
      </TableCell>
      <TableCell className={`py-2 px-2 text-right tabular-nums ${isZero ? "text-[#A8A29E]" : "text-[#1F1E1D]"}`}>{formatRate(row.followerConversionRate)}</TableCell>
      <TableCell className={`py-2 px-2 text-right tabular-nums ${isZero ? "text-[#A8A29E]" : "text-[#1F1E1D]"}`}>{formatRate(row.interactionRate)}</TableCell>
      <CollaborationQualityCells writerQuality={row.writerQuality} />
      <TableCell className="p-0 text-left text-[#1F1E1D] overflow-hidden">
        {extraCount > 0 ? (
          <SimpleTooltip
            align="end"
            contentClassName="text-[12px] max-w-xs text-left"
            tip={
              <>
                <p className="font-normal text-[#141413] mb-1">名下账号：</p>
                <p className="text-[#1F1E1D] leading-relaxed">
                  {row.accounts.map((account) => account.accountName).join("、")}
                </p>
              </>
            }
          >
            <div className="cursor-help flex h-full w-full items-center py-2 pl-4 pr-4 text-left overflow-hidden">
              <span className="truncate">{displayedAccounts || "—"}</span>
              <span className="ml-1 shrink-0 text-[12px] text-[#78716C] underline decoration-dotted underline-offset-2">
                等 {row.accounts.length} 个账号
              </span>
            </div>
          </SimpleTooltip>
        ) : (
          <div className="py-2 pl-4 pr-4 overflow-hidden">
            <span className="block truncate">{displayedAccounts || "—"}</span>
          </div>
        )}
      </TableCell>
    </>
  );
}

export function TalentTab({
  talents,
  currentUserId = null,
  isMemberViewer = false,
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
    return pinCurrentUserFirst(list, currentUserId);
  }, [talents, sortField, sortOrder, currentUserId]);

  const showSelfZeroHint = Boolean(
    isMemberViewer &&
      currentUserId &&
      !talents.some((r) => r.userId === currentUserId && r.reportCount > 0),
  );

  if (talents.length === 0) {
    return (
      <div className="space-y-3">
        {showSelfZeroHint && <MemberZeroOutputBanner tab="talents" />}
        <div className="py-16 text-center">
          <EmptyState
            illustration={<CompassConstellationIllustration size={96} />}
            title="本月暂无达人作品记录"
            description="有自营或出镜账号的成员，作品与数据会汇总在这里。"
          />
        </div>
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
      {showSelfZeroHint && <MemberZeroOutputBanner tab="talents" />}
      <Card className="overflow-hidden p-0 gap-0">
      <Table className={`${TALENT_TABLE_MIN_WIDTH} table-fixed`}>
        <TalentTableColGroup />
        <TableHeader>
          <TalentHeaderRow sort={{ sortField, sortOrder, onSort: handleSort, renderSortIcon }} />
        </TableHeader>
        <TableBody className="text-[13px]">
          {sorted.map((row) => {
            const isSelf = Boolean(currentUserId && row.userId === currentUserId);
            return (
            <TableRow
              key={row.userId}
              tabIndex={0}
              role="button"
              aria-label={`查看${row.name}的个人档案`}
              className={`group border-b border-[#E2E2DF]/60 ${isSelf ? "bg-[#F7F7F6]" : ""} hover:bg-[#F7F7F6] focus:bg-[#F7F7F6] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#141413]/10 focus-visible:ring-offset-1 transition-colors cursor-pointer`}
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
              <TalentRowCells row={row} isSelf={isSelf} />
            </TableRow>
            );
          })}
        </TableBody>
      </Table>
      </Card>
      <p className="px-1 text-[12px] text-[#78716C]">作品数按日报统计；转粉率、互动率按作品最新 24h 快照加总后计算，未同步数据复盘的作品不参与比率。</p>
    </div>
  );
}
