export default function Loading() {
  return (
    <div className="min-h-screen bg-[#F0F0F1]">
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
        <div className="h-32 animate-pulse rounded-2xl bg-zinc-100" />
        <div className="h-12 animate-pulse rounded-xl bg-zinc-100" />
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-zinc-100" />
          ))}
        </div>
      </div>
    </div>
  );
}
