"use client";

import { useState } from "react";
import { StaffTab } from "./staff-tab";
import { WriterCertificationButton } from "./writer-certification-button";
import type { StaffRow } from "./types";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export type WriterCandidateRow = { userId: string; name: string; certified: boolean };

export function WriterTab({ rows, candidates, canCertify, onSelectPerson, onPrefetchPerson }: {
  rows: StaffRow[]; candidates: WriterCandidateRow[]; canCertify: boolean;
  onSelectPerson: (id: string) => void; onPrefetchPerson: (id: string) => void;
}) {
  const [showCandidates, setShowCandidates] = useState(false);
  const pending = candidates.filter((candidate) => !candidate.certified);
  return <div className="space-y-3">
    {canCertify && <div className="flex gap-2 text-[13px]">
      <button type="button" aria-pressed={!showCandidates} onClick={() => setShowCandidates(false)} className="rounded-md px-3 py-1 hover:bg-[#F5F3EE] aria-pressed:bg-[#F5F3EE]">已认证（{rows.length}）</button>
      <button type="button" aria-pressed={showCandidates} onClick={() => setShowCandidates(true)} className="rounded-md px-3 py-1 hover:bg-[#F5F3EE] aria-pressed:bg-[#F5F3EE]">待认证（{pending.length}）</button>
    </div>}
    {canCertify && showCandidates ? <div className="rounded-xl bg-white shadow-card-ring overflow-hidden">
      <Table><TableHeader><TableRow><TableHead>姓名</TableHead><TableHead>认证状态</TableHead><TableHead>操作</TableHead></TableRow></TableHeader>
        <TableBody>{pending.map(candidate => <TableRow key={candidate.userId}>
          <TableCell>{candidate.name}</TableCell><TableCell>未认证</TableCell>
          <TableCell><WriterCertificationButton userId={candidate.userId} certified={false} /></TableCell>
        </TableRow>)}{pending.length === 0 && <TableRow><TableCell colSpan={3}>暂无待认证成员</TableCell></TableRow>}</TableBody>
      </Table>
    </div> : <StaffTab rows={rows} role="writer" onSelectPerson={onSelectPerson} onPrefetchPerson={onPrefetchPerson}
      certifiableUserIds={canCertify ? candidates.map(candidate => candidate.userId) : []} />}
  </div>;
}
