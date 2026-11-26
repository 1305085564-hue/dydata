"use client";

import { useMemo } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { DeskStudyIllustration } from "@/components/editorial/editorial-illustrations";
import { rateColumns, volumeColumns } from "./collaboration-quality-hints";
import { MemberZeroOutputBanner } from "./member-self-hint";
import { RoleTable, type RoleColumn } from "./role-table";
import { formatAccountLine } from "./talent-tab";
import { formatBigNumber, type OperatorRow } from "@/lib/collaboration/types";
import type { EvaluationStandards } from "@/lib/evaluation-standards";

interface OperatorTabProps {
  operators: OperatorRow[];
  currentUserId?: string | null;
  isMemberViewer?: boolean;
  evaluationStandards?: EvaluationStandards;
  sortKey?: string | null;
  sortOrder?: "asc" | "desc";
  onSortChange?: (next: { sortKey: string; sortOrder: "asc" | "desc" }) => void;
  onSelectPerson: (userId: string) => void;
  onPrefetchPerson?: (userId: string) => void;
}

export function OperatorTab({
  operators,
  currentUserId = null,
  isMemberViewer = false,
  evaluationStandards,
  sortKey = null,
  sortOrder = "desc",
  onSortChange,
  onSelectPerson,
  onPrefetchPerson,
}: OperatorTabProps) {
  const columns = useMemo<RoleColumn<OperatorRow>[]>(
    () => [
      ...volumeColumns<OperatorRow>(),
      ...rateColumns<OperatorRow>({ standards: evaluationStandards }),
    ],
    [evaluationStandards],
  );
  const showSelfZeroHint = Boolean(
    isMemberViewer && currentUserId && !operators.some((r) => r.userId === currentUserId && r.reportCount > 0),
  );

  if (operators.length === 0) {
    return (
      <div className="space-y-3">
        {showSelfZeroHint && <MemberZeroOutputBanner tab="operators" />}
        <EmptyState
          className="py-16"
          illustration={<DeskStudyIllustration size={96} />}
          title="本月还没有跨账号运营记录"
          description="这里只统计给别人账号做运营的作品；自营账号的作品在「达人」里看。"
        />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {showSelfZeroHint && <MemberZeroOutputBanner tab="operators" />}
      <RoleTable
        rows={operators}
        columns={columns}
        defaultSortKey="totalPlay"
        sortKey={sortKey}
        sortOrder={sortOrder}
        onSortChange={onSortChange}
        getId={(row) => row.userId}
        getName={(row) => row.name}
        getSub={(row) => {
          const line = formatAccountLine(row.accounts.map((a) => a.accountName), row.accountCount);
          return line ? `负责 ${line}` : null;
        }}
        isZero={(row) => row.reportCount === 0}
        getMobileSummary={(row) => ({
          primary: formatBigNumber(row.totalPlay),
          secondary: `${row.reportCount} 篇 · 负责 ${row.accountCount} 个账号`,
        })}
        currentUserId={currentUserId}
        onSelectPerson={onSelectPerson}
        onPrefetchPerson={onPrefetchPerson}
      />
    </div>
  );
}
