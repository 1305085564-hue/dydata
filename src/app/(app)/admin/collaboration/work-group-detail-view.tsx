"use client";

import { Fragment, useMemo, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowDown, ArrowUp, ArrowUpDown, UserPlus } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TooltipProvider } from "@/components/ui/tooltip";
import { EmptyState } from "@/components/ui/empty-state";
import { DeskStudyIllustration } from "@/components/editorial/editorial-illustrations";
import { WorkGroupKindBadge } from "./work-group-list-tab";
import {
  STAFF_TABLE_MIN_WIDTH,
  StaffExpandedRow,
  StaffHeaderRow,
  StaffRowCells,
  StaffTableColGroup,
} from "./staff-tab";
import { TalentHeaderRow, TalentRowCells } from "./talent-tab";
import {
  OPERATOR_TABLE_MIN_WIDTH,
  OperatorExpandedRow,
  OperatorHeaderRow,
  OperatorRowCells,
} from "./operator-tab";
import {
  formatBigNumber,
  type WorkGroupDetailView as WorkGroupDetailViewType,
  type WorkGroupWriterAggregate,
  type WorkGroupTalentAggregate,
  type WorkGroupOperatorAggregate,
  type StaffRow,
  type TalentRow,
  type OperatorRow,
} from "./types";

interface WorkGroupDetailViewProps {
  detail: WorkGroupDetailViewType;
  canManage?: boolean;
  onBack: () => void;
  onOpenManageDrawer?: (groupId: string) => void;
  onSelectPerson: (userId: string) => void;
  onPrefetchPerson?: (userId: string) => void;
}

/** 行内可交互元素（作品诊断链接、展开按钮、姓名按钮）自己处理点击，不再冒泡开档案卡。 */
function isInteractiveTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest("a, button"));
}

export function WorkGroupDetailView({
  detail,
  canManage = false,
  onBack,
  onOpenManageDrawer,
  onSelectPerson,
  onPrefetchPerson,
}: WorkGroupDetailViewProps) {
  const { summary, members } = detail;

  // 排序状态（各岗位共用一套字段排序，字段名与岗位 Tab 一致）
  const [sortField, setSortField] = useState<string>("reportCount");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [expandedUserIds, setExpandedUserIds] = useState<Set<string>>(new Set());

  const toggleExpand = (userId: string) => {
    setExpandedUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === "desc" ? "asc" : "desc"));
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

  const renderSortIcon = (field: string) => {
    if (sortField !== field) {
      return <ArrowUpDown className="size-3 text-[#78716C]/40 ml-1 inline" />;
    }
    return sortOrder === "desc" ? (
      <ArrowDown className="size-3 text-[#1C1917] ml-1 inline" />
    ) : (
      <ArrowUp className="size-3 text-[#1C1917] ml-1 inline" />
    );
  };

  const rowInteractions = {
    onSelectPerson,
    onPrefetchPerson,
    onToggleExpand: toggleExpand,
    isExpanded: (userId: string) => expandedUserIds.has(userId),
  };

  return (
    <div className="space-y-4">
      {/* 头部导航与小队名牌 */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-[#E2E2DF]/60">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[13px] font-medium text-[#78716C] hover:text-[#1C1917] hover:bg-[#EBEBE9] rounded-md transition-all duration-150 cursor-pointer active:scale-[0.99]"
          >
            <ArrowLeft className="size-3.5" />
            全部小队
          </button>
          <span className="text-[#E2E2DF]">/</span>
          <div className="flex items-center gap-2">
            <h2 className="text-[17px] font-medium text-[#1C1917] tracking-tight">
              {summary.name}
            </h2>
            <WorkGroupKindBadge kind={summary.kind} />
            <span className="text-[12px] text-[#78716C]">
              共 {summary.memberCount} 位组员
            </span>
          </div>
        </div>

        {canManage && onOpenManageDrawer && (
          <button
            type="button"
            onClick={() => onOpenManageDrawer(summary.id)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-[#E2E2DF] hover:bg-[#EBEBE9] text-[#292524] text-[13px] font-medium shadow-2xs transition-all duration-150 cursor-pointer active:scale-[0.99]"
          >
            <UserPlus className="size-3.5 text-[#D97757]" />
            成员管理
          </button>
        )}
      </div>

      {/* 小队表格视图：首行必为「组综合」，下方为组员行；列结构与对应岗位 Tab 完全同源 */}
      {members.length === 0 ? (
        <div className="py-14 text-center rounded-xl bg-white shadow-card-ring">
          <EmptyState
            illustration={<DeskStudyIllustration size={80} />}
            title="该小队当前暂无成员"
            description={
              canManage
                ? "点击上方「成员管理」即可为该小队分配组员。"
                : "当前小队尚未分配组员。"
            }
          />
        </div>
      ) : summary.kind === "writer" ? (
        <WriterGroupTable
          aggregate={summary.aggregate as WorkGroupWriterAggregate}
          members={members as StaffRow[]}
          sortField={sortField}
          sortOrder={sortOrder}
          onSort={handleSort}
          renderSortIcon={renderSortIcon}
          interactions={rowInteractions}
        />
      ) : summary.kind === "talent" ? (
        <TalentGroupTable
          aggregate={summary.aggregate as WorkGroupTalentAggregate}
          members={members as TalentRow[]}
          sortField={sortField}
          sortOrder={sortOrder}
          onSort={handleSort}
          renderSortIcon={renderSortIcon}
          interactions={rowInteractions}
        />
      ) : (
        <OperatorGroupTable
          aggregate={summary.aggregate as WorkGroupOperatorAggregate}
          members={members as OperatorRow[]}
          sortField={sortField}
          sortOrder={sortOrder}
          onSort={handleSort}
          renderSortIcon={renderSortIcon}
          interactions={rowInteractions}
        />
      )}
    </div>
  );
}

type RowInteractions = {
  onSelectPerson: (userId: string) => void;
  onPrefetchPerson?: (userId: string) => void;
  onToggleExpand: (userId: string) => void;
  isExpanded: (userId: string) => boolean;
};

const MEMBER_ROW_CLASS =
  "border-b border-[#E2E2DF]/70 hover:bg-[#F7F7F6] focus:bg-[#F7F7F6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D97757] focus-visible:ring-offset-1 transition-colors cursor-pointer";

function sortMembers<T extends { name: string }>(
  members: T[],
  sortField: string,
  sortOrder: "asc" | "desc",
): T[] {
  const list = [...members];
  list.sort((a, b) => {
    const aVal = (a as unknown as Record<string, number>)[sortField] ?? 0;
    const bVal = (b as unknown as Record<string, number>)[sortField] ?? 0;
    const diff = bVal - aVal;
    return sortOrder === "desc" ? diff : -diff;
  });
  return list;
}

/** 组综合行：浅砂微气垫底，单元格顺序与上方列头逐列对齐。 */
function GroupSummaryRow({ children }: { children: ReactNode }) {
  return (
    <TableRow className="bg-[#F1F1F0] hover:bg-[#EBEBE9] border-b border-[#E2E2DF] font-medium text-[#1C1917] transition-colors">
      {children}
    </TableRow>
  );
}

function GroupSummaryLabel() {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[#D97757] font-semibold text-[14px]">✦</span>
      <span className="font-medium text-[#1C1917]">组综合</span>
      <span className="text-[11px] text-[#78716C] font-normal">全组合计</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 1. 文案小队详情表格（首行组综合 + 文案组员行，列与 StaffTab writer 一致）
// ---------------------------------------------------------------------------

function WriterGroupTable({
  aggregate,
  members,
  sortField,
  sortOrder,
  onSort,
  renderSortIcon,
  interactions,
}: {
  aggregate: WorkGroupWriterAggregate;
  members: StaffRow[];
  sortField: string;
  sortOrder: "asc" | "desc";
  onSort: (field: string) => void;
  renderSortIcon: (field: string) => ReactNode;
  interactions: RowInteractions;
}) {
  const sorted = useMemo(
    () => sortMembers(members, sortField, sortOrder),
    [members, sortField, sortOrder],
  );

  return (
    <TooltipProvider>
      <div className="rounded-xl bg-white shadow-card-ring overflow-hidden">
        <div className="overflow-x-auto">
          <Table className={`${STAFF_TABLE_MIN_WIDTH.writer} table-fixed`}>
            <StaffTableColGroup role="writer" />
            <TableHeader>
              <StaffHeaderRow role="writer" sort={{ sortField, sortOrder, onSort, renderSortIcon }} />
            </TableHeader>
            <TableBody className="text-[13px]">
              {/* 第一行：组综合（浅砂微气垫底） */}
              <GroupSummaryRow>
                <TableCell className="w-10 px-2 py-3" />
                <TableCell className="text-left font-medium pl-4 py-3">
                  <GroupSummaryLabel />
                </TableCell>
                <TableCell className="text-left pl-4 py-3 tabular-nums text-[#1C1917]">
                  {aggregate.accountCount > 0 ? `${aggregate.accountCount} 个账号` : "—"}
                </TableCell>
                <TableCell className="text-left pl-4 py-3 text-[#78716C] text-[13px]">—</TableCell>
                <TableCell className="text-right tabular-nums text-[#1C1917] py-3">
                  {formatBigNumber(aggregate.totalPlay)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-[#1C1917] py-3">
                  {formatBigNumber(aggregate.avgPlay)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-[#1C1917] py-3">
                  {aggregate.reportCount}
                </TableCell>
                <TableCell className="text-right tabular-nums text-[#1C1917] py-3">
                  {aggregate.effectiveCount}
                </TableCell>
                <TableCell className="text-right tabular-nums text-[#1C1917] py-3">
                  {aggregate.excellentCount}
                </TableCell>
                <TableCell className="text-right tabular-nums text-[#1C1917] py-3">
                  {aggregate.billingCount !== null ? aggregate.billingCount : "—"}
                </TableCell>
                <TableCell className="text-right pr-6 text-[#78716C] text-[13px] py-3">
                  {aggregate.certifiedMemberCount}/{members.length} 人已认证
                </TableCell>
              </GroupSummaryRow>

              {/* 组员个体行：包含零产出与未认证 */}
              {sorted.map((row) => {
                const isExpanded = interactions.isExpanded(row.userId);

                return (
                  <Fragment key={row.userId}>
                    <TableRow
                      tabIndex={0}
                      role="button"
                      aria-label={`查看${row.name}的个人档案`}
                      className={MEMBER_ROW_CLASS}
                      onClick={(event) => {
                        if (isInteractiveTarget(event.target)) return;
                        interactions.onSelectPerson(row.userId);
                      }}
                      onMouseEnter={() => interactions.onPrefetchPerson?.(row.userId)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") interactions.onSelectPerson(row.userId);
                      }}
                    >
                      <StaffRowCells
                        row={row}
                        role="writer"
                        isExpanded={isExpanded}
                        onToggleExpand={interactions.onToggleExpand}
                        onSelectPerson={interactions.onSelectPerson}
                        onPrefetchPerson={interactions.onPrefetchPerson}
                        certifiableUserIds={[]}
                      />
                    </TableRow>
                    <StaffExpandedRow row={row} role="writer" isExpanded={isExpanded} />
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    </TooltipProvider>
  );
}

// ---------------------------------------------------------------------------
// 2. 达人小队详情表格（首行组综合 + 达人组员行，列与 TalentTab 一致）
// ---------------------------------------------------------------------------

function TalentGroupTable({
  aggregate,
  members,
  sortField,
  sortOrder,
  onSort,
  renderSortIcon,
  interactions,
}: {
  aggregate: WorkGroupTalentAggregate;
  members: TalentRow[];
  sortField: string;
  sortOrder: "asc" | "desc";
  onSort: (field: string) => void;
  renderSortIcon: (field: string) => ReactNode;
  interactions: RowInteractions;
}) {
  const sorted = useMemo(
    () => sortMembers(members, sortField, sortOrder),
    [members, sortField, sortOrder],
  );

  return (
    <div className="rounded-xl bg-white shadow-card-ring overflow-hidden">
      <Table>
        <TableHeader>
          <TalentHeaderRow sort={{ sortField, sortOrder, onSort, renderSortIcon }} />
        </TableHeader>
        <TableBody className="text-[13px]">
          {/* 第一行：组综合（浅砂微气垫底） */}
          <GroupSummaryRow>
            <TableCell className="py-3 pl-4 pr-2">
              <GroupSummaryLabel />
            </TableCell>
            <TableCell className="py-3 px-2 text-right tabular-nums text-[#1C1917]">
              {aggregate.accountCount}
            </TableCell>
            <TableCell className="py-3 px-2 text-right tabular-nums text-[#1C1917]">
              {aggregate.reportCount}
            </TableCell>
            <TableCell className="py-3 px-2 text-right tabular-nums text-[#1C1917]">
              {formatBigNumber(aggregate.totalPlay)}
            </TableCell>
            <TableCell className="py-3 px-2 text-right tabular-nums text-[#1C1917]">
              {formatBigNumber(aggregate.avgPlay)}
            </TableCell>
            <TableCell className="py-3 px-2 text-right tabular-nums text-[#1C1917]">
              {aggregate.effectiveCount}
            </TableCell>
            <TableCell className="py-3 px-2 text-right tabular-nums text-[#1C1917]">
              {aggregate.excellentCount}
            </TableCell>
            <TableCell className="py-3 px-2 text-right tabular-nums text-[#1C1917]">
              {aggregate.hitCount}
            </TableCell>
            <TableCell className="py-3 px-2 text-right tabular-nums text-[#1C1917]">
              {aggregate.selfHandledCount}
            </TableCell>
            <TableCell className="py-3 pl-4 pr-4 text-[#78716C] text-[13px]">—</TableCell>
          </GroupSummaryRow>

          {/* 组员个体行：包含零产出 */}
          {sorted.map((row) => (
            <TableRow
              key={row.userId}
              tabIndex={0}
              role="button"
              aria-label={`查看${row.name}的个人档案`}
              className={MEMBER_ROW_CLASS}
              onClick={(event) => {
                if (isInteractiveTarget(event.target)) return;
                interactions.onSelectPerson(row.userId);
              }}
              onMouseEnter={() => interactions.onPrefetchPerson?.(row.userId)}
              onKeyDown={(e) => {
                if (e.key === "Enter") interactions.onSelectPerson(row.userId);
              }}
            >
              <TalentRowCells row={row} />
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3. 运营小队详情表格（首行组综合 + 运营组员行，列与 OperatorTab 一致）
// ---------------------------------------------------------------------------

function OperatorGroupTable({
  aggregate,
  members,
  sortField,
  sortOrder,
  onSort,
  renderSortIcon,
  interactions,
}: {
  aggregate: WorkGroupOperatorAggregate;
  members: OperatorRow[];
  sortField: string;
  sortOrder: "asc" | "desc";
  onSort: (field: string) => void;
  renderSortIcon: (field: string) => ReactNode;
  interactions: RowInteractions;
}) {
  const sorted = useMemo(
    () => sortMembers(members, sortField, sortOrder),
    [members, sortField, sortOrder],
  );

  return (
    <div className="rounded-xl bg-white shadow-card-ring overflow-hidden">
      <Table className={OPERATOR_TABLE_MIN_WIDTH}>
        <TableHeader>
          <OperatorHeaderRow sort={{ sortField, sortOrder, onSort, renderSortIcon }} />
        </TableHeader>
        <TableBody className="text-[13px]">
          {/* 第一行：组综合（浅砂微气垫底） */}
          <GroupSummaryRow>
            <TableCell className="w-10" />
            <TableCell className="text-left font-medium py-3">
              <GroupSummaryLabel />
            </TableCell>
            <TableCell className="text-right tabular-nums text-[#1C1917] py-3">
              {aggregate.accountCount}
            </TableCell>
            <TableCell className="text-right tabular-nums text-[#1C1917] py-3">
              {aggregate.reportCount}
            </TableCell>
            <TableCell className="text-right tabular-nums text-[#1C1917] py-3">
              {formatBigNumber(aggregate.totalPlay)}
            </TableCell>
            <TableCell className="text-right tabular-nums text-[#1C1917] py-3">
              {formatBigNumber(aggregate.avgPlay)}
            </TableCell>
            <TableCell className="text-right tabular-nums text-[#1C1917] py-3">
              {aggregate.totalFollowerConvert.toLocaleString("zh-CN")}
            </TableCell>
            <TableCell className="text-right tabular-nums text-[#1C1917] py-3">
              {aggregate.effectiveCount}
            </TableCell>
            <TableCell className="text-right tabular-nums text-[#1C1917] py-3">
              {aggregate.excellentCount}
            </TableCell>
            <TableCell className="text-right tabular-nums text-[#1C1917] py-3">
              {aggregate.hitCount}
            </TableCell>
            <TableCell className="text-right tabular-nums py-3">
              {aggregate.momChange !== null ? (
                <span className={aggregate.momChange >= 0 ? "text-[#3B7A57]" : "text-[#C0685C]"}>
                  {aggregate.momChange >= 0
                    ? `+${(aggregate.momChange * 100).toFixed(1)}%`
                    : `${(aggregate.momChange * 100).toFixed(1)}%`}
                </span>
              ) : (
                "—"
              )}
            </TableCell>
          </GroupSummaryRow>

          {/* 组员个体行：包含零产出 */}
          {sorted.map((row) => {
            const isExpanded = interactions.isExpanded(row.userId) && row.accounts.length > 0;

            return (
              <Fragment key={row.userId}>
                <TableRow
                  tabIndex={0}
                  role="button"
                  aria-label={`查看${row.name}的个人档案`}
                  className={MEMBER_ROW_CLASS}
                  onClick={(event) => {
                    if (isInteractiveTarget(event.target)) return;
                    interactions.onSelectPerson(row.userId);
                  }}
                  onMouseEnter={() => interactions.onPrefetchPerson?.(row.userId)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") interactions.onSelectPerson(row.userId);
                  }}
                >
                  <OperatorRowCells
                    row={row}
                    isExpanded={isExpanded}
                    onToggleExpand={interactions.onToggleExpand}
                    onSelectPerson={interactions.onSelectPerson}
                    onPrefetchPerson={interactions.onPrefetchPerson}
                  />
                </TableRow>
                <OperatorExpandedRow row={row} isExpanded={isExpanded} />
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
