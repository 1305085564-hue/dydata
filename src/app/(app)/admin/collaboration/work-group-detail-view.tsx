"use client";

import { Fragment, useMemo, useState } from "react";
import { ArrowLeft, ArrowDown, ArrowUp, ArrowUpDown, UserPlus } from "lucide-react";
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
import { SectionHeading } from "@/components/ui/section-heading";
import { DeskStudyIllustration } from "@/components/editorial/editorial-illustrations";
import { pinCurrentUserFirst } from "@/lib/collaboration/domain/workbench-state";
import { SelfMemberBadge } from "./member-self-hint";
import { WorkGroupKindBadge, WorkGroupQualitySummaryCell, formatRate } from "./work-group-list-tab";
import {
  formatBigNumber,
  type WorkGroupDetailView as WorkGroupDetailViewType,
} from "./types";
import {
  DETAIL_FOOTNOTE,
  DetailToggle,
  InteractionDetailCells,
  InteractionDetailHeads,
  RetentionDetailCells,
  RetentionDetailHeads,
} from "./work-group-detail-columns";

interface WorkGroupDetailViewProps {
  detail: WorkGroupDetailViewType;
  canManage?: boolean;
  currentUserId?: string | null;
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
  | "favoriteRate"
  | "avgInteractionAchievement"
  | "avgContentAchievement"
  | "goodExcellentRate";

/** 组详情列：与视频复盘抽屉同源的绩效指标（组综合 + 组员行统一列，不再复用岗位 Tab 列）。 */
const DETAIL_COLUMNS: Array<{ field: SortField; label: string; width: string }> = [
  { field: "reportCount", label: "作品数", width: "w-[80px]" },
  { field: "totalPlay", label: "总播放", width: "w-[80px]" },
  { field: "avgPlay", label: "条均播放", width: "w-[85px]" },
  { field: "followerConversionRate", label: "转粉率", width: "w-[80px]" },
  { field: "interactionRate", label: "互动率", width: "w-[80px]" },
];

export function WorkGroupDetailView({
  detail,
  canManage = false,
  currentUserId = null,
  onBack,
  onOpenManageDrawer,
  onSelectPerson,
  onPrefetchPerson,
}: WorkGroupDetailViewProps) {
  const { summary, members } = detail;

  const [sortField, setSortField] = useState<SortField>("totalPlay");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [showDetail, setShowDetail] = useState(false);

  const hasContentQuality = useMemo(
    () =>
      summary.contentQuality !== null || members.some((m) => m.contentQuality !== null),
    [summary, members],
  );

  const sorted = useMemo(() => {
    const list = [...members];
    list.sort((a, b) => {
      let diff = 0;
      if (sortField === "name") {
        diff = a.name.localeCompare(b.name, "zh-CN");
      } else if (sortField === "goodExcellentRate") {
        const aVal = a.contentQuality?.goodExcellentRate ?? -1;
        const bVal = b.contentQuality?.goodExcellentRate ?? -1;
        diff = aVal - bVal;
      } else if (sortField === "avgInteractionAchievement" || sortField === "avgContentAchievement") {
        const aVal = a.contentQuality?.[sortField] ?? -1;
        const bVal = b.contentQuality?.[sortField] ?? -1;
        diff = aVal - bVal;
      } else {
        const aVal = a[sortField] ?? 0;
        const bVal = b[sortField] ?? 0;
        diff = aVal - bVal;
      }
      return sortOrder === "desc" ? -diff : diff;
    });
    return pinCurrentUserFirst(list, currentUserId);
  }, [members, sortField, sortOrder, currentUserId]);

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

  const sortableHead = (field: SortField, label: string, width: string) => (
    <TableHead className={`py-2 px-2 text-right font-normal text-[#78716C] ${width}`}>
      <button
        type="button"
        onClick={() => handleSort(field)}
        className={`inline-flex items-center justify-end w-full cursor-pointer transition-colors ${
          sortField === field ? "text-[#141413] font-normal" : "hover:text-[#141413]"
        }`}
      >
        {label}
        {renderSortIcon(field)}
      </button>
    </TableHead>
  );

  const renderDetailHead = (field: "likeRate" | "favoriteRate" | null, label: string, width: string) =>
    field ? (
      sortableHead(field, label, width)
    ) : (
      <TableHead className={`py-2 px-2 text-right font-normal text-[#78716C] ${width}`}>{label}</TableHead>
    );

  return (
    <div className="space-y-4">
      {/* 头部导航与小队名牌 */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-[#E2E2DF]/60">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-[14px] font-normal text-[#78716C] hover:text-[#141413] hover:bg-[#EBEBE9] rounded-md transition duration-150 cursor-pointer active:scale-[0.99]"
          >
            <ArrowLeft className="size-3.5" />
            全部小队
          </button>
          <span className="text-[#E2E2DF]">/</span>
          <div className="flex items-center gap-2">
            <SectionHeading as="h2">
              {summary.name}
            </SectionHeading>
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
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-white border border-[#E2E2DF] hover:bg-[#EBEBE9] text-[#1F1E1D] text-[14px] font-normal shadow-input transition duration-150 cursor-pointer active:scale-[0.99]"
          >
            <UserPlus className="size-3.5 text-[#78716C]" />
            成员管理
          </button>
        )}
      </div>

      {members.length === 0 ? (
        <Card className="py-14 text-center">
          <EmptyState
            illustration={<DeskStudyIllustration size={80} />}
            title="该小队当前还没有成员"
            description={
              canManage
                ? "点击上方「成员管理」即可为该小队分配组员。"
                : "当前小队尚未分配成员。"
            }
          />
        </Card>
      ) : (
        <div className="space-y-2">
          <DetailToggle expanded={showDetail} onToggle={() => setShowDetail((value) => !value)} />
          <Card className="overflow-hidden p-0 gap-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-transparent hover:bg-transparent border-b border-[#E2E2DF]/60 text-[12px] font-normal text-[#78716C]">
                  <TableHead className="py-2 pl-4 pr-2 text-left font-normal text-[#78716C] w-[120px]">
                    <button
                      type="button"
                      onClick={() => handleSort("name")}
                      className={`inline-flex items-center justify-start cursor-pointer transition-colors ${
                        sortField === "name" ? "text-[#141413] font-normal" : "hover:text-[#141413]"
                      }`}
                    >
                      成员
                      {renderSortIcon("name")}
                    </button>
                  </TableHead>
                  {DETAIL_COLUMNS.map((column) => (
                    <Fragment key={column.field}>
                      {sortableHead(column.field, column.label, column.width)}
                    </Fragment>
                  ))}
                  {showDetail && <InteractionDetailHeads renderHead={renderDetailHead} />}
                  {hasContentQuality && sortableHead("goodExcellentRate", "综合达成", "w-[120px]")}
                  {hasContentQuality && showDetail && <RetentionDetailHeads />}
                </TableRow>
              </TableHeader>
              <TableBody className="text-[13px]">
                {/* 首行为组综合：组内全部作品一次聚合，比率按合计重算 */}
                <TableRow className="bg-[#F1F1F0] border-b border-[#E2E2DF]/60">
                  <TableCell className="py-2 pl-4 pr-2 font-normal text-[#141413]">
                    组综合
                  </TableCell>
                  <TableCell className="py-2 px-2 text-right tabular-nums text-[#1F1E1D] font-normal">
                    {summary.aggregate.reportCount}
                  </TableCell>
                  <TableCell className="py-2 px-2 text-right tabular-nums text-[#1F1E1D] font-normal">
                    {formatBigNumber(summary.aggregate.totalPlay)}
                  </TableCell>
                  <TableCell className="py-2 px-2 text-right tabular-nums text-[#1F1E1D] font-normal">
                    {formatBigNumber(summary.aggregate.avgPlay)}
                  </TableCell>
                  <TableCell className="py-2 px-2 text-right tabular-nums text-[#1F1E1D] font-normal">
                    {formatRate(summary.aggregate.followerConversionRate)}
                  </TableCell>
                  <TableCell className="py-2 px-2 text-right tabular-nums text-[#1F1E1D] font-normal">
                    {formatRate(summary.aggregate.interactionRate)}
                  </TableCell>
                  {showDetail && <InteractionDetailCells metrics={summary.aggregate} strong />}
                  {hasContentQuality && (
                    <TableCell className="p-0 text-right tabular-nums text-[#1F1E1D]">
                      <WorkGroupQualitySummaryCell
                        contentQuality={summary.contentQuality}
                        emptyClassName="font-normal text-[#141413]"
                      />
                    </TableCell>
                  )}
                  {hasContentQuality && showDetail && (
                    <RetentionDetailCells contentQuality={summary.contentQuality} strong />
                  )}
                </TableRow>
                {sorted.map((member) => {
                  const isSelf = Boolean(currentUserId && member.userId === currentUserId);
                  return (
                  <TableRow
                    key={member.userId}
                    tabIndex={0}
                    role="button"
                    aria-label={`查看${member.name}的档案卡`}
                    className={`border-b border-[#E2E2DF]/60 ${isSelf ? "bg-[#F7F7F6]" : ""} hover:bg-[#F7F7F6] focus:bg-[#F7F7F6] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#141413]/10 focus-visible:ring-offset-1 transition-colors cursor-pointer`}
                    onClick={() => onSelectPerson(member.userId)}
                    onMouseEnter={() => onPrefetchPerson?.(member.userId)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") onSelectPerson(member.userId);
                    }}
                  >
                    <TableCell className="py-2 pl-4 pr-2 font-normal text-[#141413]">
                      <span className="inline-flex items-center max-w-full">
                        <span className="truncate max-w-[140px] inline-block align-middle font-normal text-[#141413]">
                          {member.name}
                        </span>
                        {isSelf && <SelfMemberBadge />}
                      </span>
                    </TableCell>
                    <TableCell className="py-2 px-2 text-right tabular-nums text-[#1F1E1D]">
                      {member.reportCount}
                    </TableCell>
                    <TableCell className="py-2 px-2 text-right tabular-nums text-[#1F1E1D]">
                      {formatBigNumber(member.totalPlay)}
                    </TableCell>
                    <TableCell className="py-2 px-2 text-right tabular-nums text-[#1F1E1D]">
                      {formatBigNumber(member.avgPlay)}
                    </TableCell>
                    <TableCell className="py-2 px-2 text-right tabular-nums text-[#1F1E1D]">
                      {formatRate(member.followerConversionRate)}
                    </TableCell>
                    <TableCell className="py-2 px-2 text-right tabular-nums text-[#1F1E1D]">
                      {formatRate(member.interactionRate)}
                    </TableCell>
                    {showDetail && <InteractionDetailCells metrics={member} />}
                    {hasContentQuality && (
                      <TableCell className="p-0 text-right tabular-nums text-[#1F1E1D]">
                        <WorkGroupQualitySummaryCell
                          contentQuality={member.contentQuality}
                          emptyClassName="font-normal text-[#141413]"
                        />
                      </TableCell>
                    )}
                    {hasContentQuality && showDetail && <RetentionDetailCells contentQuality={member.contentQuality} />}
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
          <p className="px-4 text-[12px] text-[#78716C]">
            播放、条均与各比率与数据复盘抽屉同源（每作品最新 24h 快照，先加总再相除）；作品数为当月作品总数，未同步数据复盘的作品只计入作品数。「综合达成」里的互动、留存是各自相对标准线的达成比值，不是原始数据。
            {showDetail && DETAIL_FOOTNOTE}
          </p>
        </div>
      )}
    </div>
  );
}
