"use client";

import { useMemo, useState } from "react";
import { StaffTab } from "./staff-tab";
import type { StaffRow, ContentQualitySummary } from "./types";
import { partitionWriterCandidates } from "@/lib/collaboration/domain/workbench-state";

export type WriterCandidateRow = {
  userId: string;
  name: string;
  certified: boolean;
  writerQuality?: { state: "ready" | "error"; summary: ContentQualitySummary | null } | null;
};

function candidateToStaffRow(candidate: WriterCandidateRow): StaffRow {
  return {
    userId: candidate.userId,
    name: candidate.name,
    reportCount: 0,
    followerConversionRate: null,
    interactionRate: null,
    certifiedByName: candidate.certified ? "已认证" : null,
    isCertified: candidate.certified,
    totalPlay: 0,
    avgPlay: 0,
    selfHandledCount: 0,
    involvedAccounts: [],
    involvedAccountTotal: 0,
    recentWorks: [],
    works: [],
    writerQuality: candidate.writerQuality ?? null,
  };
}

export function WriterTab({
  rows,
  candidates,
  canCertify,
  currentUserId,
  isMemberViewer = false,
  onSelectPerson,
  onPrefetchPerson,
}: {
  rows: StaffRow[];
  candidates: WriterCandidateRow[];
  canCertify: boolean;
  currentUserId?: string | null;
  isMemberViewer?: boolean;
  onSelectPerson: (id: string) => void;
  onPrefetchPerson: (id: string) => void;
}) {
  const [showCandidates, setShowCandidates] = useState(false);

  const { activeRows, uncertifiedRows } = useMemo(() => {
    const { certifiedSupplemental, uncertifiedCandidates } = partitionWriterCandidates(
      rows,
      candidates,
    );
    const mergedActive = [...rows, ...certifiedSupplemental.map(candidateToStaffRow)].sort((a, b) => {
      if (b.reportCount !== a.reportCount) return b.reportCount - a.reportCount;
      const aCert = a.isCertified ? 1 : 0;
      const bCert = b.isCertified ? 1 : 0;
      if (bCert !== aCert) return bCert - aCert;
      return a.name.localeCompare(b.name, "zh-CN");
    });
    const folded = uncertifiedCandidates
      .map(candidateToStaffRow)
      .sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
    return { activeRows: mergedActive, uncertifiedRows: folded };
  }, [rows, candidates]);

  const visibleRows = useMemo(
    () => (showCandidates ? [...activeRows, ...uncertifiedRows] : activeRows),
    [activeRows, uncertifiedRows, showCandidates],
  );

  const certifiableUserIds = useMemo(
    () => (canCertify ? candidates.map((c) => c.userId) : []),
    [canCertify, candidates],
  );

  return (
    <div className="space-y-2">
      <StaffTab
        rows={visibleRows}
        role="writer"
        currentUserId={currentUserId}
        isMemberViewer={isMemberViewer}
        onSelectPerson={onSelectPerson}
        onPrefetchPerson={onPrefetchPerson}
        certifiableUserIds={certifiableUserIds}
      />
      {uncertifiedRows.length > 0 && (
        <div className="px-1">
          <button
            type="button"
            onClick={() => setShowCandidates((prev) => !prev)}
            className="inline-flex h-7 items-center gap-1 rounded-md px-2.5 text-[12px] font-normal text-[#78716C] hover:bg-[#EBEBE9] hover:text-[#141413] transition-colors cursor-pointer"
          >
            <span className="tabular-nums">{showCandidates ? "[-]" : "[+]"}</span>
            <span>
              {showCandidates
                ? `收起未认证候选人 (${uncertifiedRows.length})`
                : `查看未认证候选人 (${uncertifiedRows.length})`}
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
