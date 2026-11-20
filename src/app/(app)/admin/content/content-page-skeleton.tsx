import { Skeleton } from "@/components/ui/skeleton";
import { TableSkeleton } from "@/components/ui/table-skeleton";

/**
 * 数据复盘加载骨架：和真实页面同高同序（页头一行 → 工具栏一行 → 表格），
 * 数据到了只换内容不挪位置（效率美学 §2.5 布局零跳动）。
 */
export function ContentPageSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true">
      <h1 className="font-serif text-[20px] sm:text-[28px] leading-[1.20] tracking-tight text-[#A8A29E]">
        数据复盘
      </h1>
      <div className="flex flex-wrap items-center gap-2 py-1">
        <Skeleton className="h-7 w-40 rounded-md" />
        <Skeleton className="h-7 w-20 rounded-md" />
        <Skeleton className="h-7 w-16 rounded-md" />
        <Skeleton className="ml-auto h-7 w-24 rounded-md" />
      </div>
      <TableSkeleton columnCount={10} rowCount={8} showHeader={true} />
    </div>
  );
}
