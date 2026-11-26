"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, UserPlus } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { DeskStudyIllustration } from "@/components/editorial/editorial-illustrations";
import { teamMetricColumns } from "./collaboration-quality-hints";
import { RoleTable } from "./role-table";
import { goodExcellentText } from "./talent-tab";
import { DetailToggle } from "./work-group-detail-columns";
import { workGroupKindLabel } from "./work-group-list-tab";
import {
  formatBigNumber,
  type WorkGroupDetailView as WorkGroupDetailViewType,
  type WorkGroupMemberRow,
} from "@/lib/collaboration/types";
import type { EvaluationStandards } from "@/lib/evaluation-standards";

interface WorkGroupDetailViewProps {
  detail: WorkGroupDetailViewType;
  canManage?: boolean;
  currentUserId?: string | null;
  evaluationStandards?: EvaluationStandards;
  sortKey?: string | null;
  sortOrder?: "asc" | "desc";
  onSortChange?: (next: { sortKey: string; sortOrder: "asc" | "desc" }) => void;
  onBack: () => void;
  onOpenManageDrawer?: (groupId: string) => void;
  onSelectPerson: (userId: string) => void;
  onPrefetchPerson?: (userId: string) => void;
}

/**
 * 小队详情：标题即这支小队本月的结论，下面一行一位组员（点开个人档案）。
 * 表头下第一行是「全队合计」：组内全部作品一次聚合，比率按合计重算，不是组员比率的平均。
 */
export function WorkGroupDetailView({
  detail,
  canManage = false,
  currentUserId = null,
  evaluationStandards,
  sortKey = null,
  sortOrder = "desc",
  onSortChange,
  onBack,
  onOpenManageDrawer,
  onSelectPerson,
  onPrefetchPerson,
}: WorkGroupDetailViewProps) {
  const { summary, members } = detail;
  const [showDetail, setShowDetail] = useState(false);

  const withQuality = summary.contentQuality !== null || members.some((m) => m.contentQuality !== null);
  const columns = useMemo(
    () => teamMetricColumns<WorkGroupMemberRow>({ showDetail, withQuality, standards: evaluationStandards }),
    [showDetail, withQuality, evaluationStandards],
  );

  const summaryRow: WorkGroupMemberRow = useMemo(
    () => ({ ...summary.aggregate, userId: summary.id, name: "全队合计", contentQuality: summary.contentQuality }),
    [summary],
  );

  const headline = [
    `${workGroupKindLabel(summary.kind)}小队 · ${summary.memberCount} 人`,
    `本月 ${summary.aggregate.reportCount} 篇`,
    summary.contentQuality ? goodExcellentText(summary.contentQuality) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="space-y-3">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <button
            type="button"
            onClick={onBack}
            className="-ml-2 inline-flex h-7 items-center gap-1 rounded-md px-2 text-[12px] text-[#78716C] hover:bg-[#EBEBE9] hover:text-[#141413] transition-colors duration-150 cursor-pointer"
          >
            <ChevronLeft className="size-3.5" aria-hidden />
            全部小队
          </button>
          <h2 className="font-serif text-[20px] leading-[1.30] text-[#141413]">{summary.name}</h2>
          <p className="text-[12px] text-[#78716C] tabular-nums">{headline}</p>
        </div>
        {canManage && onOpenManageDrawer && (
          <button
            type="button"
            onClick={() => onOpenManageDrawer(summary.id)}
            className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[14px] text-[#1F1E1D] hover:bg-[#EBEBE9] transition-colors duration-150 cursor-pointer"
          >
            <UserPlus className="size-3.5 text-[#78716C]" aria-hidden />
            成员管理
          </button>
        )}
      </header>

      {members.length === 0 ? (
        <EmptyState
          className="py-16"
          illustration={<DeskStudyIllustration size={80} />}
          title="这支小队还没有成员"
          description={canManage ? "点右上角「成员管理」给小队分配组员。" : "团队负责人分配组员后，会在这里显示。"}
        />
      ) : (
        <div className="space-y-2">
          <div className="hidden sm:block">
            <DetailToggle expanded={showDetail} onToggle={() => setShowDetail((value) => !value)} />
          </div>
          <RoleTable
            rows={members}
            columns={columns}
            fullBleed={showDetail && columns.length >= 12}
            defaultSortKey="totalPlay"
        sortKey={sortKey}
        sortOrder={sortOrder}
        onSortChange={onSortChange}
            summary={{ name: "全队合计", sub: "比率按全队作品合计重算", row: summaryRow }}
            getId={(row) => row.userId}
            getName={(row) => row.name}
            isZero={(row) => row.reportCount === 0}
            getMobileSummary={(row) => ({
              primary: formatBigNumber(row.totalPlay),
              secondary: row.contentQuality
                ? `${row.reportCount} 篇 · ${goodExcellentText(row.contentQuality)}`
                : `${row.reportCount} 篇`,
            })}
            currentUserId={currentUserId}
            onSelectPerson={onSelectPerson}
            onPrefetchPerson={onPrefetchPerson}
          />
        </div>
      )}
    </div>
  );
}
