"use client";

export function TeamManagementSkeleton() {
  return (
    <section className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-6">
      <div className="space-y-2">
        <div className="h-4 w-32 rounded bg-zinc-100" />
        <div className="h-3 w-56 rounded bg-zinc-100" />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="h-40 rounded-2xl bg-zinc-50" />
        <div className="h-40 rounded-2xl bg-zinc-50" />
      </div>
      <div className="h-28 rounded-2xl bg-zinc-50" />
    </section>
  );
}
