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
    <section className="border-b border-[#ECE7DE]/80 pb-8 space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fit,minmax(150px,1fr))]">
        {cells.map((cell) => (
          <div
            key={cell.label}
            tabIndex={cell.explanation ? 0 : undefined}
            className="group relative rounded-xl bg-[#F5F3EE] px-4 py-3.5 outline-none transition-colors hover:bg-[#ECE7DE]/60"
          >
            <p className="flex items-center gap-1 text-[12px] text-[#78716C]">
              {cell.label}
              {cell.explanation ? (
                <Info className="h-3 w-3 text-[#78716C] transition-colors group-hover:text-[#292524]" aria-hidden />
              ) : null}
            </p>
            {cell.locked ? (
              <p className="mt-2 flex items-center gap-1.5 text-[13px] text-[#78716C]">
                <Lock className="h-3.5 w-3.5" />
                {cell.lockHint ?? "待解锁"}
              </p>
            ) : (
              <p className="mt-1 text-lg font-medium tabular-nums leading-tight text-[#1C1917]">{cell.value}</p>
            )}
            {cell.hint ? <p className="mt-1 text-[12px] leading-[1.5] text-[#78716C]">{cell.hint}</p> : null}
            {cell.explanation ? (
              <span
                role="tooltip"
                className="pointer-events-none absolute bottom-full left-2 right-2 z-20 mb-1 hidden rounded-lg border border-[#E5E0D6] bg-[#1C1917] p-2.5 text-[12px] font-normal leading-[1.6] text-[#F5F3EE] shadow-claude-float group-hover:block group-focus-within:block"
              >
                {cell.explanation}
              </span>
            ) : null}
          </div>
        ))}
      </div>
      {note ? <p className="text-[12px] text-[#78716C] px-1">{note}</p> : null}
    </section>
  );
}

export { VitalsStrip as 体征数据条 };
