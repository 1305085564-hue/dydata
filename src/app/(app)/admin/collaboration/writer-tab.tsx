"use client";

import { useMemo } from "react";
import { StaffTab } from "./staff-tab";
import type { StaffRow } from "./types";

export type WriterCandidateRow = { userId: string; name: string; certified: boolean };

export function WriterTab({
  rows,
  candidates,
  canCertify,
  onSelectPerson,
  onPrefetchPerson,
}: {
  rows: StaffRow[];
  candidates: WriterCandidateRow[];
  canCertify: boolean;
  onSelectPerson: (id: string) => void;
  onPrefetchPerson: (id: string) => void;
}) {
  // 合并候选成员中尚未在 rows 里的成员（作为 0 作品行补齐），
  // 一张表纵览全员，产出成员排前，零产出成员排后，随时可认证
  const allRows = useMemo(() => {
    const existingUserIds = new Set(rows.map((r) => r.userId));
    const supplemental: StaffRow[] = [];

    for (const candidate of candidates) {
      if (!existingUserIds.has(candidate.userId)) {
        supplemental.push({
          userId: candidate.userId,
          name: candidate.name,
          reportCount: 0,
          effectiveCount: 0,
          excellentCount: 0,
          billingCount: null,
          certifiedByName: candidate.certified ? "已认证" : null,
          isCertified: candidate.certified,
          totalPlay: 0,
          avgPlay: 0,
          selfHandledCount: 0,
          involvedAccounts: [],
          involvedAccountTotal: 0,
          recentWorks: [],
          works: [],
        });
      }
    }

    const merged = [...rows, ...supplemental];
    return merged.sort((a, b) => {
      if (b.reportCount !== a.reportCount) return b.reportCount - a.reportCount;
      const aCert = a.isCertified ? 1 : 0;
      const bCert = b.isCertified ? 1 : 0;
      if (bCert !== aCert) return bCert - aCert;
      return a.name.localeCompare(b.name, "zh-CN");
    });
  }, [rows, candidates]);

  const certifiableUserIds = useMemo(() => {
    return canCertify ? candidates.map((c) => c.userId) : [];
  }, [canCertify, candidates]);

  return (
    <StaffTab
      rows={allRows}
      role="writer"
      onSelectPerson={onSelectPerson}
      onPrefetchPerson={onPrefetchPerson}
      certifiableUserIds={certifiableUserIds}
    />
  );
}
