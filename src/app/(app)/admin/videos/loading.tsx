import { AdminWorkspaceLayout } from "@/components/admin-workspace-layout";
import { Skeleton } from "@/components/ui/skeleton";
import { TableSkeleton } from "@/components/ui/table-skeleton";

export default function VideosLoading() {
  return (
    <AdminWorkspaceLayout indexItems={[]} width="extra-wide">
      <div className="flex flex-1 flex-col scroll-mt-8 space-y-6">
        {/* 控制舱骨架 */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 py-1">
          <div className="flex flex-wrap items-center gap-3">
            {/* 待处理 / 全部 / 回收站 视角切片 */}
            <div className="inline-flex items-center gap-1 rounded-xl bg-[#F5F3EE]/70 p-1">
              <Skeleton className="h-6 w-16 rounded-lg" />
              <Skeleton className="h-6 w-14 rounded-lg" />
              <Skeleton className="h-6 w-16 rounded-lg" />
            </div>
            {/* 范围/创作者/账号筛选器 */}
            <Skeleton className="h-7 w-28 rounded-md" />
            <Skeleton className="h-7 w-28 rounded-md" />
            <Skeleton className="h-7 w-28 rounded-md" />
          </div>
        </div>

        {/* 素材库表格骨架 */}
        <TableSkeleton columnCount={8} rowCount={8} showHeader={true} />
      </div>
    </AdminWorkspaceLayout>
  );
}
