import { Info, Lock } from "lucide-react";

export interface VitalsCell {
  label: string;
  value: string;
  hint?: string;
  locked?: boolean;
  lockHint?: string;
  /** 白话口径解释，hover / 聚焦该格时浮出 */
  explanation?: string;
}

interface VitalsStripProps {
  cells: VitalsCell[];
  /** 口径说明（展示在条底部细线上方） */
  note?: string;
}

export function VitalsStrip({ cells, note }: VitalsStripProps) {
  return (
    <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
      <div className="grid grid-cols-2 gap-px bg-stone-100 sm:grid-cols-[repeat(auto-fit,minmax(150px,1fr))]">
        {cells.map((cell) => (
          <div
            key={cell.label}
            tabIndex={cell.explanation ? 0 : undefined}
            className="group relative bg-white px-4 py-4 outline-none"
          >
            <p className="flex items-center gap-1 text-[12px] text-stone-500">
              {cell.label}
              {cell.explanation ? (
                <Info className="h-3 w-3 text-stone-400 transition-colors group-hover:text-stone-600" aria-hidden />
              ) : null}
            </p>
            {cell.locked ? (
              <p className="mt-2 flex items-center gap-1.5 text-[13px] text-stone-400">
                <Lock className="h-3.5 w-3.5" />
                {cell.lockHint ?? "待解锁"}
              </p>
            ) : (
              <p className="mt-1 text-[18px] font-medium tabular-nums leading-tight text-stone-900">{cell.value}</p>
            )}
            {cell.hint ? <p className="mt-1 text-[12px] leading-[1.5] text-stone-500">{cell.hint}</p> : null}
            {cell.explanation ? (
              <span
                role="tooltip"
                className="pointer-events-none absolute bottom-full left-2 right-2 z-20 mb-1 hidden rounded-lg border border-stone-200 bg-stone-950 p-2.5 text-[12px] font-normal leading-[1.6] text-stone-100 shadow-lg group-hover:block group-focus-within:block"
              >
                {cell.explanation}
              </span>
            ) : null}
          </div>
        ))}
      </div>
      {note ? <p className="border-t border-stone-100 px-4 py-2 text-[12px] text-stone-500">{note}</p> : null}
    </section>
  );
}

export { VitalsStrip as 体征数据条 };
