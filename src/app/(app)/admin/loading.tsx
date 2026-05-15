import { Skeleton } from "@/components/ui/skeleton";

export default function AdminLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <Skeleton className="h-8 w-40" />
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 space-y-4 shadow-sm">
        <Skeleton className="h-5 w-28" />
        <div className="grid grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      </div>
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 space-y-4 shadow-sm">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-48" />
      </div>
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 space-y-4 shadow-sm">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-32" />
      </div>
    </div>
  );
}
