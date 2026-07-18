interface ChaseBarProps {
  peerName: string;
  /** 维度指标名，如"完播率" */
  metricLabel: string;
  /** 同事指标值文本，如"43.7%" */
  peerValueText: string;
  /** 进度条填充比例 0–1 */
  peerRatio: number;
}

export function ChaseBar({ peerName, metricLabel, peerValueText, peerRatio }: ChaseBarProps) {
  const width = `${Math.round(Math.min(Math.max(peerRatio, 0), 1) * 100)}%`;

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <div className="flex items-baseline justify-between text-[13px]">
          <span className="font-medium text-stone-900">{peerName}</span>
          <span className="tabular-nums text-stone-700">{peerValueText}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-stone-100">
          <div className="h-full rounded-full bg-[#5F82A8]" style={{ width }} />
        </div>
        <p className="text-[12px] text-stone-500">团队最高{metricLabel}</p>
      </div>

      <div className="space-y-2">
        <div className="flex items-baseline justify-between text-[13px]">
          <span className="font-medium text-stone-500">你</span>
          <span className="text-[12px] text-stone-400">未解锁</span>
        </div>
        <div className="h-2 rounded-full border border-dashed border-stone-300 bg-stone-50" />
        <p className="text-[12px] leading-[1.6] text-stone-500">
          随日报积累自动解锁。解锁后目标只有一个：先追平他。
        </p>
      </div>
    </div>
  );
}

export { ChaseBar as 追赶条 };
