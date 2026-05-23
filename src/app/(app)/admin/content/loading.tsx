import { Skeleton } from "@/components/ui/skeleton";

export default function ContentLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <Skeleton className="h-8 w-40" />
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 space-y-4 shadow-sm">
        <Skeleton className="h-5 w-28" />
        <div className="flex items-center justify-between gap-4">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-8 w-60" />
        </div>
        <Skeleton className="h-48" />
      </div>
    </div>
  );
}
