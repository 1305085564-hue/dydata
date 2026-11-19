"use client";

import { EmptyState } from "@/components/ui/empty-state";
import { DeskStudyIllustration } from "@/components/editorial/editorial-illustrations";
import { rateColumns, volumeColumns } from "./collaboration-quality-hints";
import { MemberZeroOutputBanner } from "./member-self-hint";
import { RoleTable, type RoleColumn } from "./role-table";
import { formatAccountLine } from "./talent-tab";
import { formatBigNumber, type OperatorRow } from "./types";

interface OperatorTabProps {
  operators: OperatorRow[];
  currentUserId?: string | null;
  isMemberViewer?: boolean;
  onSelectPerson: (userId: string) => void;
  onPrefetchPerson?: (userId: string) => void;
}

/** 运营只统计给别人孵化、负责的账号；逐个账号的条数与导粉放在个人档案里看。 */
const OPERATOR_COLUMNS: RoleColumn<OperatorRow>[] = [
  ...volumeColumns<OperatorRow>(),
  ...rateColumns<OperatorRow>(),
];

export function OperatorTab({
  operators,
  currentUserId = null,
  isMemberViewer = false,
  onSelectPerson,
  onPrefetchPerson,
}: OperatorTabProps) {
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
        columns={OPERATOR_COLUMNS}
        defaultSortKey="totalPlay"
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
