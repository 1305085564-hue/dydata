export default function DashboardLoading() {
  return (
    <div className="mx-auto max-w-5xl space-y-8 animate-pulse">
      <div className="space-y-2">
        <div className="h-8 w-48 rounded bg-muted" />
        <div className="h-4 w-32 rounded bg-muted" />
      </div>
      <div className="rounded-xl border bg-background p-6 space-y-4">
        <div className="h-5 w-24 rounded bg-muted" />
        <div className="space-y-3">
          <div className="h-10 rounded bg-muted" />
          <div className="h-10 rounded bg-muted" />
          <div className="h-10 w-1/2 rounded bg-muted" />
        </div>
      </div>
      <div className="rounded-xl border bg-background p-6 space-y-4">
        <div className="h-5 w-24 rounded bg-muted" />
        <div className="h-48 rounded bg-muted" />
      </div>
      <div className="rounded-xl border bg-background p-6 space-y-4">
        <div className="h-5 w-32 rounded bg-muted" />
        <div className="h-32 rounded bg-muted" />
      </div>
    </div>
  );
}
