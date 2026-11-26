"use client";

import { useMemo, useState, type ReactNode } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { CompassConstellationIllustration } from "@/components/editorial/editorial-illustrations";
import {
  interactionDetailColumns,
  qualityColumns,
  rateColumns,
  retentionDetailColumns,
  volumeColumns,
} from "./collaboration-quality-hints";
import { MemberZeroOutputBanner } from "./member-self-hint";
import { RoleTable, type RoleColumn } from "./role-table";
import { DetailToggle } from "./work-group-detail-columns";
import { formatBigNumber, type TalentRow } from "@/lib/collaboration/types";
import type { EvaluationStandards } from "@/lib/evaluation-standards";

interface TalentTabProps {
  talents: TalentRow[];
  currentUserId?: string | null;
  isMemberViewer?: boolean;
  /** 良优率列头旁的「评级规则」入口 */
  rulesEntry?: ReactNode;
  evaluationStandards?: EvaluationStandards;
  sortKey?: string | null;
  sortOrder?: "asc" | "desc";
  onSortChange?: (next: { sortKey: string; sortOrder: "asc" | "desc" }) => void;
  onSelectPerson: (userId: string) => void;
  onPrefetchPerson: (userId: string) => void;
}

/** 名下账号写在姓名下面：最多列三个，其余记个数。 */
export function formatAccountLine(names: string[], total = names.length): string | null {
  if (names.length === 0) return null;
  const shown = names.slice(0, 3).join("、");
  return total > 3 ? `${shown} 等 ${total} 个` : shown;
}

export function goodExcellentText(summary: { ratedCount: number; goodExcellentRate: number | null } | null | undefined) {
  if (!summary || summary.ratedCount === 0 || summary.goodExcellentRate == null) return "良优率 —";
  return `良优率 ${Math.round(summary.goodExcellentRate * 100)}%`;
}

export function TalentTab({
  talents,
  currentUserId = null,
  isMemberViewer = false,
  rulesEntry,
  evaluationStandards,
  sortKey = null,
  sortOrder = "desc",
  onSortChange,
  onSelectPerson,
  onPrefetchPerson,
}: TalentTabProps) {
  const [showDetail, setShowDetail] = useState(false);

  const columns = useMemo<RoleColumn<TalentRow>[]>(() => {
    const getQuality = (row: TalentRow) => row.writerQuality;
    const toneOptions = { standards: evaluationStandards };
    return [
      ...volumeColumns<TalentRow>(),
      ...rateColumns<TalentRow>(toneOptions),
      ...(showDetail ? interactionDetailColumns<TalentRow>() : []),
      ...qualityColumns<TalentRow>(getQuality, rulesEntry, undefined, toneOptions),
      ...(showDetail ? retentionDetailColumns<TalentRow>(getQuality, toneOptions) : []),
    ];
  }, [showDetail, rulesEntry, evaluationStandards]);

  const showSelfZeroHint = Boolean(
    isMemberViewer && currentUserId && !talents.some((r) => r.userId === currentUserId && r.reportCount > 0),
  );

  if (talents.length === 0) {
    return (
      <div className="space-y-3">
        {showSelfZeroHint && <MemberZeroOutputBanner tab="talents" />}
        <EmptyState
          className="py-16"
          illustration={<CompassConstellationIllustration size={96} />}
          title="本月还没有达人作品"
          description="有自营或出镜账号的成员，作品与数据会汇总在这里。"
        />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {showSelfZeroHint && <MemberZeroOutputBanner tab="talents" />}
      <div className="hidden sm:block">
        <DetailToggle expanded={showDetail} onToggle={() => setShowDetail((value) => !value)} />
      </div>
      <RoleTable
        rows={talents}
        columns={columns}
        fullBleed={showDetail && columns.length >= 12}
        defaultSortKey="totalPlay"
        sortKey={sortKey}
        sortOrder={sortOrder}
        onSortChange={onSortChange}
        getId={(row) => row.userId}
        getName={(row) => row.name}
        getSub={(row) => formatAccountLine(row.accounts.map((a) => a.accountName), row.accountCount)}
        isZero={(row) => row.reportCount === 0}
        getMobileSummary={(row) => ({
          primary: formatBigNumber(row.totalPlay),
          secondary: `${row.reportCount} 篇 · ${goodExcellentText(row.writerQuality?.summary)}`,
        })}
        currentUserId={currentUserId}
        onSelectPerson={onSelectPerson}
        onPrefetchPerson={onPrefetchPerson}
      />
    </div>
  );
}
