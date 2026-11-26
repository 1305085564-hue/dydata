"use client";

import { useMemo, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { DeskStudyIllustration, CompassConstellationIllustration } from "@/components/editorial/editorial-illustrations";
import {
  excellentCountColumn,
  interactionDetailColumns,
  qualityColumns,
  rateColumns,
  retentionDetailColumns,
  volumeColumns,
} from "./collaboration-quality-hints";
import { MemberZeroOutputBanner } from "./member-self-hint";
import { RoleTable, type RoleColumn } from "./role-table";
import { formatAccountLine, goodExcellentText } from "./talent-tab";
import { DetailToggle } from "./work-group-detail-columns";
import { WriterCertificationButton } from "./writer-certification-button";
import { formatBigNumber, type StaffRow } from "@/lib/collaboration/types";
import type { EvaluationStandards } from "@/lib/evaluation-standards";
import { useCollaborationDetailMode } from "@/lib/table-view-mode";

export type StaffRole = "writer" | "editor";

interface StaffTabProps {
  rows: StaffRow[];
  certifiableUserIds?: string[];
  role: StaffRole;
  currentUserId?: string | null;
  isMemberViewer?: boolean;
  /** 良优率列头旁的「评级规则」入口（只有文案表有评级列） */
  rulesEntry?: ReactNode;
  evaluationStandards?: EvaluationStandards;
  sortKey?: string | null;
  sortOrder?: "asc" | "desc";
  onSortChange?: (next: { sortKey: string; sortOrder: "asc" | "desc" }) => void;
  onSelectPerson: (userId: string) => void;
  onPrefetchPerson?: (userId: string) => void;
  onRefreshData?: () => void;
}

/** 认证：有权限的给按钮，其余只读。按钮在可点的行里，点击不能冒泡成「打开档案」。 */
function WriterCertificationCell({ row, canCertify, onRefreshData }: { row: StaffRow; canCertify: boolean; onRefreshData?: () => void }) {
  const hasWork = row.reportCount > 0;
  if (!canCertify) {
    return (
      <Badge variant={row.isCertified || !hasWork ? "secondary" : "warning"}>
        {row.isCertified ? (row.certifiedByName ? `${row.certifiedByName}认证` : "已认证") : hasWork ? "待认证" : "未认证"}
      </Badge>
    );
  }
  return (
    <span
      className="inline-flex"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <WriterCertificationButton
        userId={row.userId}
        certified={Boolean(row.isCertified)}
        certifiedByName={row.certifiedByName}
        canCertify
        hasWork={hasWork}
        onRefreshData={onRefreshData}
      />
    </span>
  );
}

export function StaffTab({
  rows,
  role,
  currentUserId = null,
  isMemberViewer = false,
  rulesEntry,
  evaluationStandards,
  sortKey = null,
  sortOrder = "desc",
  onSortChange,
  onSelectPerson,
  onPrefetchPerson,
  onRefreshData,
  certifiableUserIds = [],
}: StaffTabProps) {
  const roleLabel = role === "writer" ? "文案" : "剪辑";
  const tabKey = role === "writer" ? "writers" : "editors";
  const { showDetail, setMode } = useCollaborationDetailMode();

  const columns = useMemo<RoleColumn<StaffRow>[]>(() => {
    if (role === "editor") return volumeColumns<StaffRow>();
    const getQuality = (row: StaffRow) => row.writerQuality;
    const certifiable = new Set(certifiableUserIds);
    const toneOptions = { standards: evaluationStandards };
    return [
      ...volumeColumns<StaffRow>(),
      ...rateColumns<StaffRow>(toneOptions),
      ...(showDetail ? interactionDetailColumns<StaffRow>() : []),
      ...qualityColumns<StaffRow>(getQuality, rulesEntry, undefined, toneOptions),
      ...(showDetail ? retentionDetailColumns<StaffRow>(getQuality, toneOptions) : []),
      excellentCountColumn<StaffRow>(getQuality),
      {
        key: "certification",
        label: "认证",
        tip: "认证后才计入文案结算。",
        width: 92,
        render: (row) => <WriterCertificationCell row={row} canCertify={certifiable.has(row.userId)} onRefreshData={onRefreshData} />,
      },
    ];
  }, [role, showDetail, rulesEntry, evaluationStandards, certifiableUserIds, onRefreshData]);

  const showSelfZeroHint = Boolean(
    isMemberViewer && currentUserId && !rows.some((r) => r.userId === currentUserId && r.reportCount > 0),
  );

  if (rows.length === 0) {
    return (
      <div className="space-y-3">
        {showSelfZeroHint && <MemberZeroOutputBanner tab={tabKey} />}
        <EmptyState
          className="py-16"
          illustration={role === "writer" ? <DeskStudyIllustration size={96} /> : <CompassConstellationIllustration size={96} />}
          title={`本月还没有${roleLabel}记录`}
          description={
            role === "writer"
              ? "管理员可在本表认证文案成员，认证后计入文案结算。"
              : "剪辑只统计给别人账号协同剪辑的作品。"
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {showSelfZeroHint && <MemberZeroOutputBanner tab={tabKey} />}
      {role === "writer" && (
        <div className="hidden sm:block">
          <DetailToggle expanded={showDetail} onModeChange={setMode} />
        </div>
      )}
      <RoleTable
        rows={rows}
        columns={columns}
        defaultSortKey="totalPlay"
        sortKey={sortKey}
        sortOrder={sortOrder}
        onSortChange={onSortChange}
        getId={(row) => row.userId}
        getName={(row) => row.name}
        getSub={(row) =>
          formatAccountLine(row.involvedAccounts.map((a) => a.accountName), row.involvedAccountTotal)
        }
        isZero={(row) => row.reportCount === 0}
        getMobileSummary={(row) => ({
          primary: formatBigNumber(row.totalPlay),
          secondary:
            role === "writer"
              ? `${row.reportCount} 篇 · ${goodExcellentText(row.writerQuality?.summary)}`
              : `${row.reportCount} 篇`,
        })}
        currentUserId={currentUserId}
        onSelectPerson={onSelectPerson}
        onPrefetchPerson={onPrefetchPerson}
      />
    </div>
  );
}
