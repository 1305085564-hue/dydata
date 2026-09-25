"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, ArrowDown, ArrowUp, ArrowUpDown, UserPlus } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { DeskStudyIllustration } from "@/components/editorial/editorial-illustrations";
import { WorkGroupKindBadge, formatRate } from "./work-group-list-tab";
import {
  formatBigNumber,
  type WorkGroupDetailView as WorkGroupDetailViewType,
} from "./types";

interface WorkGroupDetailViewProps {
  detail: WorkGroupDetailViewType;
  canManage?: boolean;
  onBack: () => void;
  onOpenManageDrawer?: (groupId: string) => void;
  onSelectPerson: (userId: string) => void;
  onPrefetchPerson?: (userId: string) => void;
}

type SortField =
  | "name"
  | "reportCount"
  | "totalPlay"
  | "avgPlay"
  | "followerConversionRate"
  | "interactionRate"
  | "likeRate"
  | "favoriteRate";

/** 组详情列：与视频复盘抽屉同源的绩效指标（组综合 + 组员行统一列，不再复用岗位 Tab 列）。 */
const DETAIL_COLUMNS: Array<{ field: SortField; label: string; width: string }> = [
  { field: "reportCount", label: "作品数", width: "w-[100px]" },
  { field: "totalPlay", label: "总播放", width: "w-[120px]" },
  { field: "avgPlay", label: "条均播放", width: "w-[110px]" },
  { field: "followerConversionRate", label: "转粉率", width: "w-[100px]" },
  { field: "interactionRate", label: "互动率", width: "w-[100px]" },
  { field: "likeRate", label: "点赞率", width: "w-[100px]" },
  { field: "favoriteRate", label: "收藏率", width: "w-[100px]" },
];

export function WorkGroupDetailView({
  detail,
  canManage = false,
  onBack,
  onOpenManageDrawer,
  onSelectPerson,
  onPrefetchPerson,
}: WorkGroupDetailViewProps) {
  const { summary, members } = detail;

  const [sortField, setSortField] = useState<SortField>("totalPlay");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const sorted = useMemo(() => {
    const list = [...members];
    list.sort((a, b) => {
      let diff = 0;
      if (sortField === "name") {
        diff = a.name.localeCompare(b.name, "zh-CN");
      } else {
        const aVal = a[sortField] ?? 0;
        const bVal = b[sortField] ?? 0;
        diff = aVal - bVal;
      }
      return sortOrder === "desc" ? -diff : diff;
    });
    return list;
  }, [members, sortField, sortOrder]);

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
    <div className="space-y-4">
      {/* 头部导航与小队名牌 */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-[#E2E2DF]/60">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[13px] font-medium text-[#78716C] hover:text-[#141413] hover:bg-[#EBEBE9] rounded-md transition-all duration-150 cursor-pointer active:scale-[0.99]"
          >
            <ArrowLeft className="size-3.5" />
            全部小队
          </button>
          <span className="text-[#E2E2DF]">/</span>
          <div className="flex items-center gap-2">
            <h2 className="font-serif tracking-tight text-[20px] font-medium leading-[1.30] text-[#141413]">
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
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-[#E2E2DF] hover:bg-[#EBEBE9] text-[#1F1E1D] text-[13px] font-medium shadow-2xs transition-all duration-150 cursor-pointer active:scale-[0.99]"
          >
            <UserPlus className="size-3.5 text-[#D97757]" />
            成员管理
          </button>
        )}
      </div>

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
      ) : (
        <div className="space-y-2">
          <div className="rounded-xl bg-white shadow-card-ring overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-transparent hover:bg-transparent border-b border-[#E2E2DF]/60 text-[13px] font-medium text-[#78716C]">
                  <TableHead className="py-2.5 pl-4 pr-2 text-left font-medium text-[#78716C] w-[180px]">
                    <button
                      type="button"
                      onClick={() => handleSort("name")}
                      className={`inline-flex items-center justify-start cursor-pointer transition-colors ${
                        sortField === "name" ? "text-[#141413] font-medium" : "hover:text-[#141413]"
                      }`}
                    >
                      成员
                      {renderSortIcon("name")}
                    </button>
                  </TableHead>
                  {DETAIL_COLUMNS.map((column) => (
                    <TableHead
                      key={column.field}
                      className={`py-2.5 px-2 text-right font-medium text-[#78716C] ${column.width}`}
                    >
                      <button
                        type="button"
                        onClick={() => handleSort(column.field)}
                        className={`inline-flex items-center justify-end cursor-pointer transition-colors ${
                          sortField === column.field ? "text-[#141413] font-medium" : "hover:text-[#141413]"
                        }`}
                      >
                        {column.label}
                        {renderSortIcon(column.field)}
                      </button>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody className="text-[13px]">
                {/* 首行为组综合：组内全部署名作品一次聚合，比率按合计重算 */}
                <TableRow className="bg-[#F1F1F0] border-b border-[#E2E2DF]/70">
                  <TableCell className="py-3 pl-4 pr-2 font-medium text-[#141413]">
                    组综合
                  </TableCell>
                  <TableCell className="py-3 px-2 text-right tabular-nums text-[#1F1E1D] font-medium">
                    {summary.aggregate.reportCount}
                  </TableCell>
                  <TableCell className="py-3 px-2 text-right tabular-nums text-[#1F1E1D] font-medium">
                    {formatBigNumber(summary.aggregate.totalPlay)}
                  </TableCell>
                  <TableCell className="py-3 px-2 text-right tabular-nums text-[#1F1E1D] font-medium">
                    {formatBigNumber(summary.aggregate.avgPlay)}
                  </TableCell>
                  <TableCell className="py-3 px-2 text-right tabular-nums text-[#1F1E1D] font-medium">
                    {formatRate(summary.aggregate.followerConversionRate)}
                  </TableCell>
                  <TableCell className="py-3 px-2 text-right tabular-nums text-[#1F1E1D] font-medium">
                    {formatRate(summary.aggregate.interactionRate)}
                  </TableCell>
                  <TableCell className="py-3 px-2 text-right tabular-nums text-[#1F1E1D] font-medium">
                    {formatRate(summary.aggregate.likeRate)}
                  </TableCell>
                  <TableCell className="py-3 px-2 text-right tabular-nums text-[#1F1E1D] font-medium">
                    {formatRate(summary.aggregate.favoriteRate)}
                  </TableCell>
                </TableRow>
                {sorted.map((member) => (
                  <TableRow
                    key={member.userId}
                    tabIndex={0}
                    role="button"
                    aria-label={`查看${member.name}的档案卡`}
                    className="border-b border-[#E2E2DF]/70 hover:bg-[#F7F7F6] focus:bg-[#F7F7F6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D97757] focus-visible:ring-offset-1 transition-colors cursor-pointer"
                    onClick={() => onSelectPerson(member.userId)}
                    onMouseEnter={() => onPrefetchPerson?.(member.userId)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") onSelectPerson(member.userId);
                    }}
                  >
                    <TableCell className="py-3 pl-4 pr-2 font-medium text-[#141413]">
                      <span className="truncate max-w-[140px] inline-block align-middle">
                        {member.name}
                      </span>
                    </TableCell>
                    <TableCell className="py-3 px-2 text-right tabular-nums text-[#1F1E1D]">
                      {member.reportCount}
                    </TableCell>
                    <TableCell className="py-3 px-2 text-right tabular-nums text-[#1F1E1D]">
                      {formatBigNumber(member.totalPlay)}
                    </TableCell>
                    <TableCell className="py-3 px-2 text-right tabular-nums text-[#1F1E1D]">
                      {formatBigNumber(member.avgPlay)}
                    </TableCell>
                    <TableCell className="py-3 px-2 text-right tabular-nums text-[#1F1E1D]">
                      {formatRate(member.followerConversionRate)}
                    </TableCell>
                    <TableCell className="py-3 px-2 text-right tabular-nums text-[#1F1E1D]">
                      {formatRate(member.interactionRate)}
                    </TableCell>
                    <TableCell className="py-3 px-2 text-right tabular-nums text-[#1F1E1D]">
                      {formatRate(member.likeRate)}
                    </TableCell>
                    <TableCell className="py-3 px-2 text-right tabular-nums text-[#1F1E1D]">
                      {formatRate(member.favoriteRate)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="px-4 text-[12px] text-[#78716C]">
            播放、条均与各比率与视频复盘抽屉同源（每作品最新 24h 快照，先加总再相除）；作品数为当月署名作品总数，未同步视频复盘的作品只计入作品数。
          </p>
        </div>
      )}
    </div>
  );
}
