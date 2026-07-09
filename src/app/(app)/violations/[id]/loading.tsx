export default function ViolationDetailLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-5 py-8">
      <div className="flex items-center justify-between">
        <div className="h-5 w-20 rounded bg-stone-100" />
        <div className="h-10 w-28 rounded-2xl bg-stone-100" />
      </div>
      <div className="rounded-xl border border-stone-200 bg-white p-6 sm:p-7 space-y-4">
        <div className="flex flex-wrap gap-2">
          <div className="h-6 w-16 rounded-full bg-stone-100" />
          <div className="h-6 w-16 rounded-full bg-stone-100" />
          <div className="h-6 w-12 rounded-full bg-stone-100" />
        </div>
        <div className="h-20 rounded bg-stone-100" />
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          <div className="h-4 w-24 rounded bg-stone-100" />
          <div className="h-4 w-32 rounded bg-stone-100" />
          <div className="h-4 w-28 rounded bg-stone-100" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-stone-200 bg-white p-5 space-y-2">
            <div className="h-4 w-20 rounded bg-stone-100" />
            <div className="h-8 w-16 rounded bg-stone-100" />
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-stone-200 bg-white p-5 space-y-3">
        <div className="h-5 w-32 rounded bg-stone-100" />
        <div className="h-24 rounded bg-stone-100" />
      </div>
      <div className="rounded-xl border border-stone-200 bg-white p-5 space-y-3">
        <div className="h-8 w-full rounded bg-stone-100" />
        <div className="h-32 rounded bg-stone-100" />
      </div>
    </div>
  );
}
