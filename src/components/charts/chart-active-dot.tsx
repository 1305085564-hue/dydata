"use client";

/**
 * 规范 2.3 折线点睛配方：焦点最新点
 * - 外圈 12px #D97757/10% 呼吸环
 * - 内芯 6px #D97757 实心
 */
export function ChartActiveDot(props: {
  cx?: number;
  cy?: number;
  payload?: unknown;
  value?: number;
}) {
  const { cx = 0, cy = 0 } = props;

  return (
    <g>
      {/* 呼吸环：r=12，10% 透明度，4s 周期 */}
      <circle
        cx={cx}
        cy={cy}
        r={12}
        fill="#D97757"
        fillOpacity={0.1}
      >
        <animate
          attributeName="r"
          values="10;14;10"
          dur="4s"
          repeatCount="indefinite"
        />
        <animate
          attributeName="fillOpacity"
          values="0.1;0.05;0.1"
          dur="4s"
          repeatCount="indefinite"
        />
      </circle>
      {/* 实心内芯：r=6 */}
      <circle cx={cx} cy={cy} r={6} fill="#D97757" />
    </g>
  );
}
