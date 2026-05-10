import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { StatusBadge } from "./status-badge";
import { PassRateBadge } from "./pass-rate-badge";
import { formatDateTime, getAccountName, getSubmitterName, getTeamName } from "./format";
import type { ViolationCase } from "./types";

export function CaseCard({ caseItem }: { caseItem: ViolationCase }) {
  return (
    <Link
      href={`/violations/${caseItem.id}`}
      className="group block rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition-colors hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-md"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge caseItem={caseItem} />
            <PassRateBadge passCount={caseItem.pass_count} failCount={caseItem.fail_count} compact />
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">
              {caseItem.category || "其他"}
            </span>
          </div>
          <p className="line-clamp-3 text-base font-semibold leading-7 text-zinc-800">
            {caseItem.script_text}
          </p>
          {caseItem.status === "verified" && caseItem.admin_conclusion ? (
            <div className="rounded-2xl border border-zinc-200 border-l-[2px] border-l-[#D99E55] bg-zinc-50 px-3 py-2 text-sm leading-6 text-[#D99E55]">
              {caseItem.admin_conclusion}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs font-medium text-zinc-500">
            <span>{getAccountName(caseItem)}</span>
            <span>{getTeamName(caseItem)}</span>
            <span>{getSubmitterName(caseItem)}</span>
            <span>{formatDateTime(caseItem.reviewed_at ?? caseItem.created_at)}</span>
          </div>
        </div>
        <ArrowRight className="size-4 shrink-0 text-zinc-300 transition-transform group-hover:translate-x-1 group-hover:text-zinc-800" />
      </div>
    </Link>
  );
}

