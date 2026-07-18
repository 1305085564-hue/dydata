import { loadApprovedList } from "@/lib/publish-drafts/read-model";
import { EmptyState } from "@/components/ui/empty-state";
import { ApprovedList } from "./components/approved-list";
import { ReloadButton } from "./components/reload-button";

interface ApprovedListDataContainerProps {
  query: string;
  userId: string;
}

export function ApprovedArchiveEmptyState({ query }: { query: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-stone-300 bg-white py-12">
      <EmptyState
        title={query ? "没找到匹配的已发稿件" : "还没有已通过的稿件"}
        description={
          query
            ? "换个关键词后再查看历史案例。"
            : "此页面仅保留历史记录，新的作品请前往数据台提交。"
        }
      />
    </div>
  );
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
      <div className="rounded-xl border border-stone-200 bg-stone-50 p-5 text-[13px] leading-[1.7] text-[#D99E55] flex flex-col items-start">
        <span>{errorMessage}</span>
        <ReloadButton />
      </div>
    );
  }

  const items = data ?? [];

  if (items.length === 0) {
    return <ApprovedArchiveEmptyState query={query} />;
  }

  return <ApprovedList items={items} query={query} currentUserId={userId} />;
}
