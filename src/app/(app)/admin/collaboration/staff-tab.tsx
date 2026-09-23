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
import { EmptyState } from "@/components/ui/empty-state";
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

type SortField = "reportCount" | "totalPlay" | "avgPlay" | "followerConversionRate" | "interactionRate";

export type StaffRole = "writer" | "editor";

/** 文案/剪辑表列定义：岗位 Tab 与「按团队」组详情共用，改列只改一处。 */
export const STAFF_TABLE_MIN_WIDTH: Record<StaffRole, string> = {
  writer: "min-w-[1648px]",
  editor: "min-w-[1200px]",
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
      <col className="w-[120px]" />
      <col className="w-[190px]" />
      <col className="w-[320px]" />
      <col className="w-[104px]" />
      <col className="w-[104px]" />
      <col className="w-[104px]" />
      <col className="w-[104px]" />
      <col className="w-[104px]" />
      {role === "writer" && (
        <>
          <col className="w-[104px]" />
          <col className="w-[104px]" />
          <col className="w-[104px]" />
          <col className="w-[140px]" />
        </>
      )}
    </colgroup>
  );
}

/** 列头：岗位 Tab 与组详情完全同一份，杜绝两边列名/列序漂移。 */
export function StaffHeaderRow({ role, sort }: { role: StaffRole; sort: StaffColumnSort }) {
  const countLabel = "本月篇数";

  return (
    <TableRow className="bg-transparent hover:bg-transparent border-b border-[#E2E2DF]/60 text-[11px] font-medium uppercase tracking-wider text-[#78716C]">
      <TableHead className="w-10 sticky left-0 bg-[#FCFCFB] z-20" />
      <TableHead className="text-left font-medium text-[#78716C] pl-4 sticky left-10 bg-[#FCFCFB] z-20 shadow-[1px_0_0_0_#E2E2DF]">姓名</TableHead>
      <TableHead className="text-left font-medium text-[#78716C] pl-4">负责账号</TableHead>
      <TableHead className="text-left font-medium text-[#78716C] pl-4">最近作品</TableHead>
      <TableHead className="text-right font-medium text-[#78716C]">
        <button
          type="button"
          onClick={() => sort.onSort("totalPlay")}
          className={`inline-flex items-center justify-end w-full cursor-pointer transition-colors ${
            sort.sortField === "totalPlay" ? "text-[#1C1917] font-medium" : "hover:text-[#1C1917]"
          }`}
        >
          总播放
          {sort.renderSortIcon("totalPlay")}
        </button>
      </TableHead>
      <TableHead className="text-right font-medium text-[#78716C]">
        <button
          type="button"
          onClick={() => sort.onSort("avgPlay")}
          className={`inline-flex items-center justify-end w-full cursor-pointer transition-colors ${
            sort.sortField === "avgPlay" ? "text-[#1C1917] font-medium" : "hover:text-[#1C1917]"
          }`}
        >
          条均播放
          {sort.renderSortIcon("avgPlay")}
        </button>
      </TableHead>
      <TableHead className="text-right font-medium text-[#78716C]">
        <button
          type="button"
          onClick={() => sort.onSort("reportCount")}
          className={`inline-flex items-center justify-end w-full cursor-pointer transition-colors ${
            sort.sortField === "reportCount" ? "text-[#1C1917] font-medium" : "hover:text-[#1C1917]"
          }`}
        >
          {countLabel}
          {sort.renderSortIcon("reportCount")}
        </button>
      </TableHead>
      <TableHead className="text-right font-medium text-[#78716C]" title="播放大于500的作品条数">有效作品</TableHead>
      <TableHead className="text-right font-medium text-[#78716C]" title="播放至少30,000，简单计数">优秀作品</TableHead>
      {role === "writer" && (
        <>
          <TableHead className="text-right font-medium text-[#78716C]">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger className="inline-flex items-center justify-end w-full cursor-help hover:text-[#1C1917] transition-colors gap-0.5">
                  绩效条数
                  <span className="text-[11px] text-[#78716C]/80 font-normal">ⓘ</span>
                </TooltipTrigger>
                <TooltipContent className="text-[12px] max-w-xs text-left">
                  <p className="font-medium text-[#FCFCFB] mb-1">文案绩效核算口径：</p>
                  <p className="text-[#FCFCFB] leading-relaxed">
                    播放≥500条数 + 优秀作品×2。<br />
                    <span className="text-[#FAF4E8]/80 text-[11px]">注：未认证文案不计入绩效结算。</span>
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </TableHead>
          {(["followerConversionRate", "interactionRate"] as const).map((field) => (
            <TableHead key={field} className="text-right font-medium text-[#78716C]">
              <button type="button" onClick={() => sort.onSort(field)} className={`inline-flex items-center justify-end w-full cursor-pointer transition-colors ${sort.sortField === field ? "text-[#1C1917] font-medium" : "hover:text-[#1C1917]"}`}>
                {field === "followerConversionRate" ? "转粉率" : "互动率"}{sort.renderSortIcon(field)}
              </button>
            </TableHead>
          ))}
          <TableHead className="text-right font-medium text-[#78716C] pr-6 w-32 min-w-[120px]">认证状态</TableHead>
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
      <span className={`inline-flex items-center px-2 py-0.5 text-[12px] rounded ${
        row.isCertified
          ? "text-[#78716C]"
          : hasWork
            ? "text-[#8A6A2F] bg-[#FAF4E8]"
            : "text-[#78716C]"
      }`}>
        {row.isCertified ? (row.certifiedByName ? `${row.certifiedByName}认证` : "已认证") : (hasWork ? "未认证 (有产出)" : "未认证")}
      </span>
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
  const recentTitles = row.recentWorks.map((work) => work.title).join("、");
  const isZero = row.reportCount === 0;

  return (
    <>
      <TableCell className="w-10 px-2 py-3 sticky left-0 bg-white group-hover:bg-[#F7F7F6] z-10">
        <button
          type="button"
          onClick={() => onToggleExpand(row.userId)}
          aria-label={isExpanded ? `收起${row.name}的全部作品` : `查看${row.name}的全部作品`}
          className={`flex size-8 items-center justify-center rounded-md transition-colors cursor-pointer ${
            isExpanded ? "text-[#1C1917]" : "text-[#78716C] hover:bg-[#EBEBE9] hover:text-[#292524]"
          }`}
        >
          {isExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </button>
      </TableCell>
      <TableCell className="text-left font-medium pl-4 py-3 sticky left-10 bg-white group-hover:bg-[#F7F7F6] z-10 shadow-[1px_0_0_0_#E2E2DF]">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onSelectPerson(row.userId);
          }}
          onMouseEnter={() => onPrefetchPerson?.(row.userId)}
          onFocus={() => onPrefetchPerson?.(row.userId)}
          className={`hover:text-[#D97757] hover:underline transition-colors font-medium cursor-pointer ${
            isZero ? "text-[#78716C]" : "text-[#1C1917]"
          }`}
        >
          {row.name}
        </button>
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
              <p className="font-medium text-[#FCFCFB] mb-1">经手账号：</p>
              <p className="text-[#FCFCFB] leading-relaxed">
                {row.involvedAccounts.map((account) => account.accountName).join("、")}（展开本行可查看逐篇明细）
              </p>
            </TooltipContent>
          </Tooltip>
        ) : (
          <span>{displayedAccounts || "—"}</span>
        )}
      </TableCell>
      <TableCell className="w-[320px] max-w-[320px] overflow-hidden text-left py-3 pl-4 text-[#292524]">
        {row.recentWorks[0] ? (
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-1">
              <CollaborationWorkReviewLink
                reportId={row.recentWorks[0].reportId}
                preview={{
                  title: row.recentWorks[0].title,
                  accountName: row.recentWorks[0].accountName,
                  playCount: row.recentWorks[0].playCount,
                  reportDate: row.recentWorks[0].reportDate,
                  dataSource: row.recentWorks[0].dataSource,
                }}
                className="min-w-0 flex-1 truncate text-left"
              >
                {row.recentWorks[0].title}
              </CollaborationWorkReviewLink>
              {row.recentWorks[0].dataSource === "manual" && <span title="该数据由人工填写或修改" className="shrink-0 text-[12px] text-[#78716C]">手工</span>}
            </div>
            {row.works.length > 1 && <span title={recentTitles} className="block truncate text-[12px] text-[#78716C]">共 {row.works.length} 条 · 可展开</span>}
          </div>
        ) : (
          <span className="text-[#A8A29E]">—</span>
        )}
      </TableCell>
      <TableCell className={`text-right tabular-nums py-3 ${isZero ? "text-[#A8A29E]" : "text-[#292524]"}`}>
        {formatBigNumber(row.totalPlay)}
      </TableCell>
      <TableCell className={`text-right tabular-nums py-3 ${isZero ? "text-[#A8A29E]" : "text-[#292524]"}`}>
        {formatBigNumber(row.avgPlay)}
      </TableCell>
      <TableCell className={`text-right tabular-nums py-3 ${isZero ? "text-[#A8A29E]" : "font-medium text-[#1C1917]"}`}>
        {row.reportCount}
      </TableCell>
      <TableCell className={`text-right tabular-nums py-3 ${isZero ? "text-[#A8A29E]" : "text-[#292524]"}`}>{row.effectiveCount}</TableCell>
      <TableCell className={`text-right tabular-nums py-3 ${isZero ? "text-[#A8A29E]" : "text-[#292524]"}`}>{row.excellentCount}</TableCell>
      {role === "writer" && (
        <>
          <TableCell className="text-right tabular-nums py-3">
            {row.billingCount !== null ? (
              <Tooltip>
                <TooltipTrigger
                  className="font-medium text-[#1C1917] hover:text-[#D97757] hover:underline decoration-dotted underline-offset-2 cursor-pointer inline-flex items-center justify-end"
                >
                  {row.billingCount}
                </TooltipTrigger>
                <TooltipContent
                  side="left"
                  align="center"
                  className="w-64 p-3 bg-white text-[#1C1917] border border-[#E2E2DF] shadow-claude-dialog rounded-xl space-y-2.5 text-left"
                >
                  <div className="flex items-center justify-between border-b border-[#E2E2DF]/60 pb-1.5">
                    <span className="text-[12px] font-medium text-[#1C1917]">绩效条数核算明细</span>
                    <span className="text-[10px] text-[#78716C] bg-[#F1F1F0] px-1.5 py-0.5 rounded">
                      {row.name}
                    </span>
                  </div>
                  <div className="space-y-1.5 text-[12px]">
                    <div className="flex items-center justify-between text-[#57534E]">
                      <span>计费基数（播放≥500）</span>
                      <span className="tabular-nums font-medium text-[#1C1917]">{row.billingCount - row.excellentCount * 2} 条</span>
                    </div>
                    <div className="flex items-center justify-between text-[#57534E]">
                      <span>优秀作品加成（{row.excellentCount} × 2）</span>
                      <span className="tabular-nums font-medium text-[#1C1917]">+{row.excellentCount * 2} 条</span>
                    </div>
                    <div className="border-t border-[#E2E2DF]/60 pt-1.5 flex items-center justify-between font-medium">
                      <span className="text-[#1C1917]">最终计费条数</span>
                      <span className="tabular-nums text-[13px] font-semibold text-[#1C1917]">{row.billingCount} 条</span>
                    </div>
                  </div>
                  {row.certifiedByName && (
                    <div className="text-[11px] text-[#78716C] bg-[#F7F7F6] px-2 py-1 rounded border border-[#E2E2DF]/40">
                      已由 <span className="text-[#1C1917] font-medium">{row.certifiedByName}</span> 认证生效
                    </div>
                  )}
                </TooltipContent>
              </Tooltip>
            ) : (
              <span className="text-[#A8A29E]" title="未认证成员不计费">—</span>
            )}
          </TableCell>
          <TableCell className="text-right tabular-nums text-[#292524] py-3">{formatRate(row.followerConversionRate)}</TableCell>
          <TableCell className="text-right tabular-nums text-[#292524] py-3">{formatRate(row.interactionRate)}</TableCell>
          <TableCell className="text-right py-3 pr-6">
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
      <TableCell colSpan={role === "writer" ? 13 : 9} className="p-0 border-b border-[#E2E2DF]/60">
        <div className="p-3.5 sm:p-4 bg-[#FCFCFB]/40">
          {/* 明细卡片：完整 1px 细线盒包裹，绝对不散架 */}
          <div className="overflow-hidden rounded-xl bg-white shadow-card-ring">
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
                  <th className="px-3.5 py-2.5 text-[11px] font-medium uppercase tracking-wider text-[#78716C]">日期</th>
                  <th className="px-3.5 py-2.5 text-[11px] font-medium uppercase tracking-wider text-[#78716C]">账号</th>
                  <th className="px-3.5 py-2.5 text-[11px] font-medium uppercase tracking-wider text-[#78716C]">作品</th>
                  <th className="px-3.5 py-2.5 text-right text-[11px] font-medium uppercase tracking-wider text-[#78716C]">播放</th>
                  {role === "writer" && (
                    <th className="px-3.5 py-2.5 text-right text-[11px] font-medium uppercase tracking-wider text-[#78716C]">
                      计费对账
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E2DF]/50">
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
                        <td className="px-3.5 py-2.5 text-[#292524]">{work.accountName}</td>
                        <td className="overflow-hidden px-3.5 py-2.5 font-medium text-[#1C1917]">
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
                              className="min-w-0 flex-1 truncate text-left group-hover:text-[#292524] group-hover:underline"
                            >
                              {work.title}
                            </CollaborationWorkReviewLink>
                            {work.dataSource === "manual" && <span title="该数据由人工填写或修改" className="shrink-0 text-[12px] text-[#78716C]">手工</span>}
                          </div>
                        </td>
                        <td className="px-3.5 py-2.5 text-right tabular-nums text-[#292524]">{formatBigNumber(work.playCount)}</td>
                        {role === "writer" && (
                          <td className="whitespace-nowrap px-3.5 py-2.5 text-right tabular-nums text-[11px]">
                            {!quality.hasPlayData ? (
                              <span className="inline-flex items-center gap-1 text-[#A8A29E]">
                                无数据·不计
                              </span>
                            ) : quality.isExcellent ? (
                              <span className="inline-flex items-center gap-1 text-[#2D7A56] font-medium bg-[#EBF5EE] px-1.5 py-0.5 rounded">
                                <span>✓</span> 优秀爆款 (+3条)
                              </span>
                            ) : quality.billingCount > 0 ? (
                              <span className="inline-flex items-center gap-1 text-[#2D7A56] bg-[#EBF5EE]/60 px-1.5 py-0.5 rounded">
                                <span>✓</span> 达标 (+1条)
                              </span>
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
                    <td colSpan={role === "writer" ? 5 : 4} className="px-3.5 py-3 text-center text-[#78716C]">暂无作品记录</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
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
      <ArrowDown className="size-3 text-[#1C1917] ml-1" />
    ) : (
      <ArrowUp className="size-3 text-[#1C1917] ml-1" />
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
      <div className="rounded-xl bg-white p-4 space-y-3 shadow-card-ring">
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
      <div className="rounded-xl bg-white shadow-card-ring overflow-hidden">
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
      </div>
      {role === "writer" && <p className="px-1 text-[11px] text-[#78716C]">人数含已认证但本月暂无产出的文案（其余岗位页签只计当月有产出者）；篇数按日报统计；转粉率、互动率按作品最新 24h 快照加总后计算，未同步视频复盘的作品不参与比率。</p>}
      </div>
    </TooltipProvider>
  );
}
