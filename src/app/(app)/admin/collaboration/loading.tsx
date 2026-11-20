import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { AdminWorkspaceLayout } from "@/components/admin-workspace-layout";

/** 骨架与真实结构一一对应：结论标题 → 一排切换 → 一行一人的表格，内容出来时不跳。 */
export default function CollaborationLoading() {
  return (
    <AdminWorkspaceLayout width="wide">
      <div className="h-6 sm:h-[34px] flex items-center">
        <Skeleton className="h-5 sm:h-7 w-64 sm:w-96 rounded-md" />
      </div>
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <Skeleton className="h-7 w-28 rounded-md" />
          <div className="flex items-center gap-1">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-7 w-16 rounded-md" />
            ))}
          </div>
          <Skeleton className="ml-auto h-7 w-20 rounded-md" />
        </div>
        <Card className="overflow-hidden p-0 gap-0">
          <div className="h-9 border-b border-[#E2E2DF]/60" />
          <div className="divide-y divide-[#E2E2DF]/60">
            {Array.from({ length: 8 }).map((_, index) => (
              <div key={index} className="flex items-center justify-between px-4 py-2.5">
                <div className="flex flex-col gap-1">
                  <Skeleton className="h-5 w-16 rounded-md" />
                  <Skeleton className="h-[18px] w-28 rounded-md" />
                </div>
                <div className="flex items-center gap-8">
                  <Skeleton className="h-4 w-10 rounded-md" />
                  <Skeleton className="h-4 w-12 rounded-md" />
                  <Skeleton className="h-4 w-12 rounded-md" />
                  <Skeleton className="hidden md:block h-4 w-12 rounded-md" />
                  <Skeleton className="hidden md:block h-4 w-12 rounded-md" />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </AdminWorkspaceLayout>
  );
}
