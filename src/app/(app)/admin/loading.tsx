export default function AdminLoading() {
  return (
    <div className="mx-auto max-w-5xl space-y-8 animate-pulse">
      <div className="h-8 w-40 rounded bg-muted" />
      <div className="rounded-xl border bg-background p-6 space-y-4">
        <div className="h-5 w-28 rounded bg-muted" />
        <div className="grid grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-10 rounded bg-muted" />
          ))}
        </div>
      </div>
      <div className="rounded-xl border bg-background p-6 space-y-4">
        <div className="h-5 w-28 rounded bg-muted" />
        <div className="h-48 rounded bg-muted" />
      </div>
      <div className="rounded-xl border bg-background p-6 space-y-4">
        <div className="h-5 w-24 rounded bg-muted" />
        <div className="h-32 rounded bg-muted" />
      </div>
    </div>
  );
}
