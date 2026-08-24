import { ChartSkeleton } from "@/components/charts/chart-skeleton";
import { TableSkeleton } from "@/components/ui/table-skeleton";

export default function DashboardLoading() {
  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div className="space-y-2">
        <div className="h-8 w-48 rounded bg-[#F5F3EE]" />
        <div className="h-4 w-32 rounded bg-[#F5F3EE]" />
      </div>
      <div className="rounded-xl border border-[#E5E0D6] bg-white p-6 space-y-4 dark:border-[#292524] dark:bg-[#1C1917]">
        <div className="h-5 w-24 rounded bg-[#F5F3EE]" />
        <div className="space-y-3">
          <div className="h-10 rounded bg-[#F5F3EE]" />
          <div className="h-10 rounded bg-[#F5F3EE]" />
          <div className="h-10 w-1/2 rounded bg-[#F5F3EE]" />
        </div>
      </div>
      <div className="rounded-xl border border-[#E5E0D6] bg-white p-6 space-y-4 dark:border-[#292524] dark:bg-[#1C1917]">
        <div className="h-5 w-24 rounded bg-[#F5F3EE]" />
        <div className="grid gap-6">
          <ChartSkeleton className="h-[320px]" />
          <ChartSkeleton className="h-[320px]" />
        </div>
      </div>
      <div className="rounded-xl border border-[#E5E0D6] bg-white p-6 space-y-4 dark:border-[#292524] dark:bg-[#1C1917]">
        <div className="h-5 w-32 rounded bg-[#F5F3EE]" />
        <TableSkeleton columnCount={8} rowCount={4} showHeader={false} />
      </div>
    </div>
  );
}
