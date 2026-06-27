export default function Loading() {
  return (
    <div className="space-y-6">
        <div className="h-32 animate-pulse rounded-2xl bg-zinc-100" />
        <div className="h-12 animate-pulse rounded-xl bg-zinc-100" />
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-zinc-100" />
          ))}
        </div>
    </div>
  );
}
