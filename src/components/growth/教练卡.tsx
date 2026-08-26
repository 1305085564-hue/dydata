import { Lightbulb, Sparkles } from "lucide-react";
import { 格式化为月日 } from "./断流横幅";
import { EditorialSidenote } from "@/components/editorial/editorial-quote";

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
    <section className="space-y-4 border-b border-[#ECE7DE]/80 pb-8">
      <div className="flex items-center gap-2.5">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#FAF8F4] border border-[#E5E0D6]">
          <Sparkles className="h-4 w-4 stroke-[1.75] text-[#D97757]" />
        </div>
        <div>
          <h3 className="font-serif tracking-tight text-base font-medium leading-tight text-[#1C1917]">下一条视频 · 一个建议</h3>
          <p className="mt-1 text-[12.5px] text-[#78716C]">样本攒够之前不给定性断言，只给团队验证过的写法参考。</p>
        </div>
      </div>

      <div className="rounded-xl border border-[#ECE7DE] bg-[#FAF8F4]/80 p-4">
        <p className="font-serif text-[13.5px] font-normal leading-[1.7] text-[#1C1917]">
          {advice}
        </p>
        <EditorialSidenote>
          写作者在起笔时，不妨让结论先行。前三秒抓住读者的注意力，后面的细节才有人愿意看。
        </EditorialSidenote>
      </div>

      {peer?.scriptSnippet ? (
        own ? (
          <div className="space-y-2">
            <span className="text-[13px] font-medium text-[#292524]">写法对照 · 团队验证过 vs 你最近一篇：</span>
            <div className="grid gap-2 md:grid-cols-2">
              <div className="space-y-1.5">
                <span className="text-[12.5px] text-[#78716C]">同事的写法 · {peer.name}</span>
                <blockquote className="whitespace-pre-wrap rounded-r-lg border-l-2 border-l-[#D97757] bg-[#B98A54]/10 p-3.5 text-[13px] not-italic leading-[1.6] text-[#292524]">
                  “{peer.scriptSnippet}”
                </blockquote>
              </div>
              <div className="space-y-1.5">
                <span className="text-[12.5px] text-[#78716C]">你的写法 · 最近一篇（{格式化为月日(own.reportDate)}）</span>
                <blockquote className="whitespace-pre-wrap rounded-r-lg border-l-2 border-l-[#E5E0D6] bg-[#F5F3EE] p-3.5 text-[13px] leading-[1.6] text-[#292524]">
                  “{own.snippet}”
                </blockquote>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <span className="text-[13px] font-medium text-[#292524]">
              示例 · 来自{peer.name}，团队验证过的写法：
            </span>
            <blockquote className="whitespace-pre-wrap rounded-r-lg border-l-2 border-l-[#D97757] bg-[#B98A54]/10 p-3.5 text-[13px] not-italic leading-[1.6] text-[#292524]">
              “{peer.scriptSnippet}”
            </blockquote>
          </div>
        )
      ) : null}
    </section>
  );
}

export { CoachCard as 教练卡 };
