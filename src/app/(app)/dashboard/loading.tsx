import { ChartSkeleton } from "@/components/charts/chart-skeleton";
import { TableSkeleton } from "@/components/ui/table-skeleton";

export default function DashboardLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="space-y-2">
        <div className="h-8 w-48 rounded bg-stone-100" />
        <div className="h-4 w-32 rounded bg-stone-100" />
      </div>
      <div className="rounded-xl border border-stone-200 bg-white p-6 space-y-4 dark:border-stone-800 dark:bg-stone-900">
        <div className="h-5 w-24 rounded bg-stone-100" />
        <div className="space-y-3">
          <div className="h-10 rounded bg-stone-100" />
          <div className="h-10 rounded bg-stone-100" />
          <div className="h-10 w-1/2 rounded bg-stone-100" />
        </div>
      </div>
      <div className="rounded-xl border border-stone-200 bg-white p-6 space-y-4 dark:border-stone-800 dark:bg-stone-900">
        <div className="h-5 w-24 rounded bg-stone-100" />
        <div className="grid gap-6">
          <ChartSkeleton className="h-[320px]" />
          <ChartSkeleton className="h-[320px]" />
        </div>
      </div>
      <div className="rounded-xl border border-stone-200 bg-white p-6 space-y-4 dark:border-stone-800 dark:bg-stone-900">
        <div className="h-5 w-32 rounded bg-stone-100" />
        <TableSkeleton columnCount={8} rowCount={4} showHeader={false} />
      </div>
    </div>
  );
}
