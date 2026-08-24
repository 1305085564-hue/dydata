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
          <span className="font-medium text-[#1C1917]">{peerName}</span>
          <span className="tabular-nums text-[#292524]">{peerValueText}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-[#F5F3EE]">
          <div className="h-full rounded-full bg-[#43718E]" style={{ width }} />
        </div>
        <p className="text-[12px] text-[#78716C]">团队最高{metricLabel}</p>
      </div>

      <div className="space-y-2">
        <div className="flex items-baseline justify-between text-[13px]">
          <span className="font-medium text-[#78716C]">你</span>
          <span className="text-[12px] text-[#78716C]">未解锁</span>
        </div>
        <div className="h-2 rounded-full border border-dashed border-[#E5E0D6] bg-[#FBF9F5]" />
        <p className="text-[12px] leading-[1.6] text-[#78716C]">
          随日报积累自动解锁。解锁后目标只有一个：先追平他。
        </p>
      </div>
    </div>
  );
}

export { ChaseBar as 追赶条 };
