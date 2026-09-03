import { AdminWorkspaceLayout } from "@/components/admin-workspace-layout";
import { Skeleton } from "@/components/ui/skeleton";
import { TableSkeleton } from "@/components/ui/table-skeleton";

export default function ContentLoading() {
  return (
    <AdminWorkspaceLayout indexItems={[]} width="extra-wide">
      <div className="flex flex-1 flex-col scroll-mt-8 space-y-6">
        {/* 单排顶栏控制舱骨架 */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E5E0D6]/80 bg-[#FBF9F5]/85 px-3.5 py-2.5 shadow-2xs">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1">
              <Skeleton className="h-7 w-20 rounded-lg" />
              <Skeleton className="h-7 w-16 rounded-lg" />
            </div>
            <Skeleton className="h-7 w-36 rounded-md" />
          </div>
          <div className="ml-auto flex items-center gap-3">
            <Skeleton className="h-4 w-36 rounded" />
          </div>
        </div>

        {/* 视频复盘列表表格骨架 */}
        <TableSkeleton columnCount={10} rowCount={8} showHeader={true} />
      </div>
    </AdminWorkspaceLayout>
  );
}
