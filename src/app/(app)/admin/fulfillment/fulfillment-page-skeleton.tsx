import { Skeleton } from "@/components/ui/skeleton";
import { TableSkeleton } from "@/components/ui/table-skeleton";

/**
 * 发布管理加载骨架：和真实页面同序（页头 → 今天一行 → 工具栏 → 大表），
 * 数据到了只换内容不挪位置（效率美学 §2.5 布局零跳动）。
 */
export function FulfillmentPageSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true">
      <div className="space-y-1">
        <h1 className="font-serif text-[20px] sm:text-[28px] leading-[1.20] tracking-tight text-[#A8A29E]">
          发布管理
        </h1>
        <Skeleton className="h-5 w-56 rounded-md" />
      </div>
      <div className="flex flex-wrap items-center gap-2 py-1">
        <Skeleton className="h-7 w-48 rounded-md" />
        <Skeleton className="ml-auto h-7 w-28 rounded-md" />
      </div>
      <TableSkeleton columnCount={8} rowCount={8} showHeader={true} />
    </div>
  );
}
