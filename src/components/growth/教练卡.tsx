import { Lightbulb } from "lucide-react";
import { 格式化为月日 } from "./断流横幅";

interface CoachCardProps {
  /** 规则药方文案；窗口无数据时为 null，走通用第一原则兜底 */
  prescription: string | null;
  /** 示例句来源同事；没有对得上药方的真实片段时不展示示例区 */
  peer?: { name: string; scriptSnippet: string } | null;
  /** 用户最近一篇带文案日报的开头；与同事示例并排成对照，无同事示例时不单独展示 */
  own?: { reportDate: string; snippet: string } | null;
}

export function CoachCard({ prescription, peer, own }: CoachCardProps) {
  const advice =
    prescription ??
    "恢复日报同步后，这里会给出针对你数据的具体建议。通用第一原则：下一条开头 3 秒先抛结果，别先讲背景。";

  return (
    <section className="space-y-4 rounded-2xl border border-stone-200 bg-white p-5">
      <div className="flex items-center gap-2.5">
        <Lightbulb className="h-5 w-5 stroke-[1.5] text-[#8F641B]" />
        <div>
          <h3 className="text-[18px] font-medium leading-tight text-stone-900">下一条视频 · 一个建议</h3>
          <p className="mt-1 text-[12px] text-stone-500">样本攒够之前不给诊断，只给团队验证过的写法。</p>
        </div>
      </div>

      <p className="rounded-lg border border-stone-100 bg-stone-50/70 p-3 text-[13px] font-medium leading-[1.7] text-stone-900">
        {advice}
      </p>

      {peer?.scriptSnippet ? (
        own ? (
          <div className="space-y-2">
            <span className="text-[12px] font-medium text-stone-500">写法对照 · 团队验证过 vs 你最近一篇：</span>
            <div className="grid gap-2 md:grid-cols-2">
              <div className="space-y-1.5">
                <span className="text-[12px] text-stone-500">同事的写法 · {peer.name}</span>
                <blockquote className="whitespace-pre-wrap rounded-lg border border-stone-200 border-l-4 border-l-[#D97757] bg-stone-50/50 p-3.5 text-[12px] italic leading-[1.6] text-stone-700">
                  “{peer.scriptSnippet}”
                </blockquote>
              </div>
              <div className="space-y-1.5">
                <span className="text-[12px] text-stone-500">你的写法 · 最近一篇（{格式化为月日(own.reportDate)}）</span>
                <blockquote className="whitespace-pre-wrap rounded-lg border border-stone-200 border-l-4 border-l-stone-300 bg-stone-50/50 p-3.5 text-[12px] leading-[1.6] text-stone-700">
                  “{own.snippet}”
                </blockquote>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <span className="text-[12px] font-medium text-stone-500">
              示例 · 来自{peer.name}，团队验证过的写法：
            </span>
            <blockquote className="whitespace-pre-wrap rounded-lg border border-stone-200 border-l-4 border-l-[#D97757] bg-stone-50/50 p-3.5 text-[12px] italic leading-[1.6] text-stone-700">
              “{peer.scriptSnippet}”
            </blockquote>
          </div>
        )
      ) : null}
    </section>
  );
}

export { CoachCard as 教练卡 };
