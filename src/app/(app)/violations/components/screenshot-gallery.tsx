import Image from "next/image";
import { EmptyState } from "@/components/ui/empty-state";

export function ScreenshotGallery({
  paths,
  compact,
}: {
  paths: string[];
  compact?: boolean;
}) {
  if (!paths.length) {
    return (
      <div className="rounded-xl border border-dashed border-stone-300 bg-stone-50/60 py-8">
        <EmptyState title="暂无截图" description="上传截图后会在这里展示" />
      </div>
    );
  }

  if (compact) {
    return (
      <div className="flex flex-wrap gap-2">
        {paths.map((path) => (
          <a
            key={path}
            href={`/api/violations/screenshot/${encodeURI(path)}`}
            target="_blank"
            rel="noreferrer"
            className="group relative size-20 shrink-0 overflow-hidden rounded-lg border border-stone-200 bg-stone-100 active:translate-y-0"
          >
            <Image
              src={`/api/violations/screenshot/${encodeURI(path)}`}
              alt="违规案例截图"
              fill
              unoptimized
              sizes="80px"
              className="object-cover transition-transform group-hover:scale-105"
            />
          </a>
        ))}
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
          className="group relative aspect-[4/3] overflow-hidden rounded-xl border border-stone-200 bg-stone-100 active:translate-y-0"
        >
          <Image
            src={`/api/violations/screenshot/${encodeURI(path)}`}
            alt="违规案例截图"
            fill
            unoptimized
            sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            className="object-cover transition-transform group-hover:scale-105"
          />
        </a>
      ))}
    </div>
  );
}
