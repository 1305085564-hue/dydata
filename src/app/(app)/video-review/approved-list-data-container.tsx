import Link from "next/link";
import { FilePlus2 } from "lucide-react";

import { loadApprovedList } from "@/lib/publish-drafts/read-model";
import { EmptyState } from "@/components/ui/empty-state";
import { ApprovedList } from "./components/approved-list";

interface ApprovedListDataContainerProps {
  query: string;
  userId: string;
}

export async function ApprovedListDataContainer({
  query,
  userId,
}: ApprovedListDataContainerProps) {
  const { data, errorMessage } = await loadApprovedList({
    limit: 100,
    search: query || null,
  });

  if (errorMessage) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-5 text-[13px] leading-[1.7] text-[#D99E55]">
        {errorMessage}
      </div>
    );
  }

  const items = data ?? [];

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-300 bg-white py-12">
        <EmptyState
          title={query ? "没找到匹配的已发稿件" : "还没有已通过的稿件"}
          description={
            query
              ? "换个关键词试试，或上传一条新的待审稿。"
              : "上传一条待审稿，审核通过后会展示在这里。"
          }
        />
        <div className="mt-4 flex justify-center">
          <Link
            href="/video-review/submit"
            className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[#D97757] px-4 text-[13px] font-medium text-white transition-colors hover:bg-[#C96442] active:translate-y-0"
          >
            <FilePlus2 className="size-4 stroke-[1.75]" />
            上传待审稿
          </Link>
        </div>
      </div>
    );
  }

  return <ApprovedList items={items} query={query} currentUserId={userId} />;
}
