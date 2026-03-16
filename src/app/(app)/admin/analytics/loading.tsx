export default function AnalyticsLoading() {
  return (
    <div className="mx-auto max-w-5xl space-y-8 animate-pulse">
      <div className="h-8 w-32 rounded bg-muted" />
      <div className="rounded-xl border bg-background p-6 space-y-4">
        <div className="h-5 w-28 rounded bg-muted" />
        <div className="h-64 rounded bg-muted" />
      </div>
      <div className="rounded-xl border bg-background p-6 space-y-4">
        <div className="h-5 w-36 rounded bg-muted" />
        <div className="h-48 rounded bg-muted" />
      </div>
      <div className="rounded-xl border bg-background p-6 space-y-4">
        <div className="h-5 w-32 rounded bg-muted" />
        <div className="h-48 rounded bg-muted" />
      </div>
    </div>
  );
}
