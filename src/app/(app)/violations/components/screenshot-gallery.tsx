import Image from "next/image";

export function ScreenshotGallery({ paths }: { paths: string[] }) {
  if (!paths.length) {
    return (
      <div className="rounded-[1.5rem] border border-dashed border-zinc-300 bg-zinc-50 p-6 text-sm text-zinc-500">
        暂无截图
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {paths.map((path) => (
        <a
          key={path}
          href={`/api/violations/screenshot/${encodeURI(path)}`}
          target="_blank"
          rel="noreferrer"
          className="group relative aspect-[4/3] overflow-hidden rounded-[1.25rem] border border-zinc-200 bg-zinc-100"
        >
          <Image
            src={`/api/violations/screenshot/${encodeURI(path)}`}
            alt="违规案例截图"
            fill
            unoptimized
            sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            className="object-cover transition-transform group-hover:scale-[1.02]"
          />
        </a>
      ))}
    </div>
  );
}
