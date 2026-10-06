"use client";

import {
  CollaborationDiagnosisContext,
  CollaborationWorkReviewLink,
} from "@/components/admin/collaboration-work-review-link";
import { WriterCertificationButton } from "./writer-certification-button";
import { Fragment, useContext, useMemo, useState, type ReactNode } from "react";
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
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { ListRow } from "@/components/ui/list-row";
import { DeskStudyIllustration, CompassConstellationIllustration } from "@/components/editorial/editorial-illustrations";
import { getWorkQuality } from "@/lib/collaboration/work-quality";
import { formatBigNumber, type StaffRow } from "./types";
import { formatRate } from "./work-group-list-tab";

interface StaffTabProps {
  rows: StaffRow[];
  certifiableUserIds?: string[];
  role: "writer" | "editor";
  isLoading?: boolean;
  onSelectPerson: (userId: string) => void;
  onPrefetchPerson?: (userId: string) => void;
}

type SortField =
  | "reportCount"
  | "totalPlay"
  | "avgPlay"
  | "effectiveCount"
  | "excellentCount"
  | "followerConversionRate"
  | "interactionRate"
  | "avgInteractionAchievement"
  | "avgCoreAchievement"
  | "goodExcellentRate";

export type StaffRole = "writer" | "editor";

/** 文案/剪辑表列定义：岗位 Tab 与「按团队」组详情共用，改列只改一处。 */
export const STAFF_TABLE_MIN_WIDTH: Record<StaffRole, string> = {
  writer: "min-w-[1335px]",
  editor: "min-w-[710px]",
};

/** 排序是各表自己的状态，列头只接收排序能力，不持有状态（组详情与岗位 Tab 各自排序）。 */
export interface StaffColumnSort {
  sortField: string;
  sortOrder: "asc" | "desc";
  onSort: (field: SortField) => void;
  renderSortIcon: (field: SortField) => ReactNode;
}

export function StaffTableColGroup({ role }: { role: StaffRole }) {
  return (
    <colgroup>
      <col className="w-10" />
      <col className="w-[90px]" />
      <col className="w-[150px]" />
      <col className="w-[80px]" />
      <col className="w-[80px]" />
      <col className="w-[90px]" />
      <col className="w-[90px]" />
      <col className="w-[90px]" />
      {role === "writer" && (
        <>
          <col className="w-[80px]" />
          <col className="w-[80px]" />
          <col className="w-[80px]" />
          <col className="w-[90px]" />
          <col className="w-[90px]" />
          <col className="w-[75px]" />
          <col className="w-[130px]" />
        </>
      )}
    </colgroup>
  );
}

/** 列头：岗位 Tab 与组详情完全同一份，杜绝两边列名/列序漂移。 */
export function StaffHeaderRow({ role, sort }: { role: StaffRole; sort: StaffColumnSort }) {
  const countLabel = "本月篇数";

  return (
    <TableRow className="bg-transparent hover:bg-transparent border-b border-[#E2E2DF]/60 text-[13px] font-normal text-[#78716C]">
      <TableHead className="w-10 sticky left-0 bg-[#FCFCFB] z-20" />
      <TableHead className="text-left font-normal text-[#78716C] pl-4 sticky left-10 bg-[#FCFCFB] z-20 shadow-[1px_0_0_0_#E2E2DF]">姓名</TableHead>
      <TableHead className="text-left font-normal text-[#78716C] pl-4">负责账号</TableHead>
      <TableHead className="text-right font-normal text-[#78716C]">
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
      <TableHead className="text-right font-normal text-[#78716C]">
        <button
          type="button"
          onClick={() => sort.onSort("avgPlay")}
          className={`inline-flex items-center justify-end w-full cursor-pointer transition-colors ${
            sort.sortField === "avgPlay" ? "text-[#141413] font-normal" : "hover:text-[#141413]"
          }`}
        >
          条均播
          {sort.renderSortIcon("avgPlay")}
        </button>
      </TableHead>
      <TableHead className="text-right font-normal text-[#78716C]">
        <button
          type="button"
          onClick={() => sort.onSort("reportCount")}
          className={`inline-flex items-center justify-end w-full cursor-pointer transition-colors ${
            sort.sortField === "reportCount" ? "text-[#141413] font-normal" : "hover:text-[#141413]"
          }`}
        >
          {countLabel}
          {sort.renderSortIcon("reportCount")}
        </button>
      </TableHead>
      <TableHead className="text-right font-normal text-[#78716C]">
        <button
          type="button"
          onClick={() => sort.onSort("effectiveCount")}
          title="播放大于500的作品条数"
          className={`inline-flex items-center justify-end w-full cursor-pointer transition-colors ${
            sort.sortField === "effectiveCount" ? "text-[#141413] font-normal" : "hover:text-[#141413]"
          }`}
        >
          有效作品
          {sort.renderSortIcon("effectiveCount")}
        </button>
      </TableHead>
      <TableHead className="text-right font-normal text-[#78716C]">
        <button
          type="button"
          onClick={() => sort.onSort("excellentCount")}
          title="播放至少30,000，简单计数"
          className={`inline-flex items-center justify-end w-full cursor-pointer transition-colors ${
            sort.sortField === "excellentCount" ? "text-[#141413] font-normal" : "hover:text-[#141413]"
          }`}
        >
          优秀作品
          {sort.renderSortIcon("excellentCount")}
        </button>
      </TableHead>
      {role === "writer" && (
        <>
          <TableHead className="text-right font-normal text-[#78716C]">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger className="inline-flex items-center justify-end w-full cursor-help hover:text-[#141413] transition-colors gap-0.5">
                  绩效条
                  <span className="text-[12px] text-[#78716C]/80 font-normal">ⓘ</span>
                </TooltipTrigger>
                <TooltipContent className="text-[12px] max-w-xs text-left">
                  <p className="font-normal text-[#FCFCFB] mb-1">文案绩效核算口径：</p>
                  <p className="text-[#FCFCFB] leading-relaxed">
                    播放≥500条数 + 优秀作品×2。<br />
                    <span className="text-[#FCFCFB] text-[12px]">注：未认证文案不计入绩效结算。</span>
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </TableHead>
          {(["followerConversionRate", "interactionRate"] as const).map((field) => (
            <TableHead key={field} className="text-right font-normal text-[#78716C]">
              <button type="button" onClick={() => sort.onSort(field)} className={`inline-flex items-center justify-end w-full cursor-pointer transition-colors ${sort.sortField === field ? "text-[#141413] font-normal" : "hover:text-[#141413]"}`}>
                {field === "followerConversionRate" ? "转粉率" : "互动率"}{sort.renderSortIcon(field)}
              </button>
            </TableHead>
          ))}
          <TableHead className="text-right font-normal text-[#78716C]">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger
                  onClick={() => sort.onSort("avgInteractionAchievement")}
                  className={`inline-flex items-center justify-end w-full cursor-pointer transition-colors ${
                    sort.sortField === "avgInteractionAchievement"
                      ? "text-[#141413] font-normal"
                      : "hover:text-[#141413]"
                  }`}
                >
                  互动达成
                  {sort.renderSortIcon("avgInteractionAchievement")}
                </TooltipTrigger>
                <TooltipContent className="text-[12px] max-w-xs text-left">
                  <p className="font-normal text-[#FCFCFB] mb-1">互动达成率均值：</p>
                  <p className="text-[#FCFCFB] leading-relaxed">
                    两项指标均完整可计算作品的互动达成率算术平均，不按播放加权。
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </TableHead>
          <TableHead className="text-right font-normal text-[#78716C]">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger
                  onClick={() => sort.onSort("avgCoreAchievement")}
                  className={`inline-flex items-center justify-end w-full cursor-pointer transition-colors ${
                    sort.sortField === "avgCoreAchievement"
                      ? "text-[#141413] font-normal"
                      : "hover:text-[#141413]"
                  }`}
                >
                  核心达成
                  {sort.renderSortIcon("avgCoreAchievement")}
                </TooltipTrigger>
                <TooltipContent className="text-[12px] max-w-xs text-left">
                  <p className="font-normal text-[#FCFCFB] mb-1">核心指标达成率均值：</p>
                  <p className="text-[#FCFCFB] leading-relaxed">
                    干货按收藏率、复盘及其他按点赞率计算达成率后求平均。
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </TableHead>
          <TableHead className="text-right font-normal text-[#78716C] px-1.5">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger
                  onClick={() => sort.onSort("goodExcellentRate")}
                  className={`inline-flex items-center justify-end w-full cursor-pointer transition-colors ${
                    sort.sortField === "goodExcellentRate"
                      ? "text-[#141413] font-normal"
                      : "hover:text-[#141413]"
                  }`}
                >
                  良优率
                  {sort.renderSortIcon("goodExcellentRate")}
                </TooltipTrigger>
                <TooltipContent className="text-[12px] max-w-xs text-left">
                  <p className="font-normal text-[#FCFCFB] mb-1">综合良优率口径：</p>
                  <p className="text-[#FCFCFB] leading-relaxed">
                    综合评级为良或优的署名日报篇数 ÷ 综合已评级署名日报篇数。<br />
                    播放不足 5,000 直接判劣计入分母；无已评级作品时显示「—」。
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </TableHead>
          <TableHead className="text-right font-normal text-[#78716C] pr-6">认证状态</TableHead>
        </>
      )}
    </TableRow>
  );
}

/** 认证状态单元格：无认证权限（如组详情、只读视角）时只读展示，不挂载带路由的认证按钮。 */
function WriterCertificationCell({
  row,
  certifiableUserIds,
}: {
  row: StaffRow;
  certifiableUserIds: string[];
}) {
  const hasWork = row.reportCount > 0;
  if (!certifiableUserIds.includes(row.userId)) {
    return (
      <Badge variant={row.isCertified || !hasWork ? "secondary" : "warning"}>
        {row.isCertified ? (row.certifiedByName ? `${row.certifiedByName}认证` : "已认证") : (hasWork ? "未认证 (有产出)" : "未认证")}
      </Badge>
    );
  }
  return (
    <WriterCertificationButton
      userId={row.userId}
      certified={Boolean(row.isCertified)}
      certifiedByName={row.certifiedByName}
      canCertify
      hasWork={hasWork}
    />
  );
}

/** 单人数据行：只出单元格，行容器（是否可点、键盘行为）由调用方决定。 */
export function StaffRowCells({
  row,
  role,
  isExpanded,
  onToggleExpand,
  onSelectPerson,
  onPrefetchPerson,
  certifiableUserIds = [],
}: {
  row: StaffRow;
  role: StaffRole;
  isExpanded: boolean;
  onToggleExpand: (userId: string) => void;
  onSelectPerson: (userId: string) => void;
  onPrefetchPerson?: (userId: string) => void;
  certifiableUserIds?: string[];
}) {
  const displayedAccounts = row.involvedAccounts.slice(0, 2).map((a) => a.accountName).join("、");
  const extraCount = row.involvedAccountTotal - Math.min(row.involvedAccounts.length, 2);
  const isZero = row.reportCount === 0;

  return (
    <>
      <TableCell className="w-10 px-2 py-2 sticky left-0 bg-white group-hover:bg-[#F7F7F6] z-10">
        <button
          type="button"
          onClick={() => onToggleExpand(row.userId)}
          aria-label={isExpanded ? `收起${row.name}的全部作品` : `查看${row.name}的全部作品`}
          className={`flex size-6 items-center justify-center rounded-md transition-colors cursor-pointer ${
            isExpanded ? "text-[#141413]" : "text-[#78716C] hover:bg-[#EBEBE9] hover:text-[#141413]"
          }`}
        >
          {isExpanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        </button>
      </TableCell>
      <TableCell className="text-left font-normal pl-4 py-2 sticky left-10 bg-white group-hover:bg-[#F7F7F6] z-10 shadow-[1px_0_0_0_#E2E2DF]">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onSelectPerson(row.userId);
          }}
          onMouseEnter={() => onPrefetchPerson?.(row.userId)}
          onFocus={() => onPrefetchPerson?.(row.userId)}
          className="hover:underline transition-colors cursor-pointer"
        >
          <span className={`text-[14px] font-normal hover:text-[#D97757] transition-colors ${
            isZero ? "text-[#78716C]" : "text-[#141413]"
          }`}>
            {row.name}
          </span>
        </button>
      </TableCell>
      <TableCell className="text-left py-2 pl-4 text-[#1F1E1D] overflow-hidden">
        {extraCount > 0 ? (
          <Tooltip>
            <TooltipTrigger className="cursor-help inline-flex max-w-full items-center text-left">
              <span className="truncate">{displayedAccounts || "—"}</span>
              <span className="ml-1 shrink-0 text-[12px] text-[#78716C] underline decoration-dotted underline-offset-2">
                等 {row.involvedAccountTotal} 个账号
              </span>
            </TooltipTrigger>
            <TooltipContent className="text-[12px] max-w-xs">
              <p className="font-normal text-[#FCFCFB] mb-1">经手账号：</p>
              <p className="text-[#FCFCFB] leading-relaxed">
                {row.involvedAccounts.map((account) => account.accountName).join("、")}（展开本行可查看逐篇明细）
              </p>
            </TooltipContent>
          </Tooltip>
        ) : (
          <span className="block truncate">{displayedAccounts || "—"}</span>
        )}
      </TableCell>
      <TableCell className={`text-right tabular-nums py-2 ${isZero ? "text-[#A8A29E]" : "text-[#1F1E1D]"}`}>
        {formatBigNumber(row.totalPlay)}
      </TableCell>
      <TableCell className={`text-right tabular-nums py-2 ${isZero ? "text-[#A8A29E]" : "text-[#1F1E1D]"}`}>
        {formatBigNumber(row.avgPlay)}
      </TableCell>
      <TableCell className={`text-right tabular-nums py-2 ${isZero ? "text-[#A8A29E]" : "font-normal text-[#141413]"}`}>
        {row.reportCount}
      </TableCell>
      <TableCell className={`text-right tabular-nums py-2 ${isZero ? "text-[#A8A29E]" : "text-[#1F1E1D]"}`}>{row.effectiveCount}</TableCell>
      <TableCell className={`text-right tabular-nums py-2 ${isZero ? "text-[#A8A29E]" : "text-[#1F1E1D]"}`}>{row.excellentCount}</TableCell>
      {role === "writer" && (
        <>
          <TableCell className="text-right tabular-nums py-2">
            {row.billingCount !== null ? (
              <Tooltip>
                <TooltipTrigger
                  className="font-normal text-[#141413] hover:text-[#D97757] hover:underline decoration-dotted underline-offset-2 cursor-pointer inline-flex items-center justify-end"
                >
                  {row.billingCount}
                </TooltipTrigger>
                <TooltipContent
                  side="left"
                  align="center"
                  className="w-64 p-3 bg-white text-[#141413] border border-[#E2E2DF] shadow-claude-dialog rounded-2xl space-y-2 text-left"
                >
                  <div className="flex items-center justify-between border-b border-[#E2E2DF]/60 pb-1.5">
                    <span className="text-[12px] font-normal text-[#141413]">绩效条数核算明细</span>
                    <span className="text-[12px] text-[#78716C] bg-[#F1F1F0] px-1.5 py-0.5 rounded-md">
                      {row.name}
                    </span>
                  </div>
                  <div className="space-y-1 text-[12px]">
                    <ListRow className="py-0.5 text-[#78716C] border-b-0">
                      <span>计费基数（播放≥500）</span>
                      <span className="tabular-nums font-normal text-[#141413]">{row.billingCount - row.excellentCount * 2} 条</span>
                    </ListRow>
                    <ListRow className="py-0.5 text-[#78716C] border-b-0">
                      <span>优秀作品加成（{row.excellentCount} × 2）</span>
                      <span className="tabular-nums font-normal text-[#141413]">+{row.excellentCount * 2} 条</span>
                    </ListRow>
                    <ListRow className="border-t border-[#E2E2DF]/60 pt-1.5 pb-0 border-b-0 font-normal">
                      <span className="text-[#141413]">最终计费条数</span>
                      <span className="tabular-nums text-[13px] font-normal text-[#141413]">{row.billingCount} 条</span>
                    </ListRow>
                  </div>
                  {row.certifiedByName && (
                    <div className="text-[12px] text-[#78716C] bg-[#F7F7F6] px-2 py-1 rounded-md border border-[#E2E2DF]/60">
                      已由 <span className="text-[#141413] font-normal">{row.certifiedByName}</span> 认证生效
                    </div>
                  )}
                </TooltipContent>
              </Tooltip>
            ) : (
              <span className="text-[#A8A29E]" title="未认证成员不计费">—</span>
            )}
          </TableCell>
          <TableCell className="text-right tabular-nums text-[#1F1E1D] py-2">{formatRate(row.followerConversionRate)}</TableCell>
          <TableCell className="text-right tabular-nums text-[#1F1E1D] py-2">{formatRate(row.interactionRate)}</TableCell>
          <TableCell className="text-right tabular-nums text-[#1F1E1D] py-2">
            {row.writerQuality ? (
              row.writerQuality.state === "error" ? (
                <span className="text-[#C0685C] text-[12px]" title="质量数据读取异常">异常</span>
              ) : row.writerQuality.summary?.avgInteractionAchievement != null ? (
                <span title={`两项指标完整样本：${row.writerQuality.summary.achievementSampleCount} 篇`}>
                  {Math.round(row.writerQuality.summary.avgInteractionAchievement)}%
                </span>
              ) : (
                <span className="text-[#A8A29E]" title="暂无指标完整样本">—</span>
              )
            ) : (
              <span className="text-[#A8A29E]" title="质量数据尚未接入">—</span>
            )}
          </TableCell>
          <TableCell className="text-right tabular-nums text-[#1F1E1D] py-2">
            {row.writerQuality ? (
              row.writerQuality.state === "error" ? (
                <span className="text-[#C0685C] text-[12px]" title="质量数据读取异常">异常</span>
              ) : row.writerQuality.summary?.avgCoreAchievement != null ? (
                <span title={`两项指标完整样本：${row.writerQuality.summary.achievementSampleCount} 篇`}>
                  {Math.round(row.writerQuality.summary.avgCoreAchievement)}%
                </span>
              ) : (
                <span className="text-[#A8A29E]" title="暂无指标完整样本">—</span>
              )
            ) : (
              <span className="text-[#A8A29E]" title="质量数据尚未接入">—</span>
            )}
          </TableCell>
          <TableCell className="text-right tabular-nums text-[#1F1E1D] py-2 px-1.5">
            {row.writerQuality ? (
              row.writerQuality.state === "error" ? (
                <span className="text-[#C0685C] text-[12px]" title="质量数据读取异常">异常</span>
              ) : row.writerQuality.summary && row.writerQuality.summary.ratedCount > 0 && row.writerQuality.summary.goodExcellentRate != null ? (
                <span title={`综合已评级 ${row.writerQuality.summary.ratedCount} 篇 / 署名作品 ${row.writerQuality.summary.totalCount} 篇`}>
                  {Math.round(row.writerQuality.summary.goodExcellentRate * 100)}%
                </span>
              ) : (
                <span className="text-[#A8A29E]" title="无综合可评级作品或暂无参评样本">—</span>
              )
            ) : (
              <span className="text-[#A8A29E]" title="质量数据尚未接入">—</span>
            )}
          </TableCell>
          <TableCell className="text-right py-2 pr-6">
            <WriterCertificationCell row={row} certifiableUserIds={certifiableUserIds} />
          </TableCell>
        </>
      )}
    </>
  );
}

/** 展开行：逐篇作品明细（含文案计费对账）。未展开时返回 null。 */
export function StaffExpandedRow({ row, role, isExpanded }: { row: StaffRow; role: StaffRole; isExpanded: boolean }) {
  const diagnosisContext = useContext(CollaborationDiagnosisContext);
  if (!isExpanded) return null;

  return (
    <TableRow className="hover:bg-transparent">
      <TableCell colSpan={role === "writer" ? 15 : 8} className="p-0 border-b border-[#E2E2DF]/60">
        <div className="p-3.5 sm:p-4 bg-[#FCFCFB]/40">
          {/* 明细卡片：完整 1px 细线盒包裹，绝对不散架 */}
          <Card className="overflow-hidden p-0 gap-0">
            <table className="w-full table-fixed text-[12px]">
              <colgroup>
                <col className="w-[110px]" />
                <col className="w-[160px]" />
                <col />
                <col className="w-[90px]" />
                {role === "writer" && <col className="w-[150px]" />}
              </colgroup>
              <thead>
                <tr className="border-b border-[#E2E2DF]/60 bg-transparent text-left text-[#78716C]">
                  <th className="px-3.5 py-2.5 text-[13px] font-normal text-[#78716C]">日期</th>
                  <th className="px-3.5 py-2.5 text-[13px] font-normal text-[#78716C]">账号</th>
                  <th className="px-3.5 py-2.5 text-[13px] font-normal text-[#78716C]">作品</th>
                  <th className="px-3.5 py-2.5 text-right text-[13px] font-normal text-[#78716C]">播放</th>
                  {role === "writer" && (
                    <th className="px-3.5 py-2.5 text-right text-[13px] font-normal text-[#78716C]">
                      计费对账
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E2DF]/60">
                {row.works.length > 0 ? (
                  row.works.map((work) => {
                    const quality = getWorkQuality(work.playCount);

                    return (
                      <tr
                        key={work.reportId}
                        onClick={() => {
                          if (work.reportId && diagnosisContext) {
                            void diagnosisContext.openDiagnosisByReportId(work.reportId);
                          }
                        }}
                        className="hover:bg-[#F7F7F6] transition-colors duration-100 cursor-pointer group"
                      >
                        <td className="whitespace-nowrap px-3.5 py-2.5 tabular-nums text-[#78716C]">{work.reportDate}</td>
                        <td className="px-3.5 py-2.5 text-[#1F1E1D]">{work.accountName}</td>
                        <td className="overflow-hidden px-3.5 py-2.5 font-normal text-[#141413]">
                          <div className="flex min-w-0 items-center gap-1">
                            <CollaborationWorkReviewLink
                              reportId={work.reportId}
                              preview={{
                                title: work.title,
                                accountName: work.accountName,
                                playCount: work.playCount,
                                reportDate: work.reportDate,
                                dataSource: work.dataSource,
                              }}
                              className="min-w-0 flex-1 truncate text-left group-hover:text-[#141413] group-hover:underline"
                            >
                              {work.title}
                            </CollaborationWorkReviewLink>
                            {work.dataSource === "manual" && <span title="该数据由人工填写或修改" className="shrink-0 text-[12px] text-[#78716C]">手工</span>}
                          </div>
                        </td>
                        <td className="px-3.5 py-2.5 text-right tabular-nums text-[#1F1E1D]">{formatBigNumber(work.playCount)}</td>
                        {role === "writer" && (
                          <td className="whitespace-nowrap px-3.5 py-2.5 text-right tabular-nums text-[12px]">
                            {!quality.hasPlayData ? (
                              <span className="inline-flex items-center gap-1 text-[#A8A29E]">
                                无数据·不计
                              </span>
                            ) : quality.isExcellent ? (
                              <Badge variant="success">
                                <span>✓</span> 优秀爆款 (+3条)
                              </Badge>
                            ) : quality.billingCount > 0 ? (
                              <Badge variant="success">
                                <span>✓</span> 达标 (+1条)
                              </Badge>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[#A8A29E]">
                                未达标 (差 {formatBigNumber(quality.billingGap)})
                              </span>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={role === "writer" ? 5 : 4} className="px-3.5 py-2">
                      <EmptyState variant="compact" title="暂无作品记录" />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Card>
        </div>
      </TableCell>
    </TableRow>
  );
}

export function StaffTab({ rows, role, isLoading, onSelectPerson, onPrefetchPerson, certifiableUserIds = [] }: StaffTabProps) {
  const roleLabel = role === "writer" ? "文案" : "剪辑";

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
      return <ArrowUpDown className="size-3 text-[#78716C]/40 ml-1" />;
    }
    return sortOrder === "desc" ? (
      <ArrowDown className="size-3 text-[#141413] ml-1" />
    ) : (
      <ArrowUp className="size-3 text-[#141413] ml-1" />
    );
  };

  const sortedRows = useMemo(() => {
    const getSortValue = (row: StaffRow, field: SortField): number | null => {
      if (field === "avgInteractionAchievement") {
        return row.writerQuality?.summary?.avgInteractionAchievement ?? null;
      }
      if (field === "avgCoreAchievement") {
        return row.writerQuality?.summary?.avgCoreAchievement ?? null;
      }
      if (field === "goodExcellentRate") {
        return row.writerQuality?.summary?.goodExcellentRate ?? null;
      }
      return row[field] ?? null;
    };

    const list = [...rows];
    list.sort((left, right) => {
      const valLeft = getSortValue(left, sortField);
      const valRight = getSortValue(right, sortField);
      // null 置后，真实 0 正常参与排序
      if (valLeft === null && valRight === null) return 0;
      if (valLeft === null) return 1;
      if (valRight === null) return -1;
      const diff = valRight - valLeft;
      return sortOrder === "desc" ? diff : -diff;
    });
    return list;
  }, [rows, sortField, sortOrder]);

  if (isLoading) {
    return (
      <Card className="p-4 gap-3">
        <Skeleton className="h-10 w-full rounded-xl" />
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-12 w-full rounded-xl" />
        ))}
      </Card>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="py-16 text-center">
        <EmptyState
          illustration={
            role === "writer" ? (
              <DeskStudyIllustration size={96} />
            ) : (
              <CompassConstellationIllustration size={96} />
            )
          }
          title={`本月暂无${roleLabel}岗位记录`}
          description={role === "writer"
            ? "暂无文案成员记录。管理员可在本表对成员进行认证；认证后正常结算文案绩效。"
            : "剪辑岗只统计帮别人账号剪辑的作品。"}
        />
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-2">
      <Card className="overflow-hidden p-0 gap-0">
        <Table className={`${STAFF_TABLE_MIN_WIDTH[role]} table-fixed`}>
          <StaffTableColGroup role={role} />
          <TableHeader>
            <StaffHeaderRow role={role} sort={{ sortField, sortOrder, onSort: handleSort, renderSortIcon }} />
          </TableHeader>
          <TableBody className="text-[13px]">
            {sortedRows.map((row) => {
              const isExpanded = expandedUserIds.has(row.userId);

              return (
                <Fragment key={row.userId}>
                <TableRow className={`group transition-colors ${isExpanded ? "bg-[#FCFCFB]/70 hover:bg-[#F7F7F6]" : "hover:bg-[#F7F7F6]"}`}>
                  <StaffRowCells
                    row={row}
                    role={role}
                    isExpanded={isExpanded}
                    onToggleExpand={toggleExpand}
                    onSelectPerson={onSelectPerson}
                    onPrefetchPerson={onPrefetchPerson}
                    certifiableUserIds={certifiableUserIds}
                  />
                </TableRow>
                <StaffExpandedRow row={row} role={role} isExpanded={isExpanded} />
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </Card>
      {role === "writer" && <p className="px-1 text-[12px] text-[#78716C]">人数含已认证但本月暂无产出的文案（其余岗位页签只计当月有产出者）；篇数按日报统计；转粉率、互动率按作品最新 24h 快照加总后计算，未同步视频复盘的作品不参与比率。</p>}
      </div>
    </TooltipProvider>
  );
}
