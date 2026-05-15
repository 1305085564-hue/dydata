import { ChartSkeleton } from "@/components/charts/chart-skeleton";

export default function DashboardLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="space-y-2">
        <div className="h-8 w-48 rounded bg-zinc-100" />
        <div className="h-4 w-32 rounded bg-zinc-100" />
      </div>
      <div className="rounded-xl border border-zinc-200 bg-white p-6 space-y-4">
        <div className="h-5 w-24 rounded bg-zinc-100" />
        <div className="space-y-3">
          <div className="h-10 rounded bg-zinc-100" />
          <div className="h-10 rounded bg-zinc-100" />
          <div className="h-10 w-1/2 rounded bg-zinc-100" />
        </div>
      </div>
      <div className="rounded-xl border border-zinc-200 bg-white p-6 space-y-4">
        <div className="h-5 w-24 rounded bg-zinc-100" />
        <div className="grid gap-6">
          <ChartSkeleton className="h-[320px]" />
          <ChartSkeleton className="h-[320px]" />
        </div>
      </div>
      <div className="rounded-xl border border-zinc-200 bg-white p-6 space-y-4">
        <div className="h-5 w-32 rounded bg-zinc-100" />
        <div className="h-32 rounded bg-zinc-100" />
      </div>
    </div>
  );
}
